import { makeAutoObservable } from 'mobx'
import type { Finding } from '../types/fdd'

function gaussian(mean: number, std: number): number {
  return mean + std * Math.sqrt(-2 * Math.log(Math.random() + 1e-10)) * Math.cos(2 * Math.PI * Math.random())
}

function solarCurve(t: number): number {
  if (t < 6 || t > 19) return 0
  const mid = 12.5
  return Math.max(0, Math.exp(-0.5 * ((t - mid) / 3.5) ** 2))
}

function airportLoad(t: number): number {
  return 0.45 + 0.35 * (
    Math.exp(-0.5 * ((t - 8.5) / 1.5) ** 2) +
    Math.exp(-0.5 * ((t - 16) / 2) ** 2)
  )
}

export class SolarStore {
  generationKw      = 0
  siteConsumptionKw = 3850
  exportLimitKw     = 200
  todayGenerationKwh= Math.max(0, gaussian(2200, 300))

  generationHistory:  number[] = []
  consumptionHistory: number[] = []
  exportHistory:      number[] = []
  dailyBarData: { day: string; kwh: number }[] = []

  constructor() {
    makeAutoObservable(this)
    this._initHistory()
    this._tick()
    setInterval(() => this._tick(), 5000)
  }

  get exportKw()       { return Math.max(0, this.generationKw - this.siteConsumptionKw) }
  get headroomKw()     { return this.exportLimitKw - this.exportKw }
  get todaySavingsGbp(){ return this.todayGenerationKwh * 0.25 }
  get selfConsumptionPct() {
    if (this.generationKw < 1) return 100
    return Math.min(100, (Math.min(this.generationKw, this.siteConsumptionKw) / this.generationKw) * 100)
  }
  get headroomHealth(): 'ok' | 'warning' | 'critical' {
    return this.headroomKw < 20 ? 'critical' : this.headroomKw < 80 ? 'warning' : 'ok'
  }

  get allFindings(): Finding[] {
    if (this.headroomKw < 20 && this.generationKw > 10) {
      return [{
        ruleId: 'SOL-001', severity: 'critical', unit: 'BA Hangar / T5 Roof',
        title: 'Export Limit at Risk',
        detail: `Solar export = ${this.exportKw.toFixed(0)} kW. Only ${this.headroomKw.toFixed(0)} kW headroom before the 200 kW HAL grid export cap is reached.`,
        recommendation: 'Curtail generation or increase site load (battery charging, pre-cooling). Alert HAL grid team immediately.',
        triggerValue: `Headroom = ${this.headroomKw.toFixed(0)} kW`,
      }]
    }
    return []
  }

  updateConsumption(kw: number) {
    this.siteConsumptionKw = kw
  }

  private _initHistory() {
    this.generationHistory = Array.from({ length: 288 }, (_, i) => {
      const t = i * (24 / 288)
      return Math.max(0, gaussian(800 * solarCurve(t), 20))
    })
    this.consumptionHistory = Array.from({ length: 288 }, (_, i) => {
      const t = i * (24 / 288)
      return Math.max(0, gaussian(2500 + airportLoad(t) * 2000, 100))
    })
    this.exportHistory = this.generationHistory.map((g, i) =>
      Math.max(0, g - this.consumptionHistory[i])
    )
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    this.dailyBarData = days.map(day => ({ day, kwh: Math.max(0, gaussian(2200, 400)) }))
  }

  private _tick() {
    const t = new Date().getHours() + new Date().getMinutes() / 60
    this.generationKw = Math.max(0, gaussian(800 * solarCurve(t), 25))
  }
}
