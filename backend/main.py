from fastapi import FastAPI, HTTPException, Depends, status, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import JWTError, jwt
from typing import Optional, List
import sqlite3
import os
import secrets
import csv
import io
from datetime import datetime, timedelta, date, timezone
from zoneinfo import ZoneInfo

# ─── Config ──────────────────────────────────────────────────────────────────
# A committed signing key is the same as no login at all: anyone holding it can mint
# a valid admin token without touching the login form. Absent SECRET_KEY we generate a
# random one per process — the cost is that a restart invalidates existing sessions.
SECRET_KEY           = os.getenv("SECRET_KEY") or secrets.token_urlsafe(32)
ALGORITHM            = "HS256"
TOKEN_EXPIRE_HOURS   = 12
DB_PATH              = os.getenv("DB_PATH", "/data/users.db")
LOCAL_TZ             = ZoneInfo("Europe/London")

# Bulk CSV import: a blank password on a NEW user falls back to this known default
# (echoed back in the import response, overridable via DEFAULT_IMPORT_PASSWORD).
DEFAULT_IMPORT_PASSWORD = os.getenv("DEFAULT_IMPORT_PASSWORD", "Heathrow@123")
VALID_ROLES = {"admin", "viewer"}

# ─── App setup ───────────────────────────────────────────────────────────────
app = FastAPI(title="DBS Demo Auth", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

# ─── Database helpers ─────────────────────────────────────────────────────────
def get_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            username     TEXT    UNIQUE NOT NULL,
            password_hash TEXT   NOT NULL,
            display_name TEXT    NOT NULL,
            role         TEXT    NOT NULL DEFAULT 'viewer',
            enabled      INTEGER NOT NULL DEFAULT 1,
            created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
            password_expires_at TEXT
        )
    """)
    conn.commit()
    # Migrate existing DBs created before password_expires_at existed
    existing_cols = {row["name"] for row in conn.execute("PRAGMA table_info(users)")}
    if "password_expires_at" not in existing_cols:
        conn.execute("ALTER TABLE users ADD COLUMN password_expires_at TEXT")
        conn.commit()
    # Bootstrap admin account on first start
    if not conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone():
        conn.execute(
            "INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)",
            ("admin", pwd_context.hash("admin123"), "Administrator", "admin"),
        )
        conn.commit()
        print("[boot] Created default admin/admin123 — change this password immediately!")
    conn.close()

init_db()

# ─── Login rate limiting ──────────────────────────────────────────────────────
# Keyed on username, not IP: behind a reverse proxy every request carries the
# proxy's address, and trusting forwarded-IP headers would let an attacker spoof
# their way around the limit. A correct password clears the counter, so an honest
# typo costs nothing and locking one username never affects another.
MAX_FAILED_ATTEMPTS = 6
LOCKOUT_MINUTES     = 15
_failed_logins: dict[str, list[datetime]] = {}

def _recent_failures(username: str) -> list[datetime]:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=LOCKOUT_MINUTES)
    recent = [t for t in _failed_logins.get(username, []) if t > cutoff]
    if recent:
        _failed_logins[username] = recent
    else:
        _failed_logins.pop(username, None)
    return recent

def check_not_locked(username: str) -> None:
    recent = _recent_failures(username)
    if len(recent) >= MAX_FAILED_ATTEMPTS:
        wait = LOCKOUT_MINUTES - int((datetime.now(timezone.utc) - recent[0]).total_seconds() // 60)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed sign-in attempts. Try again in {max(wait, 1)} minute(s).",
        )

def record_failure(username: str) -> None:
    _failed_logins.setdefault(username, []).append(datetime.now(timezone.utc))

def clear_failures(username: str) -> None:
    _failed_logins.pop(username, None)

# ─── Auth helpers ─────────────────────────────────────────────────────────────
def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)

def expiry_date_to_utc(expiry_date: Optional[str]) -> Optional[str]:
    """Convert a 'YYYY-MM-DD' local (Europe/London) calendar date into the UTC
    instant of that day's local midnight, i.e. the moment the password stops working."""
    if not expiry_date:
        return None
    d = date.fromisoformat(expiry_date)
    local_midnight = datetime(d.year, d.month, d.day, tzinfo=LOCAL_TZ)
    return local_midnight.astimezone(timezone.utc).isoformat()

def is_password_expired(row) -> bool:
    expires_at = row["password_expires_at"]
    if not expires_at:
        return False
    return datetime.now(timezone.utc) >= datetime.fromisoformat(expires_at)

def resolve_expiry(expiry_date: Optional[str]) -> Optional[str]:
    """Validate an incoming 'YYYY-MM-DD' expiry date and convert it to a UTC timestamp.
    Raises 400 if the date is malformed or already in the past."""
    if not expiry_date:
        return None
    try:
        utc_ts = expiry_date_to_utc(expiry_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid expiry date format, expected YYYY-MM-DD")
    if datetime.fromisoformat(utc_ts) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Expiry date must be in the future")
    return utc_ts

def create_token(data: dict) -> str:
    payload = {**data, "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub", "")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM users WHERE username = ? AND enabled = 1", (username,)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="User not found or disabled")
    if is_password_expired(row):
        raise HTTPException(status_code=401, detail="Password expired")
    return dict(row)

def require_admin(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ─── Schemas ──────────────────────────────────────────────────────────────────
class UserOut(BaseModel):
    id:                   int
    username:             str
    display_name:         str
    role:                 str
    enabled:              bool
    created_at:           str
    password_expires_at:  Optional[str] = None  # UTC ISO timestamp, or null if no expiry

class CreateUser(BaseModel):
    username:            str
    password:            str
    display_name:        str
    role:                str = "viewer"
    password_expires_at: Optional[str] = None  # 'YYYY-MM-DD', local (Europe/London) date

class UpdateUser(BaseModel):
    display_name:          Optional[str]  = None
    role:                  Optional[str]  = None
    enabled:               Optional[bool] = None
    password_expires_at:   Optional[str]  = None  # 'YYYY-MM-DD' to set a new expiry
    clear_password_expiry: bool           = False  # set true to remove any existing expiry

class ResetPassword(BaseModel):
    new_password:         str
    password_expires_at:  Optional[str] = None  # 'YYYY-MM-DD', local (Europe/London) date

# ─── Endpoints ────────────────────────────────────────────────────────────────
@app.post("/api/auth/token")
def login(form: OAuth2PasswordRequestForm = Depends()):
    check_not_locked(form.username)
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM users WHERE username = ? AND enabled = 1", (form.username,)
    ).fetchone()
    conn.close()
    if not row or not verify_password(form.password, row["password_hash"]):
        record_failure(form.username)
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    if is_password_expired(row):
        raise HTTPException(status_code=400, detail="Password expired — contact an admin to reset it")
    clear_failures(form.username)
    token = create_token({"sub": row["username"], "role": row["role"]})
    return {
        "access_token":        token,
        "token_type":          "bearer",
        "role":                row["role"],
        "display_name":        row["display_name"],
        "password_expires_at": row["password_expires_at"],
    }

@app.get("/api/auth/me")
def me(user=Depends(get_current_user)):
    return {
        "username":             user["username"],
        "display_name":         user["display_name"],
        "role":                 user["role"],
        "password_expires_at":  user["password_expires_at"],
    }

@app.get("/api/users", response_model=List[UserOut])
def list_users(admin=Depends(require_admin)):
    conn = get_db()
    rows = conn.execute("SELECT * FROM users ORDER BY id").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/users", response_model=UserOut, status_code=201)
def create_user(body: CreateUser, admin=Depends(require_admin)):
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    expires_at = resolve_expiry(body.password_expires_at)
    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO users (username, password_hash, display_name, role, password_expires_at)
               VALUES (?, ?, ?, ?, ?)""",
            (body.username, hash_password(body.password), body.display_name, body.role, expires_at),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE username = ?", (body.username,)).fetchone()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Username already exists")
    finally:
        conn.close()
    return dict(row)

@app.put("/api/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UpdateUser, admin=Depends(require_admin)):
    new_expiry = resolve_expiry(body.password_expires_at) if body.password_expires_at is not None else None
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    updates: dict = {}
    if body.display_name is not None: updates["display_name"] = body.display_name
    if body.role          is not None: updates["role"]         = body.role
    if body.enabled       is not None: updates["enabled"]      = 1 if body.enabled else 0
    if body.clear_password_expiry:
        updates["password_expires_at"] = None
    elif body.password_expires_at is not None:
        updates["password_expires_at"] = new_expiry
    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE users SET {set_clause} WHERE id = ?", (*updates.values(), user_id))
        conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row)

@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: int, admin=Depends(require_admin)):
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    if row["username"] == admin["username"]:
        conn.close()
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()

@app.post("/api/users/{user_id}/reset-password")
def reset_password(user_id: int, body: ResetPassword, admin=Depends(require_admin)):
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    expires_at = resolve_expiry(body.password_expires_at) if body.password_expires_at is not None else None
    conn = get_db()
    if not conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    if body.password_expires_at is not None:
        conn.execute(
            "UPDATE users SET password_hash = ?, password_expires_at = ? WHERE id = ?",
            (hash_password(body.new_password), expires_at, user_id),
        )
    else:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(body.new_password), user_id),
        )
    conn.commit()
    conn.close()
    return {"ok": True}


# ─── Bulk CSV user import ─────────────────────────────────────────────────────
def _import_expiry_to_iso(value: str) -> str:
    """Parse an import expiry date to the YYYY-MM-DD that resolve_expiry expects. The
    documented format is day-first DD-MM-YYYY, but we also accept the slash and
    2-digit-year variants Excel silently rewrites (e.g. 1/1/2027), plus ISO."""
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%d-%m-%y", "%d/%m/%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue
    raise HTTPException(status_code=400, detail="Invalid expiry date format — use DD-MM-YYYY (e.g. 31-12-2027)")


def _parse_import_file(filename: str, content: bytes) -> list[dict]:
    """Parse an uploaded CSV user list into a list of row dicts."""
    if not (filename or "").lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Unsupported file type — upload a .csv file")
    try:
        text = content.decode("utf-8-sig")  # tolerate a BOM from Excel-exported CSV
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 text")
    return list(csv.DictReader(io.StringIO(text)))


@app.post("/api/users/import")
async def import_users(file: UploadFile = File(...), admin=Depends(require_admin)):
    """Bulk create/update users from a CSV. Upsert by username: an existing user is
    updated (password only if the row supplies one); a new user with no password gets
    DEFAULT_IMPORT_PASSWORD. One bad row is reported, not fatal."""
    content = await file.read()
    try:
        rows = _parse_import_file(file.filename, content)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")

    results: list[dict] = []
    seen: set = set()
    created = updated = errors = 0
    conn = get_db()
    try:
        for i, raw in enumerate(rows, start=1):
            def fail(detail: str, username: str = "") -> None:
                nonlocal errors
                results.append({"row": i, "username": username, "action": "error", "detail": detail})
                errors += 1

            if not isinstance(raw, dict):
                fail("Row is not an object"); continue
            username = str(raw.get("username", "") or "").strip()
            display_name = str(raw.get("display_name", "") or "").strip()
            role = (str(raw.get("role", "") or "").strip() or "viewer").lower()
            password = str(raw.get("password", "") or "").strip()
            expiry = str(raw.get("password_expires_at", "") or "").strip() or None

            if not username:
                fail("Missing username"); continue
            if username in seen:
                fail("Duplicate username within file", username); continue
            seen.add(username)
            if role not in VALID_ROLES:
                fail(f"Invalid role '{role}' (use admin or viewer)", username); continue
            if not display_name:
                display_name = username
            try:
                expires_at = resolve_expiry(_import_expiry_to_iso(expiry)) if expiry else None
            except HTTPException as e:
                fail(str(e.detail), username); continue
            if password and len(password) < 6:
                fail("Password must be at least 6 characters", username); continue

            existing = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
            if existing:
                sets: dict = {"display_name": display_name, "role": role, "password_expires_at": expires_at}
                if password:
                    sets["password_hash"] = hash_password(password)
                clause = ", ".join(f"{k} = ?" for k in sets)
                conn.execute(f"UPDATE users SET {clause} WHERE username = ?", (*sets.values(), username))
                results.append({"row": i, "username": username, "action": "updated",
                                "detail": "password changed" if password else "kept existing password"})
                updated += 1
            else:
                used_default = not password
                pw = password or DEFAULT_IMPORT_PASSWORD
                conn.execute(
                    "INSERT INTO users (username, password_hash, display_name, role, password_expires_at) VALUES (?, ?, ?, ?, ?)",
                    (username, hash_password(pw), display_name, role, expires_at),
                )
                results.append({"row": i, "username": username, "action": "created",
                                "detail": "default password" if used_default else "password set"})
                created += 1
        conn.commit()
    finally:
        conn.close()

    return {
        "summary": {"total": len(rows), "created": created, "updated": updated, "errors": errors},
        "default_password": DEFAULT_IMPORT_PASSWORD,
        "results": results,
    }
