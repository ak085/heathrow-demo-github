# heathrow-demo — Heathrow Energy Intelligence Demo

Dashboard demo for Heathrow Airport. Five pages showing AI optimisation across chiller plant, AHUs, power substations, solar generation, and energy savings.

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

## Current status (as of 2026-07-01)

All stores and pages are written and building successfully. The app is running at port 8030.

**What is done:**
- `src/stores/ChillerStore.ts` — 3 chillers, COP/kW 288-point history, AI setpoints, FDD
- `src/stores/AHUStore.ts` — 6 AHUs, CO₂/filter/SAT, FDD
- `src/stores/PowerGridStore.ts` — 4 substations, demand history, PF tracking, heatmap data, FDD
- `src/stores/SolarStore.ts` — generation curve, export headroom, 288-point history
- `src/stores/SavingsStore.ts` — baseline vs actual, COP improvement, weekly bars
- `src/stores/index.ts` — RootStore wiring all stores
- `src/pages/LandingPage.tsx` — 5-tile Heathrow dashboard
- `src/pages/ChillerPage.tsx` — Overview / Details / AI Setpoints / Alarms tabs
- `src/pages/AHUPage.tsx` — Overview / CO₂ & Ventilation / AI Setpoints / Alarms tabs
- `src/pages/PowerGridPage.tsx` — Demand Profiles / Power Factor / Sub-Meters / Demand Heatmap / Alarms tabs
- `src/pages/SolarPage.tsx` — Live Generation / Export Management / History tabs
- `src/pages/SavingsPage.tsx` — AI Impact / FDD Summary tabs
- `src/pages/LoginPage.tsx` — Heathrow branded (purple)
- `src/App.tsx` — Heathrow brand, new routes and nav

**What still needs doing:**
- Create Gitea repo via API (see credentials in shell history / password manager)
- Then push: `git remote add origin http://ak101:PASSWORD@10.0.10.24:30008/ak101/heathrow-demo.git && git push -u origin main`
- The LoginPage edit (DBS→Heathrow) is NOT yet committed or rebuilt — do `docker compose build && docker compose up -d` after any further edits

**Uncommitted changes:**
- `frontend/src/pages/LoginPage.tsx` — DBS branding replaced with Heathrow (not yet committed)

## Pages

- `/` — Landing: 5 tiles (Chiller / AHUs / Power & Grid / Solar & Export / Energy Savings)
- `/chiller` — ChillerPage
- `/ahu` — AHUPage
- `/power` — PowerGridPage
- `/solar` — SolarPage
- `/savings` — SavingsPage
- `/users` — UsersPage (admin only, unchanged)

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
