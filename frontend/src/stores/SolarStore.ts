import { makeAutoObservable } from 'mobx'
import type { Finding } from '../types/fdd'
import { gaussian, genHistory, MAX_HISTORY_DAYS } from '../utils/history'
import type { PowerGridStore } from './PowerGridStore'

function clamp(min: number, max: number, v: number) { return Math.max(min, Math.min(max, v)) }

function solarCurve(t: number): number {
  if (t < 6 || t > 19) return 0
  const mid = 12.5
  return Math.max(0, Math.exp(-0.5 * ((t - mid) / 3.5) ** 2))
}

export interface SolarArray {
  id: string
  name: string
  location: string
  ratedKw: number
  perfFactor: number   // fixed baseline — soiling/shading losses relative to a clean, unshaded array
  generationKw: number
  todayGenerationKwh: number
  generationHistory: number[]
  health: 'ok' | 'warning' | 'critical'
}

const ARRAY_DEFS = [
  { id: 'T5-ROOF', name: 'T5 Roof Array', location: 'Terminal 5 Roof', ratedKw: 350, perfFactor: 0.95 },
  { id: 'CARGO-VILLAGE', name: 'Cargo Village Array', location: 'Cargo Village Roof', ratedKw: 250, perfFactor: 0.90 },
  { id: 'BA-HANGAR', name: 'BA Hangar Array', location: 'British Airways Hangar', ratedKw: 200, perfFactor: 0.88 },
]

const BENCHMARK_PERF = 0.92 // fleet-average expectation used to flag underperforming arrays

function makeArray(def: typeof ARRAY_DEFS[0]): SolarArray {
  const t = new Date().getHours() + new Date().getMinutes() / 60
  const generationKw = Math.max(0, gaussian(def.ratedKw * solarCurve(t) * def.perfFactor, def.ratedKw * 0.03))
  return {
    ...def,
    generationKw,
    todayGenerationKwh: Math.max(0, gaussian(def.ratedKw * 0.42 * def.perfFactor * 10, def.ratedKw * 0.4)),
    generationHistory: genHistory(hr => def.ratedKw * solarCurve(hr) * def.perfFactor, def.ratedKw * 0.025, MAX_HISTORY_DAYS),
    health: 'ok',
  }
}

export class SolarStore {
  arrays: SolarArray[] = ARRAY_DEFS.map(makeArray)
  exportLimitKw = 200
  private power: PowerGridStore

  constructor(power: PowerGridStore) {
    this.power = power
    makeAutoObservable(this)
    setInterval(() => this.tick(), 5000)
  }

  get generationKw() { return this.arrays.reduce((s, a) => s + a.generationKw, 0) }
  get todayGenerationKwh() { return this.arrays.reduce((s, a) => s + a.todayGenerationKwh, 0) }
  get siteConsumptionKw() { return this.power.totalBuildingKw }
  get exportKw() { return Math.max(0, this.generationKw - this.siteConsumptionKw) }
  get headroomKw() { return this.exportLimitKw - this.exportKw }
  get todaySavingsGbp() { return this.todayGenerationKwh * 0.25 }
  get selfConsumptionPct() {
    if (this.generationKw < 1) return 100
    return Math.min(100, (Math.min(this.generationKw, this.siteConsumptionKw) / this.generationKw) * 100)
  }
  get headroomHealth(): 'ok' | 'warning' | 'critical' {
    return this.headroomKw < 20 ? 'critical' : this.headroomKw < 80 ? 'warning' : 'ok'
  }
  get consumptionHistory() { return this.power.totalDemandHistory }
  get exportHistory() {
    const gen = this.arrays.reduce<number[]>((sum, a) => {
      if (sum.length === 0) return [...a.generationHistory]
      return sum.map((v, i) => v + a.generationHistory[i])
    }, [])
    const cons = this.consumptionHistory
    return gen.map((g, i) => Math.max(0, g - (cons[i] ?? 0)))
  }

  get allFindings(): Finding[] {
    const out: Finding[] = []
    if (this.headroomKw < 20 && this.generationKw > 10) {
      out.push({
        ruleId: 'SOL-001', severity: 'critical', unit: 'Site',
        title: 'Export Limit at Risk',
        detail: `Solar export = ${this.exportKw.toFixed(0)} kW. Only ${this.headroomKw.toFixed(0)} kW headroom before the ${this.exportLimitKw} kW grid export cap is reached.`,
        recommendation: 'Curtail generation or increase site load (battery charging, pre-cooling). Alert the grid team immediately.',
        triggerValue: `Headroom = ${this.headroomKw.toFixed(0)} kW`,
      })
    }
    for (const a of this.arrays) {
      const t = new Date().getHours() + new Date().getMinutes() / 60
      const expected = a.ratedKw * solarCurve(t) * BENCHMARK_PERF
      if (expected > 20 && a.generationKw < expected * 0.75) {
        out.push({
          ruleId: 'SOL-002', severity: 'warning', unit: a.id,
          title: 'Array Underperformance',
          detail: `${a.name} generating ${a.generationKw.toFixed(0)} kW vs ${expected.toFixed(0)} kW expected for time of day — check for soiling, shading or inverter fault.`,
          recommendation: 'Inspect panels for soiling/shading; check inverter status and string-level performance.',
          triggerValue: `${a.generationKw.toFixed(0)} kW vs ${expected.toFixed(0)} kW expected`,
        })
      }
    }
    return out
  }

  private tick() {
    const t = new Date().getHours() + new Date().getMinutes() / 60
    for (const a of this.arrays) {
      a.generationKw = Math.max(0, gaussian(a.ratedKw * solarCurve(t) * a.perfFactor, a.ratedKw * 0.03))
      const expected = a.ratedKw * solarCurve(t) * BENCHMARK_PERF
      a.health = (expected > 20 && a.generationKw < expected * 0.6) ? 'critical'
               : (expected > 20 && a.generationKw < expected * 0.75) ? 'warning' : 'ok'
      a.todayGenerationKwh += a.generationKw * (5 / 3600)
    }
  }
}
