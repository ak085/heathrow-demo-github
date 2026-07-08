# Task: Complete Heathrow Demo Build

Working directory: /home/ak101/heathrow-demo

The scaffold is already done (copied from dbs-demo, DBS files removed).
You need to write all new stores and pages, wire them into App.tsx, then build and start.

## Brand
- Primary colour: #5a0057 (Heathrow deep purple)
- Brand text: "Heathrow" / "Energy Intelligence"
- Sidebar brand bg: #5a0057
- ConfigProvider colorPrimary: '#5a0057'
- Replace every '#a80000' and '#cf1322' (DBS red) with '#5a0057'

## Pages to build (5 equipment pages + keep Login + Users)

Routes:
- /            → LandingPage  (rewrite)
- /chiller     → ChillerPage  (new)
- /ahu         → AHUPage      (new)
- /power       → PowerGridPage (new — MOST IMPORTANT for the consultant)
- /solar       → SolarPage    (new)
- /savings     → SavingsPage  (new)
- /users       → UsersPage    (keep as-is)

## Stores to write

### ChillerStore.ts
Chillers: 3 units — CH-01 (T2 Plant Room), CH-02 (T2 Plant Room), CH-03 (T3 Plant Room)
Each chiller instance has:
- id, name, location
- kw: number (range 800–1500, airport scale)
- cop: number (derived: coolingKw / kw, range 3.5–6.0)
- chwST: number (CHW supply temp °C, AI setpoint ~7°C, actual 6.5–8.5)
- chwRT: number (CHW return temp °C, 11–14)
- chwSP: number (AI setpoint for chwST — what the AI is commanding)
- cwST: number (CW supply temp °C, 28–32)
- cwRT: number (CW return temp °C, 34–38)
- cwSP: number (AI setpoint for CW supply — what the AI is commanding)
- load: number (% 30–100)
- runHours: number (cumulative)
- fanSpeed: number (cooling tower fan speed %, 40–100)
- pumpSpeed: number (CHW pump VFD %, 40–100)
- health: 'ok' | 'warning' | 'critical' (computed)

AI setpoints tick independently — chwSP drifts within ±1.5°C of a base 7.0°C driven by outdoor temp and load.
Cooling tower cwSP driven by outdoor wetbulb (estimated from temp/RH).

Sub-meters (computed from sum of chiller kw):
- chillerPlantKw: number (sum of all chiller kw)
- airsideKw: number (separate sim, AHU fans + FCU total, 120–350 kW)
- mechFanKw: number (HVLS + ventilation fans, 40–90 kW)

allFindings: FDD array — heat balance check, flow consistency, approach temp alert.

### AHUStore.ts
AHUs: 6 units:
- AHU-T1-01 (T1 Arrivals Hall)
- AHU-T1-02 (T1 Departures)
- AHU-T2-01 (T2 Departures Gate A)
- AHU-T2-02 (T2 Departures Gate B)
- AHU-T3-01 (T3 Main Hall)
- AHU-T5-01 (T5 Satellite)

Each AHU instance:
- id, name, zone
- sat: number (supply air temp °C, actual, 12–18)
- satSP: number (AI setpoint for SAT, 13–16)
- rat: number (return air temp °C, 22–27)
- co2: number (ppm, 400–1100)
- freshAirSpeed: number (% — rises with CO2)
- fanSpeed: number (% 40–100)
- fanSP: number (AI setpoint for fan speed)
- chwValve: number (% open 0–100)
- zoneTemp: number (°C, 23–28)
- zoneTempSP: number (target 27°C normal, 25°C when HVLS off)
- hlvsOn: boolean (HVLS fan running)
- health: 'ok' | 'warning' | 'critical'
- filterDP: number (Pa, 80–230)

allFindings: high CO2 (>1000ppm), high filter DP (>200Pa), SAT deviation >2°C from setpoint.

### PowerGridStore.ts
Substations: 4 — T1-Main, T2-Main, T3-Main, T5-Main
Each substation:
- id, name
- kw: number (T1: 800–1800, T2: 600–1400, T3: 500–1200, T5: 1200–2200)
- pf: number (power factor 0.82–0.98)
- pfHealth: 'ok' | 'warning' | 'critical' (ok: pf>=0.92, warning: 0.85–0.92, critical: <0.85)
- current: number (A)
- voltage: number (V, 11000 for HV substations)
- todayKwh: number (cumulative)

Sub-meters (same as chiller store, reference it or duplicate):
- chillerPlantKw: 800–1500
- airsideKw: 120–350
- mechFanKw: 40–90
- totalBuildingKw: sum

History arrays:
- demandHistory: 288 points (24h × 5-min) per substation — used for trend charts
- Generate at store init using time-of-day sine curve (peak 08:00–12:00 and 14:00–18:00 for airport)

allFindings: PF < 0.85 → critical, PF < 0.92 → warning, high demand (>90% of rated).

### SolarStore.ts
Single solar array (BA Hangar solar, T5 roof combined):
- generationKw: number (0–800 kW, follows solar irradiance curve — zero before 06:00 and after 19:00)
- siteConsumptionKw: number (total building — from PowerGridStore total)
- exportKw: number (max(0, generationKw - siteConsumptionKw) — but in practice site always consumes more)
- exportLimitKw: number = 200 (hard cap — HAL's grid export limit)
- headroomKw: number (exportLimitKw - exportKw)
- headroomHealth: 'ok' | 'warning' | 'critical' (ok: headroom>80, warning: 20–80, critical: <20)
- todayGenerationKwh: number (cumulative)
- todaySavingsGbp: number (todayGenerationKwh × 0.25)
- history: 288-point arrays for generation, consumption, export

allFindings: export limit at risk (<20 kW headroom → critical alert).

### SavingsStore.ts
Tracks AI optimisation impact:
- baselineDailyKwh: number (~18000 kWh/day airport baseline)
- actualDailyKwh: number (baseline × (0.82–0.88) — 12–18% saving)
- savingsPct: number
- savingsKwhToday: number
- savingsGbpToday: number (× 0.25)
- copBaseline: number (3.8)
- copActual: number (4.4–5.2)
- copImprovement: number (%)
- weeklyBarData: array of {day, baseline, actual} for last 7 days
- allFindings: from other stores aggregated (open faults count)
- fddSummary: { open: number, resolvedThisWeek: number, criticalOpen: number }

### stores/index.ts (rewrite)
```typescript
import { createContext, useContext } from 'react'
import { makeAutoObservable } from 'mobx'
import { ChillerStore } from './ChillerStore'
import { AHUStore } from './AHUStore'
import { PowerGridStore } from './PowerGridStore'
import { SolarStore } from './SolarStore'
import { SavingsStore } from './SavingsStore'

export class RootStore {
  chiller   = new ChillerStore()
  ahu       = new AHUStore()
  power     = new PowerGridStore()
  solar     = new SolarStore()
  savings   = new SavingsStore()
  darkMode  = false

  constructor() { makeAutoObservable(this) }
  toggleDark() { this.darkMode = !this.darkMode }
}

export const rootStore = new RootStore()
const StoreContext = createContext(rootStore)
export const useStore = () => useContext(StoreContext)
export { ChillerStore, AHUStore, PowerGridStore, SolarStore, SavingsStore }
```

## Pages to write

### LandingPage.tsx (rewrite)
5 tiles using same Card pattern as dbs-demo:
1. Chiller Plant — icon ThunderboltOutlined, purple tones, path /chiller
   subtitle: "3 Water-Cooled Chillers — T2 & T3 Plant Rooms"
   tag: "3 Chillers"
2. AHUs — icon CloudOutlined (or DashboardOutlined), path /ahu
   subtitle: "6 Air Handling Units — T1 / T2 / T3 / T5"
   tag: "6 AHUs"
3. Power & Grid — icon BankOutlined (or ControlOutlined), path /power, PURPLE highlight border
   subtitle: "4 Substations — Demand, Power Factor & Sub-Meters"
   tag: "4 Substations" — make this card slightly larger / visually prominent
4. Solar & Export — icon SunOutlined, path /solar
   subtitle: "Embedded Generation — Export Limit Management"
   tag: "800 kW Peak"
5. Energy Savings — icon RiseOutlined (or LineChartOutlined), path /savings
   subtitle: "AI Optimisation Impact — Baseline vs Actual"
   tag: "AI Active"

Header: "Heathrow Energy Intelligence" / "AiHVAC Platform — Terminal Energy Management"
Footer: "Demo — all data simulated. Live integration via BMS (Trend / Honeywell) available."

### ChillerPage.tsx
Tabs: Overview | Details | AI Setpoints | Alarms

Overview tab:
- Summary stat cards: Total Plant kW | Avg COP | CHW Supply Temp | CW Supply Temp
- Status table: chiller name, location, kW, COP, load%, CHW ΔT, cwST, health badge
- Cooling tower sub-section: fan speed % per chiller

Details tab:
- ECharts line chart: 24h history of COP for all 3 chillers (3 lines)
- ECharts line chart: 24h history of plant kW

AI Setpoints tab:
- For each chiller: two stat cards side by side — "CHW Setpoint (AI)" vs "CHW Actual", "CW Setpoint (AI)" vs "CW Actual"
- Show setpoint as a blue badge, actual as plain text
- Explanation text: "The AI adjusts CHW and CW setpoints every 5 min based on load, outdoor conditions and historical efficiency data."

Alarms tab:
- FDD findings table — same pattern as dbs-demo FDDPanel

### AHUPage.tsx
Tabs: Overview | CO₂ & Ventilation | AI Setpoints | Alarms

Overview tab:
- Summary cards: AHUs in normal operation | Avg SAT | Avg Zone Temp | Filter DP alerts
- Table: AHU name, zone, SAT (actual vs setpoint delta), fan speed, CHW valve%, zone temp, HVLS status, health

CO₂ & Ventilation tab:
- ECharts line chart: CO₂ ppm for all 6 AHUs (show how fresh air fan ramps with CO₂)
- ECharts line chart: Fresh air fan speed % overlay

AI Setpoints tab:
- Per AHU: SAT setpoint (AI) vs actual, Fan speed setpoint (AI) vs actual
- Explanation: "SAT setpoint is adjusted to balance cooling load vs zone comfort. Fan setpoint tracks CO₂ to minimise fresh air energy while maintaining IAQ."

Alarms tab: FDD findings (high CO₂, high filter DP, SAT deviation)

### PowerGridPage.tsx  ← MOST IMPORTANT, MAKE THIS EXCELLENT
Tabs: Demand Profiles | Power Factor | Sub-Meters | Demand Heatmap

Demand Profiles tab:
- ECharts line chart: 24h demand (kW) for all 4 substations — 4 coloured lines
- Time axis: 00:00–24:00, 5-min resolution
- Current demand stat cards: one per substation, show kW and peak today
- Total building kW large stat at top

Power Factor tab:
- THIS IS THE CONSULTANT'S MAIN CONCERN — make it visually clear
- Gauge or progress bar per substation showing PF (0.80–1.00)
- Clear colour banding: green ≥0.92, amber 0.85–0.92, red <0.85
- Alert banner when any substation PF < 0.85: "Power Factor Alert — T1-Main: 0.83 — Exceeds threshold"
- Explanation card: "Low power factor increases apparent power demand and can trigger network charges. Target: PF ≥ 0.92"
- Small ECharts chart: PF trend over 24h for each substation

Sub-Meters tab:
- Stacked bar chart (ECharts): today's kWh by category — Chiller Plant | Airside (AHU) | Mechanical Fans | Other
- Total building kWh today stat card
- Three sub-meter stat cards: Chiller Plant kWh | Airside kWh | Mechanical Fan kWh

Demand Heatmap tab:
- ECharts heatmap: X-axis = hour of day (0–23), Y-axis = day of week (Mon–Sun)
- Value = average demand intensity (simulated from history)
- Shows peak patterns for airport (morning bank + afternoon bank)
- Title: "Demand Pattern — Last 7 Days (T1 Main)"

### SolarPage.tsx
Tabs: Live Generation | Export Management | History

Live Generation tab:
- Large stat cards at top: Generating Now (kW) | Today's Generation (kWh) | Today's Savings (£)
- ECharts area chart: generation vs site consumption (24h) — two areas, generation fills under the site consumption line
- "Self-consumption rate" stat: what % of generation is consumed on site (always high for airport)

Export Management tab:
- THIS IS THE KEY DIFFERENTIATOR — make it clear and visual
- Large "Export Headroom" indicator: big number showing kW available before export limit
- Colour: green > 80 kW headroom, amber 20–80 kW, red <20 kW
- ECharts gauge or progress: Export (kW) vs Export Limit (200 kW)
- Alert banner (when headroom < 20 kW): "Export Limit Risk — Reduce generation or increase site load"
- Explanation card: "HAL's grid connection has a 200 kW export limit. Exceeding this prevents further solar connections (e.g. BA Hangar arrays). AiHVAC monitors this in real time."
- Small chart: export kW trend over day with limit line overlaid

History tab:
- ECharts bar chart: daily generation kWh last 7 days
- Cumulative savings £ this month

### SavingsPage.tsx
Tabs: AI Impact | FDD Summary

AI Impact tab:
- Headline stat: "Estimated saving today: £X" (large, prominent)
- kWh saved today vs baseline
- % improvement
- ECharts bar chart: last 7 days — grouped bars (baseline kWh vs actual kWh), side by side per day
- COP improvement: before/after stat cards
- Annualised projection card: "At this rate: £X,XXX/year"

FDD Summary tab:
- Summary cards: Open Faults | Critical | Warnings | Resolved This Week
- Table of all active findings across all systems (aggregated from all stores)

## App.tsx changes
- Replace '#a80000' brand header with '#5a0057'
- Replace colorPrimary '#cf1322' with '#5a0057'
- Import and add routes for all 5 new pages
- Sidebar nav items (replace vrv/lighting/btu with):
  - /chiller → ThunderboltOutlined → "Chiller Plant"
  - /ahu → CloudOutlined → "AHUs"
  - /power → BankOutlined → "Power & Grid"
  - /solar → SunOutlined → "Solar & Export"
  - /savings → RiseOutlined → "Energy Savings"
- Brand header: show "Heathrow" (white text on #5a0057)
- DEMO MODE tag: keep it
- System status dot: use overallHealth across all stores

## After writing all files:
1. Run: cd /home/ak101/heathrow-demo && docker compose build
2. Run: docker compose up -d
3. Test: curl -s -o /dev/null -w "%{http_code}" http://localhost:8030
4. Init git: git init && git add . && git commit -m "initial: heathrow-demo scaffold — 5-page energy intelligence demo"
5. Push to GitHub: git remote add origin https://github.com/ak085/heathrow-demo-github.git && git push -u origin master (auth via PAT in ~/.git-credentials)

## Reference: data patterns
```typescript
// Time-of-day load curve (airport: two peaks — morning + afternoon)
const hour = new Date().getHours()
const min = new Date().getMinutes()
const t = hour + min / 60
// Airport demand: peak 07:00–10:00 and 14:00–18:00
const load = 0.45 + 0.35 * (
  Math.exp(-0.5 * ((t - 8.5) / 1.5) ** 2) +   // morning peak
  Math.exp(-0.5 * ((t - 16) / 2) ** 2)          // afternoon peak
)

// Gaussian noise
function gaussian(mean: number, std: number): number {
  return mean + std * Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random())
}

// 288-point history (24h × 5min)
function generateHistory(baseFn: (t: number) => number, noise: number): number[] {
  return Array.from({ length: 288 }, (_, i) => {
    const t = i * (24 / 288)
    return Math.max(0, gaussian(baseFn(t), noise))
  })
}
```

## FDD findings pattern (from existing types/fdd.ts — do not change this file)
Look at types/fdd.ts and FDDPanel.tsx to understand the Finding type, then use the same pattern in stores.
