import { makeAutoObservable } from 'mobx'
import type { Finding } from '../types/fdd'
import { gaussian, genHistory, MAX_HISTORY_DAYS } from '../utils/history'

function clamp(min: number, max: number, v: number) { return Math.max(min, Math.min(max, v)) }
const TARIFF_GBP_PER_KWH = 0.25

// ─── Main incoming meter — LV distribution board feeding the whole lighting system ──────────
// Same derivation technique as PowerGridStore's Substation (phase V/I with small imbalance
// noise, THD derived from an actual harmonic spectrum) but kept local rather than shared: only
// two call sites exist even after this, and duplicating ~20 lines is lower-risk here than
// refactoring the already-verified PowerGridStore code for a single second use.
export interface Harmonic { order: number; pct: number }

export interface LightingMainMeter {
  voltage: number // 415V nominal LV three-phase — NOT the 11kV HV substations; a lighting
                   // distribution board is fed from a local LV panel, not the HV network directly
  vL1: number; vL2: number; vL3: number
  iL1: number; iL2: number; iL3: number
  kw: number; kvar: number; kva: number
  pf: number
  freq: number
  voltageUnbalance: number
  currentUnbalance: number
  harmonicsV: Harmonic[]
  harmonicsI: Harmonic[]
  thdV: number
  thdI: number
}

// LED/DALI switch-mode drivers are a well-known harmonic-distortion source — current THD here
// runs meaningfully higher than the general HV building load seen on Power & Grid's substations.
const LT_I_HARMONIC_BASE: Record<number, number> = { 3: 10.0, 5: 6.0, 7: 3.5, 9: 2.0, 11: 1.2, 13: 0.8 }
const LT_V_HARMONIC_BASE: Record<number, number> = { 3: 2.0, 5: 1.5, 7: 0.8, 9: 0.4, 11: 0.3, 13: 0.2 }

function genHarmonics(base: Record<number, number>, noiseFrac: number): Harmonic[] {
  return Object.entries(base).map(([order, pct]) => ({
    order: Number(order),
    pct: Math.max(0, gaussian(pct, pct * noiseFrac)),
  }))
}
function thdFrom(harmonics: Harmonic[]): number {
  return Math.sqrt(harmonics.reduce((s, h) => s + h.pct * h.pct, 0))
}

function deriveMainMeter(kw: number): LightingMainMeter {
  const pf = clamp(0.90, 0.97, gaussian(0.94, 0.015))
  const voltage = 415
  const kva = kw / pf
  const kvar = Math.sqrt(Math.max(0, kva * kva - kw * kw))
  const current = (kw * 1000) / (Math.sqrt(3) * voltage * pf)
  const vL1 = clamp(395, 435, gaussian(voltage, 3))
  const vL2 = clamp(395, 435, gaussian(voltage, 3))
  const vL3 = clamp(395, 435, gaussian(voltage, 3))
  const vAvg = (vL1 + vL2 + vL3) / 3
  const iL1 = clamp(0, current * 1.3, gaussian(current, current * 0.03))
  const iL2 = clamp(0, current * 1.3, gaussian(current, current * 0.03))
  const iL3 = clamp(0, current * 1.3, gaussian(current, current * 0.03))
  const iAvg = (iL1 + iL2 + iL3) / 3
  const harmonicsV = genHarmonics(LT_V_HARMONIC_BASE, 0.2)
  const harmonicsI = genHarmonics(LT_I_HARMONIC_BASE, 0.2)
  return {
    voltage, vL1, vL2, vL3, iL1, iL2, iL3, kw, kvar, kva, pf,
    freq: clamp(49.85, 50.15, gaussian(50.0, 0.03)),
    voltageUnbalance: (Math.max(vL1, vL2, vL3) - Math.min(vL1, vL2, vL3)) / vAvg * 100,
    currentUnbalance: (Math.max(iL1, iL2, iL3) - Math.min(iL1, iL2, iL3)) / (iAvg || 1) * 100,
    harmonicsV, harmonicsI, thdV: thdFrom(harmonicsV), thdI: thdFrom(harmonicsI),
  }
}

// DALI dimming schedule — airports run near-24/7 (unlike an office), so the swing is
// modest: near-full output through the day/evening, a safety-floor dim overnight.
function scheduledDimming(hour: number): number {
  return (hour >= 23 || hour < 5) ? 55 : 95
}

export interface LightingZone {
  id: string
  name: string
  zone: string
  fixtureCount: number
  ratedKw: number          // all fixtures at 100%

  dimmingActual: number    // % — DALI-AI feedback
  dimmingCommand: number   // % — DALI-AO, AI/schedule setpoint
  onOff: boolean           // DALI-DO
  manualOverride: boolean  // true once an operator has taken control via the Lighting Control page

  footfallPct: number      // occupancy proxy, 0-100
  minutesNoFootfall: number

  powerKw: number
  expectedKw: number        // rated x scheduled dimming
  kwhToday: number
  kwhSavedToday: number     // vs fixed-brightness baseline

  faultyFixtureCount: number // DALI-DI — ballast/driver fault reports on the bus
  hardwareFaultLocked: boolean // true if no software command (schedule or operator) reaches the fixtures
  health: 'ok' | 'warning' | 'critical'

  powerHistory: number[]    // 7-day, for sparkline/trend
}

const DEFS: { id: string; name: string; zone: string; fixtureCount: number; ratedKw: number }[] = [
  { id: 'LT-T1-01', name: 'T1 Arrivals Hall',      zone: 'T1', fixtureCount: 300, ratedKw: 12.0 },
  { id: 'LT-T1-02', name: 'T1 Departures Lounge',  zone: 'T1', fixtureCount: 250, ratedKw: 10.0 },
  { id: 'LT-T2-01', name: 'T2 Baggage Hall',       zone: 'T2', fixtureCount: 350, ratedKw: 14.0 },
  { id: 'LT-T2-02', name: 'T2 Duty Free',          zone: 'T2', fixtureCount: 200, ratedKw: 7.0 },
  { id: 'LT-T3-01', name: 'T3 Main Hall',          zone: 'T3', fixtureCount: 400, ratedKw: 16.0 },
  { id: 'LT-T3-02', name: 'T3 Departure Gates',    zone: 'T3', fixtureCount: 280, ratedKw: 10.0 },
  { id: 'LT-T5-01', name: 'T5 Satellite',          zone: 'T5', fixtureCount: 320, ratedKw: 13.0 },
  { id: 'LT-T5-02', name: 'T5 Pier',               zone: 'T5', fixtureCount: 260, ratedKw: 9.0 },
  { id: 'LT-CV-01', name: 'Cargo Village',         zone: 'Cargo Village', fixtureCount: 150, ratedKw: 7.5 },
  { id: 'LT-CP-01', name: 'Car Park',              zone: 'Landside', fixtureCount: 500, ratedKw: 12.5 },
]

function computeHealth(z: Pick<LightingZone, 'dimmingActual' | 'dimmingCommand' | 'powerKw' | 'ratedKw' | 'faultyFixtureCount' | 'onOff' | 'footfallPct' | 'minutesNoFootfall'>): LightingZone['health'] {
  const dimRatio = z.onOff && z.dimmingActual > 0 ? z.powerKw / (z.ratedKw * (z.dimmingActual / 100)) : 1
  if (z.faultyFixtureCount > 5 || (dimRatio > 1.8 && z.dimmingActual < 60)) return 'critical'
  if (z.faultyFixtureCount > 0) return 'warning'
  if (z.onOff && z.footfallPct === 0 && z.minutesNoFootfall > 60) return 'warning'
  return 'ok'
}

function makeZone(def: typeof DEFS[0]): LightingZone {
  const hour = new Date().getHours()
  const dimmingCommand = scheduledDimming(hour)
  const dimmingActual = clamp(0, 100, gaussian(dimmingCommand, 2))
  const footfallPct = clamp(0, 100, gaussian(45, 20))
  const powerKw = def.ratedKw * (dimmingActual / 100)
  const expectedKw = def.ratedKw * (dimmingCommand / 100)
  const baselineKw = def.ratedKw * 0.92 // fixed-brightness baseline, no DALI scheduling

  return {
    ...def,
    dimmingActual, dimmingCommand, onOff: true, manualOverride: false,
    footfallPct, minutesNoFootfall: footfallPct > 0 ? 0 : Math.round(gaussian(20, 15)),
    powerKw, expectedKw,
    kwhToday: Math.max(0, gaussian(powerKw * 14, powerKw * 2)),
    kwhSavedToday: Math.max(0, gaussian((baselineKw - powerKw) * 14, def.ratedKw * 0.5)),
    faultyFixtureCount: 0,
    hardwareFaultLocked: false,
    health: 'ok',
    powerHistory: genHistory(hr => def.ratedKw * (scheduledDimming(hr) / 100), def.ratedKw * 0.03, MAX_HISTORY_DAYS),
  }
}

export class LightingStore {
  zones: LightingZone[] = DEFS.map(makeZone)
  mainMeter: LightingMainMeter = deriveMainMeter(this.zones.reduce((s, z) => s + z.powerKw, 0))

  constructor() {
    makeAutoObservable(this)
    // Seed one zone with a persistent driver fault and one with reported ballast faults,
    // matching the DBS reference pattern (Staff Back Office driver fault) at airport scale.
    this.zones[2].dimmingCommand = 40 // T2 Baggage Hall: manual override above schedule, for DALI-003
    this.zones[2].dimmingActual = 88
    this.zones[2].hardwareFaultLocked = true
    this.zones[8].faultyFixtureCount = 3 // Cargo Village: a few ballasts reporting faults on the bus
    this.zones[8].hardwareFaultLocked = true
    this.zones[2].health = computeHealth(this.zones[2])
    this.zones[8].health = computeHealth(this.zones[8])
    setInterval(() => this.tick(), 5000)
  }

  // ─── Control actions — Lighting Control page ────────────────────────────────
  // Demo mode: these update the local simulation directly. In production, writes go to the
  // DALI gateway (BACnet/Modbus integration) which then reports back the real fixture state.
  setDimming(id: string, pct: number) {
    const z = this.zones.find(x => x.id === id)
    if (!z) return
    z.manualOverride = true
    z.dimmingCommand = clamp(0, 100, pct)
  }

  toggleZone(id: string) {
    const z = this.zones.find(x => x.id === id)
    if (!z) return
    z.onOff = !z.onOff
    z.manualOverride = true
    if (!z.onOff) z.dimmingCommand = 0
  }

  /** Hand the zone back to the AI/DALI schedule. */
  releaseOverride(id: string) {
    const z = this.zones.find(x => x.id === id)
    if (!z) return
    z.manualOverride = false
  }

  get totalPowerKw()    { return this.zones.reduce((s, z) => s + z.powerKw, 0) }
  get totalRatedKw()    { return this.zones.reduce((s, z) => s + z.ratedKw, 0) }
  get totalExpectedKw() { return this.zones.reduce((s, z) => s + z.expectedKw, 0) }
  get totalKwhSavedToday() { return this.zones.reduce((s, z) => s + z.kwhSavedToday, 0) }
  get totalSavingsGbpToday() { return this.totalKwhSavedToday * TARIFF_GBP_PER_KWH }
  get activeZones()     { return this.zones.filter(z => z.onOff).length }

  get allFindings(): Finding[] {
    const out: Finding[] = []
    const hour = new Date().getHours()
    for (const z of this.zones) {
      const dimRatio = z.onOff && z.dimmingActual > 0 ? z.powerKw / (z.ratedKw * (z.dimmingActual / 100)) : 1
      if (dimRatio > 1.8 && z.dimmingActual < 60) {
        out.push({
          ruleId: 'DALI-001', severity: 'warning', unit: z.id,
          title: 'DALI Dimming Command Not Reducing Power',
          detail: `${z.name} set to ${z.dimmingActual.toFixed(0)}% dimming but drawing ${z.powerKw.toFixed(1)} kW — expected ≈${(z.ratedKw * z.dimmingActual / 100).toFixed(1)} kW. Likely LED driver fault or wired bypass.`,
          recommendation: 'Inspect LED drivers in this zone. A failed driver runs at full output regardless of the DALI control signal.',
          triggerValue: `${z.powerKw.toFixed(1)} kW vs ${(z.ratedKw * z.dimmingActual / 100).toFixed(1)} kW expected`,
        })
      }
      if (z.onOff && z.footfallPct === 0 && z.minutesNoFootfall > 45 && z.dimmingActual > 15) {
        out.push({
          ruleId: 'DALI-002', severity: 'warning', unit: z.id,
          title: 'Lighting Active in Zero-Footfall Zone',
          detail: `${z.name} lit at ${z.dimmingActual.toFixed(0)}% with zero occupancy sensor count for ${z.minutesNoFootfall.toFixed(0)} min — ${z.powerKw.toFixed(1)} kW being drawn in an empty area.`,
          recommendation: 'Enable occupancy-linked auto-dim for this zone via the DALI scene controller.',
          triggerValue: `${z.minutesNoFootfall.toFixed(0)} min zero footfall`,
        })
      }
      if (z.onOff && z.dimmingActual > z.dimmingCommand + 25) {
        out.push({
          ruleId: 'DALI-003', severity: 'info', unit: z.id,
          title: 'Operating Above Scheduled Dimming Level',
          detail: `${z.name} at ${z.dimmingActual.toFixed(0)}% vs a ${z.dimmingCommand.toFixed(0)}% schedule target at ${hour}:00 — likely a manual override at the local DALI panel.`,
          recommendation: 'Reset to scheduled dimming level via the DALI gateway, or confirm the override is intentional.',
          triggerValue: `${z.dimmingActual.toFixed(0)}% vs ${z.dimmingCommand.toFixed(0)}% target`,
        })
      }
      if (z.faultyFixtureCount > 0) {
        out.push({
          ruleId: 'DALI-004', severity: z.faultyFixtureCount > 5 ? 'critical' : 'warning', unit: z.id,
          title: 'Luminaire Fault Reported on DALI Bus',
          detail: `${z.name} has ${z.faultyFixtureCount} fixture(s) reporting a ballast/driver fault status on the DALI bus.`,
          recommendation: 'Schedule maintenance to replace or reset the faulted ballasts — DALI short-address diagnostics identify the exact fixtures.',
          triggerValue: `${z.faultyFixtureCount} fixture(s) faulted`,
        })
      }
      const highTraffic = ['T1 Arrivals Hall', 'T2 Baggage Hall', 'T3 Main Hall'].includes(z.name)
      if (highTraffic && hour >= 6 && hour < 22 && z.footfallPct === 0 && z.minutesNoFootfall > 30) {
        out.push({
          ruleId: 'DALI-005', severity: 'warning', unit: z.id,
          title: 'Possible Occupancy Sensor Fault',
          detail: `${z.name} is a high-traffic area expected to be occupied during operating hours, but the occupancy sensor has reported zero for ${z.minutesNoFootfall.toFixed(0)} min.`,
          recommendation: 'Inspect the occupancy/PIR sensor — check for obstruction and DALI bus communication.',
          triggerValue: `${z.minutesNoFootfall.toFixed(0)} min zero count`,
        })
      }
    }
    return out
  }

  private tick() {
    const hour = new Date().getHours()
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i]
      // T2 Baggage Hall: a physical bypass switch at the local DALI panel — no software command
      // (schedule or operator, via the Control page) actually reaches the fixtures here. This is
      // deliberate: it demonstrates that some faults need on-site maintenance, not just a setpoint.
      const isLocalBypass = i === 2
      const isFaultedBallast = i === 8 // Cargo Village — faulted ballasts, same "unfixable via software" point

      if (isLocalBypass) {
        z.dimmingCommand = 40
        z.dimmingActual = clamp(0, 100, gaussian(88, 2))
      } else {
        if (!z.manualOverride) z.dimmingCommand = scheduledDimming(hour)
        z.dimmingActual = z.onOff ? clamp(0, 100, gaussian(z.dimmingCommand, 2)) : 0
      }
      z.footfallPct = clamp(0, 100, gaussian(z.footfallPct, 8))
      if (z.footfallPct > 2) z.minutesNoFootfall = 0
      else z.minutesNoFootfall += 5 / 60

      if (isFaultedBallast) {
        // Faulted ballasts hold the zone near-full power regardless of command
        z.powerKw = clamp(0, z.ratedKw * 1.1, gaussian(z.ratedKw * 0.85, z.ratedKw * 0.02))
      } else {
        z.powerKw = clamp(0, z.ratedKw * 1.1, gaussian(z.ratedKw * (z.dimmingActual / 100), z.ratedKw * 0.02))
      }
      z.expectedKw = z.ratedKw * (z.dimmingCommand / 100)
      z.kwhToday += z.powerKw * (5 / 3600)
      const baselineKw = z.ratedKw * 0.92
      z.kwhSavedToday += Math.max(0, (baselineKw - z.powerKw)) * (5 / 3600)
      z.health = computeHealth(z)
    }
    this.mainMeter = deriveMainMeter(this.totalPowerKw)
  }
}
