export interface AuthUser {
  username:           string
  role:               'admin' | 'viewer'
  displayName:        string
  passwordExpiresAt:  string | null
}

const TOKEN_KEY = 'dbs_auth_token'
const USER_KEY  = 'dbs_auth_user'

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function saveAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

/** POST /api/auth/token — returns the authenticated user on success */
export async function apiLogin(username: string, password: string): Promise<AuthUser> {
  const body = new URLSearchParams({ username, password })
  const res  = await fetch('/api/auth/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail || 'Login failed')
  }
  const data = await res.json()
  const user: AuthUser = {
    username,
    role:              data.role as 'admin' | 'viewer',
    displayName:       data.display_name,
    passwordExpiresAt: data.password_expires_at ?? null,
  }
  saveAuth(data.access_token, user)
  return user
}

/** Returns Authorization header object, or empty if no token */
export function authHeaders(): Record<string, string> {
  const token = getStoredToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
