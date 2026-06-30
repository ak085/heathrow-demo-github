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

function genHistory(baseFn: (t: number) => number, noise: number): number[] {
  return Array.from({ length: 288 }, (_, i) => {
    const t = i * (24 / 288)
    return Math.max(0, gaussian(baseFn(t), noise))
  })
}

export interface AHU {
  id: string
  name: string
  zone: string
  sat: number
  satSP: number
  rat: number
  co2: number
  freshAirSpeed: number
  fanSpeed: number
  fanSP: number
  chwValve: number
  zoneTemp: number
  zoneTempSP: number
  hlvsOn: boolean
  health: 'ok' | 'warning' | 'critical'
  filterDP: number
  co2History: number[]
  freshAirHistory: number[]
}

const DEFS = [
  { id: 'AHU-T1-01', name: 'AHU-T1-01', zone: 'T1 Arrivals Hall' },
  { id: 'AHU-T1-02', name: 'AHU-T1-02', zone: 'T1 Departures' },
  { id: 'AHU-T2-01', name: 'AHU-T2-01', zone: 'T2 Departures Gate A' },
  { id: 'AHU-T2-02', name: 'AHU-T2-02', zone: 'T2 Departures Gate B' },
  { id: 'AHU-T3-01', name: 'AHU-T3-01', zone: 'T3 Main Hall' },
  { id: 'AHU-T5-01', name: 'AHU-T5-01', zone: 'T5 Satellite' },
]

function makeAHU(def: { id: string; name: string; zone: string }): AHU {
  const co2 = Math.max(400, Math.min(1100, gaussian(650, 100)))
  const satSP = Math.max(13, Math.min(16, gaussian(14.5, 0.8)))
  const fanSpeed = Math.max(40, Math.min(100, gaussian(70, 10)))
  return {
    ...def,
    sat: Math.max(12, Math.min(18, gaussian(satSP + 0.3, 0.5))),
    satSP,
    rat: Math.max(22, Math.min(27, gaussian(24, 0.8))),
    co2,
    freshAirSpeed: Math.max(20, Math.min(100, 20 + (co2 - 400) / 700 * 80)),
    fanSpeed,
    fanSP: Math.max(40, Math.min(100, gaussian(fanSpeed - 2, 3))),
    chwValve: Math.max(0, Math.min(100, gaussian(50, 15))),
    zoneTemp: Math.max(23, Math.min(28, gaussian(25, 0.8))),
    zoneTempSP: 27,
    hlvsOn: Math.random() > 0.3,
    health: 'ok',
    filterDP: Math.max(80, Math.min(230, gaussian(140, 30))),
    co2History: genHistory(t => gaussian(400 + airportLoad(t) * 600, 40), 30),
    freshAirHistory: genHistory(t => gaussian(20 + airportLoad(t) * 60, 8), 5),
  }
}

export class AHUStore {
  ahus: AHU[] = DEFS.map(makeAHU)

  constructor() {
    makeAutoObservable(this)
    setInterval(() => this.tick(), 5000)
  }

  get avgSAT()   { return this.ahus.reduce((s, a) => s + a.sat, 0) / this.ahus.length }
  get avgZoneT() { return this.ahus.reduce((s, a) => s + a.zoneTemp, 0) / this.ahus.length }
  get normalCount() { return this.ahus.filter(a => a.health === 'ok').length }
  get filterAlerts() { return this.ahus.filter(a => a.filterDP > 200).length }

  get allFindings(): Finding[] {
    const out: Finding[] = []
    for (const a of this.ahus) {
      if (a.co2 > 1000) {
        out.push({
          ruleId: 'AHU-001', severity: 'critical', unit: a.id,
          title: 'High CO₂ — IAQ Alert',
          detail: `${a.name} (${a.zone}) CO₂ = ${a.co2.toFixed(0)} ppm exceeds 1000 ppm limit.`,
          recommendation: 'Increase fresh air damper opening immediately and verify fresh air fan operation.',
          triggerValue: `CO₂ = ${a.co2.toFixed(0)} ppm`,
        })
      } else if (a.co2 > 800) {
        out.push({
          ruleId: 'AHU-001', severity: 'warning', unit: a.id,
          title: 'Elevated CO₂ Level',
          detail: `${a.name} (${a.zone}) CO₂ = ${a.co2.toFixed(0)} ppm approaching 1000 ppm limit.`,
          recommendation: 'Monitor ventilation rate and consider increasing fresh air flow.',
          triggerValue: `CO₂ = ${a.co2.toFixed(0)} ppm`,
        })
      }
      if (a.filterDP > 200) {
        out.push({
          ruleId: 'AHU-002', severity: 'warning', unit: a.id,
          title: 'High Filter Differential Pressure',
          detail: `${a.name} filter DP = ${a.filterDP.toFixed(0)} Pa — filter is approaching end of life.`,
          recommendation: 'Schedule filter replacement within 2 weeks to prevent fan overload.',
          triggerValue: `DP = ${a.filterDP.toFixed(0)} Pa`,
        })
      }
      const satDev = Math.abs(a.sat - a.satSP)
      if (satDev > 2) {
        out.push({
          ruleId: 'AHU-003', severity: 'warning', unit: a.id,
          title: 'SAT Deviation from AI Setpoint',
          detail: `${a.name} SAT ${a.sat.toFixed(1)}°C deviates ${satDev.toFixed(1)}°C from AI setpoint ${a.satSP.toFixed(1)}°C.`,
          recommendation: 'Check CHW valve modulation and cooling coil condition.',
          triggerValue: `SAT ${a.sat.toFixed(1)}°C vs SP ${a.satSP.toFixed(1)}°C`,
        })
      }
    }
    return out
  }

  private tick() {
    const t = new Date().getHours() + new Date().getMinutes() / 60
    const load = airportLoad(t)
    for (const a of this.ahus) {
      a.co2          = Math.max(400, Math.min(1100, gaussian(400 + load * 600, 40)))
      a.freshAirSpeed= Math.max(20, Math.min(100, 20 + (a.co2 - 400) / 700 * 80))
      a.satSP        = Math.max(13, Math.min(16, gaussian(15.5 - load * 1.5, 0.3)))
      a.sat          = Math.max(12, Math.min(18, gaussian(a.satSP + 0.3, 0.5)))
      a.rat          = Math.max(22, Math.min(27, gaussian(24, 0.5)))
      a.fanSpeed     = Math.max(40, Math.min(100, gaussian(40 + load * 60, 5)))
      a.fanSP        = Math.max(40, Math.min(100, a.fanSpeed - Math.abs(gaussian(2, 2))))
      a.chwValve     = Math.max(0,  Math.min(100, gaussian(20 + load * 60, 8)))
      a.zoneTemp     = Math.max(23, Math.min(28, gaussian(25, 0.5)))
      a.filterDP     = Math.max(80, Math.min(230, gaussian(140, 5)))
      const dev      = Math.abs(a.sat - a.satSP)
      a.health       = a.co2 > 1000 ? 'critical' : (a.co2 > 800 || a.filterDP > 200 || dev > 2) ? 'warning' : 'ok'
    }
  }
}
