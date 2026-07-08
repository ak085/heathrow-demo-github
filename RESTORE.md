# Restore: heathrow-demo

Airport Energy Intelligence demo (fork of the bank-demo/dbs-demo scaffold, rebranded
for Heathrow) — React + MobX + Ant Design SPA served by Nginx (port 8030), with a
FastAPI auth backend (internal port 8000).

## Two independent deployments — don't confuse them

- **CT 106 "Workbench" (10.0.60.11)** — dev copy, this checkout. Source of truth is
  **Gitea** (`ak101/heathrow-demo.git`). Internal LAN only.
- **DMZ box** — customer-facing copy. Dev + demo server in one, outbound-internet-only
  (no LAN/Gitea access), so it backs up to a **private GitHub repo**
  (`ak085/heathrow-demo-github.git`) via a dedicated SSH deploy key instead —
  see `DEPLOY_KEYS.md`.

These are two separate git histories on two separate remotes. Pulling GitHub content
into this CT 106 copy (done 2026-07-08) is a deliberate one-off merge, not a standing
sync — don't assume the two stay in lockstep automatically.

## Prerequisites

```bash
mkdir -p data   # only relevant if reverting to the old bind-mount volume; see Notes
```

## Restore from Gitea (CT 106 / this checkout)

```bash
git clone http://10.0.10.24:30008/ak101/heathrow-demo.git
cd heathrow-demo

docker compose up -d --build
```

The admin user is created automatically on first start (check backend logs for initial credentials).

## Verify

```bash
# Open http://<HOST_IP>:8030 in browser — landing page with 5 tiles
# (Chiller Plant / AHUs / Power & Grid / Solar & Export / Energy Savings)
# Log in with admin credentials to access all pages
```

## Notes

- Binds to `0.0.0.0:8030`
- All equipment data is simulated in MobX stores — no real BMS connection
- Uses Ant Design (inherited from the bank-demo scaffold's platform-integration target)
- Auth DB now lives in a **named Docker volume** `heathrow_db` (not a host bind mount)
  — `docker compose down -v` will destroy it, plain `down`/`up` will not
- No external Docker network — this app is self-contained (unlike bank-demo, which
  joins the shared `aihvac-net`)
