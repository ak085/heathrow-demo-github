import { makeAutoObservable } from 'mobx'
import type { Finding } from '../types/fdd'
import { gaussian, airportLoad, genHistory, MAX_HISTORY_DAYS } from '../utils/history'
import type { ChillerStore } from './ChillerStore'
import type { AHUStore } from './AHUStore'

function clamp(min: number, max: number, v: number) { return Math.max(min, Math.min(max, v)) }

export interface Harmonic { order: number; pct: number }

export interface Substation {
  id: string
  name: string
  kw: number
  pf: number
  pfHealth: 'ok' | 'warning' | 'critical'
  current: number
  voltage: number
  kva: number
  kvar: number
  freq: number
  vL1: number; vL2: number; vL3: number
  iL1: number; iL2: number; iL3: number
  voltageUnbalance: number
  currentUnbalance: number
  todayKwh: number
  demandHistory: number[]
  pfHistory: number[]
  ratedKw: number
  color: string

  // Power quality — the consultant's core ask
  harmonicsV: Harmonic[]
  harmonicsI: Harmonic[]
  thdV: number   // derived: sqrt(Σ harmonicsV²) — not an independent random point
  thdI: number   // derived: sqrt(Σ harmonicsI²)

  breakerClosed: boolean
  alarmRelay: boolean
  meterOk: boolean
}

// Scaled 5x from the original single-office-building-sized figures (baseKw summing to ~4,850 kW)
// so the 4 HV substations plausibly cover the whole T1/T2/T3/T5 terminal complex — including the
// 5-chiller plant (up to ~7.5 MW combined) sized independently on the Chiller Plant page. At this
// scale the chiller plant is a believable ~25% of total building demand instead of sometimes
// exceeding it, so no capping/fudging is needed for the sub-meter breakdown to reconcile exactly.
const SUB_DEFS = [
  { id: 'T1-Main', name: 'T1-Main', baseKw: 6500, noise: 500, ratedKw: 10000, color: '#5a0057' },
  { id: 'T2-Main', name: 'T2-Main', baseKw: 5000, noise: 400, ratedKw: 8000,  color: '#9b59b6' },
  { id: 'T3-Main', name: 'T3-Main', baseKw: 4250, noise: 350, ratedKw: 7000,  color: '#e74c3c' },
  { id: 'T5-Main', name: 'T5-Main', baseKw: 8500, noise: 600, ratedKw: 12500, color: '#2ecc71' },
]

// Typical odd-harmonic base magnitudes (%) — current harmonics dominate (VFDs, switching loads),
// voltage harmonics stay low on a stiff HV grid connection.
const I_HARMONIC_BASE: Record<number, number> = { 3: 4.0, 5: 3.0, 7: 1.8, 9: 1.0, 11: 0.8, 13: 0.5 }
const V_HARMONIC_BASE: Record<number, number> = { 3: 1.5, 5: 1.2, 7: 0.6, 9: 0.3, 11: 0.25, 13: 0.15 }

function genHarmonics(base: Record<number, number>, noiseFrac: number): Harmonic[] {
  return Object.entries(base).map(([order, pct]) => ({
    order: Number(order),
    pct: Math.max(0, gaussian(pct, pct * noiseFrac)),
  }))
}

function thdFrom(harmonics: Harmonic[]): number {
  return Math.sqrt(harmonics.reduce((s, h) => s + h.pct * h.pct, 0))
}

function makeSubstation(def: typeof SUB_DEFS[0]): Substation {
  const pf = clamp(0.82, 0.98, gaussian(0.92, 0.04))
  const pfH: 'ok' | 'warning' | 'critical' = pf >= 0.92 ? 'ok' : pf >= 0.85 ? 'warning' : 'critical'
  const kw = Math.max(0, gaussian(def.baseKw, def.noise))
  const kva = kw / pf
  const kvar = Math.sqrt(Math.max(0, kva * kva - kw * kw))
  const V = 11000
  const vL1 = clamp(10700, 11300, gaussian(V, 40))
  const vL2 = clamp(10700, 11300, gaussian(V, 40))
  const vL3 = clamp(10700, 11300, gaussian(V, 40))
  const vAvg = (vL1 + vL2 + vL3) / 3
  const current = kw * 1000 / (Math.sqrt(3) * V * pf)
  const iL1 = clamp(0, current * 1.3, gaussian(current, current * 0.03))
  const iL2 = clamp(0, current * 1.3, gaussian(current, current * 0.03))
  const iL3 = clamp(0, current * 1.3, gaussian(current, current * 0.03))
  const iAvg = (iL1 + iL2 + iL3) / 3
  const harmonicsV = genHarmonics(V_HARMONIC_BASE, 0.2)
  const harmonicsI = genHarmonics(I_HARMONIC_BASE, 0.25)

  return {
    id: def.id, name: def.name, color: def.color, ratedKw: def.ratedKw,
    kw, pf, pfHealth: pfH, current, voltage: V, kva, kvar,
    freq: clamp(49.85, 50.15, gaussian(50.0, 0.03)),
    vL1, vL2, vL3, iL1, iL2, iL3,
    voltageUnbalance: (Math.max(vL1, vL2, vL3) - Math.min(vL1, vL2, vL3)) / vAvg * 100,
    currentUnbalance: (Math.max(iL1, iL2, iL3) - Math.min(iL1, iL2, iL3)) / (iAvg || 1) * 100,
    todayKwh: Math.max(0, gaussian(def.baseKw * 10, def.baseKw)),
    demandHistory: genHistory(t => gaussian(def.baseKw * 0.4 + airportLoad(t) * def.baseKw * 0.9, def.noise * 0.5), def.noise * 0.15, MAX_HISTORY_DAYS),
    pfHistory: genHistory(() => 0.92, 0.03, MAX_HISTORY_DAYS),
    harmonicsV, harmonicsI,
    thdV: thdFrom(harmonicsV), thdI: thdFrom(harmonicsI),
    breakerClosed: true, alarmRelay: pfH !== 'ok', meterOk: true,
  }
}

export class PowerGridStore {
  substations: Substation[] = SUB_DEFS.map(makeSubstation)
  mechFanKw = gaussian(65, 8)
  private chiller: ChillerStore
  private ahu: AHUStore

  // Total-building demand: 7 days × 24 hours, weekday/weekend variation — derived from the same
  // substation base/noise figures as the live demand, so this tab's numbers match the others.
  heatmapData: number[][] = (() => {
    const totalBase = SUB_DEFS.reduce((s, d) => s + d.baseKw, 0)
    const totalNoise = Math.sqrt(SUB_DEFS.reduce((s, d) => s + d.noise * d.noise, 0))
    return Array.from({ length: 7 }, (_, day) => {
      const weekendFactor = (day === 5 || day === 6) ? 0.7 : 1.0
      return Array.from({ length: 24 }, (_, hr) => {
        const l = airportLoad(hr + 0.5)
        return Math.round(gaussian(totalBase * (0.4 + l * 0.9) * weekendFactor, totalNoise * 0.5))
      })
    })
  })()

  constructor(chiller: ChillerStore, ahu: AHUStore) {
    this.chiller = chiller
    this.ahu = ahu
    makeAutoObservable(this)
    setInterval(() => this.tick(), 5000)
  }

  get totalBuildingKw() { return this.substations.reduce((s, sub) => s + sub.kw, 0) }
  get todayTotalKwh()   { return this.substations.reduce((s, sub) => s + sub.todayKwh, 0) }

  /** Real chiller-plant and AHU fan power — the exact same numbers shown on the Chiller Plant
   *  and AHUs pages, not an independent duplicate. Substation capacities above are sized so the
   *  chiller plant (up to ~7.5 MW across 5 units) is always a believable minority share of total
   *  building demand, so no capping is needed for these to reconcile with the sub-meter totals. */
  get chillerPlantKw() { return this.chiller.chillerPlantKw }
  get airsideKw()      { return this.ahu.totalFanKw }

  /** Today's category kWh as a live proportion of the real metered total — guarantees
   *  Chiller + Airside + Mech Fans + Other always reconciles exactly to todayTotalKwh,
   *  instead of being computed on a disconnected accounting basis (the old `kw × 14h`
   *  approximation, which routinely made "Other" balloon or vanish). */
  get todayChillerKwh() { return this.totalBuildingKw > 0 ? this.todayTotalKwh * (this.chillerPlantKw / this.totalBuildingKw) : 0 }
  get todayAirsideKwh() { return this.totalBuildingKw > 0 ? this.todayTotalKwh * (this.airsideKw / this.totalBuildingKw) : 0 }
  get todayMechFanKwh() { return this.totalBuildingKw > 0 ? this.todayTotalKwh * (this.mechFanKw / this.totalBuildingKw) : 0 }
  get todayOtherKwh()   {
    return Math.max(0, this.todayTotalKwh - this.todayChillerKwh - this.todayAirsideKwh - this.todayMechFanKwh)
  }
  get avgPF() { return this.substations.reduce((s, sub) => s + sub.pf, 0) / this.substations.length }

  /** Sum of all substation demand histories — the real building-wide load, used by the Solar
   *  page instead of an independently-randomised consumption figure. */
  get totalDemandHistory(): number[] {
    const len = this.substations[0]?.demandHistory.length ?? 0
    return Array.from({ length: len }, (_, i) => this.substations.reduce((s, sub) => s + sub.demandHistory[i], 0))
  }

  get allFindings(): Finding[] {
    const out: Finding[] = []
    for (const sub of this.substations) {
      if (sub.pf < 0.85) {
        out.push({
          ruleId: 'PWR-001', severity: 'critical', unit: sub.id,
          title: 'Critical Power Factor',
          detail: `${sub.name} PF = ${sub.pf.toFixed(3)} is below 0.85 — network penalty charges likely.`,
          recommendation: 'Check PF correction capacitor banks immediately. Contact UKPN if persistent.',
          triggerValue: `PF = ${sub.pf.toFixed(3)}`,
        })
      } else if (sub.pf < 0.92) {
        out.push({
          ruleId: 'PWR-001', severity: 'warning', unit: sub.id,
          title: 'Low Power Factor Warning',
          detail: `${sub.name} PF = ${sub.pf.toFixed(3)} is below the 0.92 target.`,
          recommendation: 'Review reactive power loading and schedule PF correction review.',
          triggerValue: `PF = ${sub.pf.toFixed(3)}`,
        })
      }
      if (sub.kw > sub.ratedKw * 0.9) {
        out.push({
          ruleId: 'PWR-002', severity: 'warning', unit: sub.id,
          title: 'High Demand — Near Rated Capacity',
          detail: `${sub.name} demand ${sub.kw.toFixed(0)} kW = ${((sub.kw / sub.ratedKw) * 100).toFixed(0)}% of rated ${sub.ratedKw} kW.`,
          recommendation: 'Review non-essential loads. Consider demand shifting to off-peak.',
          triggerValue: `${sub.kw.toFixed(0)} kW / ${sub.ratedKw} kW`,
        })
      }
      if (sub.thdI > 15) {
        out.push({
          ruleId: 'PWR-003', severity: sub.thdI > 20 ? 'critical' : 'warning', unit: sub.id,
          title: 'High Current THD',
          detail: `${sub.name} current THD = ${sub.thdI.toFixed(1)}% exceeds recommended 15% (IEEE 519 guidance).`,
          recommendation: 'Investigate harmonic-generating loads (VFDs, UPS); consider active harmonic filter.',
          triggerValue: `THD-I = ${sub.thdI.toFixed(1)}%`,
        })
      }
      if (sub.voltageUnbalance > 2) {
        out.push({
          ruleId: 'PWR-004', severity: sub.voltageUnbalance > 3 ? 'critical' : 'warning', unit: sub.id,
          title: 'Voltage Unbalance',
          detail: `${sub.name} voltage unbalance = ${sub.voltageUnbalance.toFixed(1)}%, above the 2% comfort threshold.`,
          recommendation: 'Check for uneven single-phase loading across phases; inspect connections.',
          triggerValue: `${sub.voltageUnbalance.toFixed(1)}%`,
        })
      }
    }
    return out
  }

  private tick() {
    const t = new Date().getHours() + new Date().getMinutes() / 60
    const load = airportLoad(t)
    for (let i = 0; i < this.substations.length; i++) {
      const sub = this.substations[i]
      const def = SUB_DEFS[i]
      sub.kw      = Math.max(0, gaussian(def.baseKw * 0.4 + load * def.baseKw * 0.9, def.noise * 0.5))
      sub.pf      = clamp(0.82, 0.98, gaussian(0.92, 0.03))
      sub.pfHealth= sub.pf >= 0.92 ? 'ok' : sub.pf >= 0.85 ? 'warning' : 'critical'
      sub.kva     = sub.kw / sub.pf
      sub.kvar    = Math.sqrt(Math.max(0, sub.kva * sub.kva - sub.kw * sub.kw))
      sub.current = sub.kw * 1000 / (Math.sqrt(3) * sub.voltage * sub.pf)
      sub.freq    = clamp(49.85, 50.15, gaussian(50.0, 0.02))
      sub.vL1     = clamp(10700, 11300, gaussian(sub.voltage, 40))
      sub.vL2     = clamp(10700, 11300, gaussian(sub.voltage, 40))
      sub.vL3     = clamp(10700, 11300, gaussian(sub.voltage, 40))
      sub.iL1     = clamp(0, sub.current * 1.3, gaussian(sub.current, sub.current * 0.03))
      sub.iL2     = clamp(0, sub.current * 1.3, gaussian(sub.current, sub.current * 0.03))
      sub.iL3     = clamp(0, sub.current * 1.3, gaussian(sub.current, sub.current * 0.03))
      const vAvg  = (sub.vL1 + sub.vL2 + sub.vL3) / 3
      const iAvg  = (sub.iL1 + sub.iL2 + sub.iL3) / 3
      sub.voltageUnbalance = (Math.max(sub.vL1, sub.vL2, sub.vL3) - Math.min(sub.vL1, sub.vL2, sub.vL3)) / vAvg * 100
      sub.currentUnbalance = (Math.max(sub.iL1, sub.iL2, sub.iL3) - Math.min(sub.iL1, sub.iL2, sub.iL3)) / (iAvg || 1) * 100
      sub.harmonicsV = genHarmonics(V_HARMONIC_BASE, 0.2)
      sub.harmonicsI = genHarmonics(I_HARMONIC_BASE, 0.25)
      sub.thdV = thdFrom(sub.harmonicsV)
      sub.thdI = thdFrom(sub.harmonicsI)
      sub.alarmRelay = sub.pfHealth !== 'ok' || sub.thdI > 15
      sub.todayKwh += sub.kw * (5 / 60)
    }
    this.mechFanKw = clamp(40, 90, gaussian(40 + load * 50, 5))
  }
}
