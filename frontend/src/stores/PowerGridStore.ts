import { makeAutoObservable } from 'mobx'
import type { Finding } from '../types/fdd'

function gaussian(mean: number, std: number): number {
  return mean + std * Math.sqrt(-2 * Math.log(Math.random() + 1e-10)) * Math.cos(2 * Math.PI * Math.random())
}

function airportLoad(t: number): number {
  return 0.45 + 0.35 * (
    Math.exp(-0.5 * ((t - 8.5) / 1.5) ** 2) +
    Math.exp(-0.5 * ((t - 16) / 2) ** 2)
  )
}

export interface Substation {
  id: string
  name: string
  kw: number
  pf: number
  pfHealth: 'ok' | 'warning' | 'critical'
  current: number
  voltage: number
  todayKwh: number
  demandHistory: number[]
  pfHistory: number[]
  ratedKw: number
  color: string
}

const SUB_DEFS = [
  { id: 'T1-Main', name: 'T1-Main', baseKw: 1300, noise: 100, ratedKw: 2000, color: '#5a0057' },
  { id: 'T2-Main', name: 'T2-Main', baseKw: 1000, noise: 80,  ratedKw: 1600, color: '#9b59b6' },
  { id: 'T3-Main', name: 'T3-Main', baseKw: 850,  noise: 70,  ratedKw: 1400, color: '#e74c3c' },
  { id: 'T5-Main', name: 'T5-Main', baseKw: 1700, noise: 120, ratedKw: 2500, color: '#2ecc71' },
]

function makeSubstation(def: typeof SUB_DEFS[0]): Substation {
  const pf = Math.max(0.82, Math.min(0.98, gaussian(0.92, 0.04)))
  const pfH: 'ok' | 'warning' | 'critical' = pf >= 0.92 ? 'ok' : pf >= 0.85 ? 'warning' : 'critical'
  const kw = Math.max(0, gaussian(def.baseKw, def.noise))
  const V = 11000
  return {
    id: def.id,
    name: def.name,
    kw,
    pf,
    pfHealth: pfH,
    current: kw * 1000 / (Math.sqrt(3) * V * pf),
    voltage: V,
    todayKwh: Math.max(0, gaussian(def.baseKw * 10, def.baseKw)),
    ratedKw: def.ratedKw,
    color: def.color,
    demandHistory: Array.from({ length: 288 }, (_, i) => {
      const t = i * (24 / 288)
      const l = airportLoad(t)
      return Math.max(0, gaussian(def.baseKw * 0.4 + l * def.baseKw * 0.9, def.noise * 0.5))
    }),
    pfHistory: Array.from({ length: 288 }, () =>
      Math.max(0.80, Math.min(0.99, gaussian(0.92, 0.03)))
    ),
  }
}

export class PowerGridStore {
  substations: Substation[] = SUB_DEFS.map(makeSubstation)
  chillerPlantKw = gaussian(1100, 100)
  airsideKw      = gaussian(200, 30)
  mechFanKw      = gaussian(65, 8)

  // Heatmap: 7 days × 24 hours
  heatmapData: number[][] = Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hr) => {
      const l = airportLoad(hr + 0.5)
      return Math.round(gaussian(600 + l * 1200, 80))
    })
  )

  constructor() {
    makeAutoObservable(this)
    setInterval(() => this.tick(), 5000)
  }

  get totalBuildingKw() { return this.substations.reduce((s, sub) => s + sub.kw, 0) }
  get todayTotalKwh()   { return this.substations.reduce((s, sub) => s + sub.todayKwh, 0) }
  get todayChillerKwh() { return this.chillerPlantKw * 14 }
  get todayAirsideKwh() { return this.airsideKw * 14 }
  get todayMechFanKwh() { return this.mechFanKw * 14 }
  get todayOtherKwh()   {
    return Math.max(0, this.todayTotalKwh - this.todayChillerKwh - this.todayAirsideKwh - this.todayMechFanKwh)
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
    }
    return out
  }

  private tick() {
    const t = new Date().getHours() + new Date().getMinutes() / 60
    const load = airportLoad(t)
    const bases = [1300, 1000, 850, 1700]
    const noises = [50, 40, 35, 60]
    for (let i = 0; i < this.substations.length; i++) {
      const sub = this.substations[i]
      sub.kw      = Math.max(0, gaussian(bases[i] * 0.4 + load * bases[i] * 0.9, noises[i]))
      sub.pf      = Math.max(0.82, Math.min(0.98, gaussian(0.92, 0.03)))
      sub.pfHealth= sub.pf >= 0.92 ? 'ok' : sub.pf >= 0.85 ? 'warning' : 'critical'
      sub.current = sub.kw * 1000 / (Math.sqrt(3) * sub.voltage * sub.pf)
      sub.todayKwh += sub.kw * (5 / 60)
    }
    this.chillerPlantKw = Math.max(800, Math.min(1500, gaussian(600 + load * 900, 30)))
    this.airsideKw      = Math.max(120, Math.min(350, gaussian(120 + load * 230, 15)))
    this.mechFanKw      = Math.max(40,  Math.min(90,  gaussian(40  + load * 50,  5)))
  }
}
