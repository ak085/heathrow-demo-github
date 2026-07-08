# heathrow-demo — Heathrow Energy Intelligence Demo

Dashboard demo for Heathrow Airport. Pages showing AI optimisation across chiller plant, AHUs, power substations, solar generation, tenant billing, lighting, alarms, and energy savings.

**Two independent deployments — see RESTORE.md before assuming which one you're on.**
This checkout (CT 106, `/home/ak101/heathrow-demo`) is the **dev copy**, source of truth
is **Gitea** (`ak101/heathrow-demo.git`). There is a separate **DMZ-hosted customer-facing
copy** with its own git history that backs up to a private GitHub repo instead of Gitea
(see `DEPLOY_KEYS.md`) — don't confuse the two or assume they're in sync.

## Brand

- Primary colour: `#5a0057` (Heathrow deep purple)
- Brand text: "Heathrow" / "Energy Intelligence"
- ConfigProvider colorPrimary: `#5a0057`
- No DBS red (`#a80000` / `#cf1322`) anywhere — all replaced

## Stack

| Layer | Technology |
|---|---|
| UI framework | React 18 |
| State | MobX 6 (`makeAutoObservable`) |
| UI components | Ant Design 5 |
| Charts | Apache ECharts 5 via `echarts-for-react` |
| Build | Webpack 5 |
| Server | nginx (static SPA) |

**Important:** This project uses Ant Design — do **not** replace with Tremor or Next.js.

## Ports

| Service | Port |
|---|---|
| Frontend | localhost:8030 (also via Traefik if wired) |

## Current status (as of 2026-07-08)

All stores and pages are written and building successfully. The app is running at port 8030.
Content on this CT 106 checkout was synced from the DMZ deployment's GitHub backup
(`ak085/heathrow-demo-github.git`) on 2026-07-08 — see RESTORE.md for what that means
and doesn't mean (it's a one-off merge, not a standing sync).

**Hero images:** each equipment page carries reference-design/marketing images via the
shared `src/components/PageHeroImage.tsx` component, sourced from `public/assets/*.png`
(copied into `dist/assets/` by the frontend's `npm run build` script — no webpack
asset-loader involved, see `frontend/package.json`). Landing page centers one `size="large"`
image above the header; equipment pages place a `size="compact"` image side-by-side with
live stat cards inside the Overview tab (see ChillerPage.tsx for the reference pattern).
This is the placement convention `bank-demo` was asked to match (2026-07-08).

## Pages

- `/` — Landing: 5 tiles (Chiller / AHUs / Power & Grid / Solar & Export / Energy Savings)
- `/chiller` — ChillerPage
- `/ahu` — AHUPage
- `/power` — PowerGridPage
- `/solar` — SolarPage
- `/savings` — SavingsPage
- `/tenant` — TenantPage
- `/lighting` — LightingPage
- `/lighting-control` — LightingControlPage
- `/alarms` — AlarmsPage
- `/users` — UsersPage (admin only)

## How to build & run

```bash
cd /home/ak101/heathrow-demo
docker compose build
docker compose up -d
```

Check logs:
```bash
docker logs heathrow-demo
```

Test:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8030
```

## Data

All data is **mock/simulated** — generated in MobX stores (`src/stores/`). Values update every 5 seconds via `setInterval`. No backend BMS connection.

Airport load curve (two peaks — morning 07:00–10:00 and afternoon 14:00–18:00):
```typescript
const load = 0.45 + 0.35 * (
  Math.exp(-0.5 * ((t - 8.5) / 1.5) ** 2) +
  Math.exp(-0.5 * ((t - 16) / 2) ** 2)
)
```

## FDD pattern

Use `src/types/fdd.ts` (`Finding` type) and `src/components/FDDPanel.tsx` for all fault display — do not change these files.
