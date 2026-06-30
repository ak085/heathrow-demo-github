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

export interface Chiller {
  id: string
  name: string
  location: string
  kw: number
  cop: number
  chwST: number
  chwRT: number
  chwSP: number
  cwST: number
  cwRT: number
  cwSP: number
  load: number
  runHours: number
  fanSpeed: number
  pumpSpeed: number
  health: 'ok' | 'warning' | 'critical'
  copHistory: number[]
  kwHistory: number[]
}

const DEFS = [
  { id: 'CH-01', name: 'CH-01', location: 'T2 Plant Room' },
  { id: 'CH-02', name: 'CH-02', location: 'T2 Plant Room' },
  { id: 'CH-03', name: 'CH-03', location: 'T3 Plant Room' },
]

function makeChiller(def: { id: string; name: string; location: string }): Chiller {
  const kw = Math.max(800, Math.min(1500, gaussian(1100, 100)))
  const cop = Math.max(3.5, Math.min(6.0, gaussian(4.5, 0.3)))
  const chwSP = Math.max(5.5, Math.min(8.5, gaussian(7.0, 0.5)))
  return {
    ...def,
    kw,
    cop,
    chwST: Math.max(6.5, Math.min(8.5, gaussian(7.2, 0.3))),
    chwRT: Math.max(11, Math.min(14, gaussian(12.5, 0.5))),
    chwSP,
    cwST: Math.max(28, Math.min(32, gaussian(30, 0.8))),
    cwRT: Math.max(34, Math.min(38, gaussian(36, 0.8))),
    cwSP: Math.max(27, Math.min(32, gaussian(29, 1))),
    load: Math.max(30, Math.min(100, gaussian(65, 10))),
    runHours: Math.round(gaussian(14000, 500)),
    fanSpeed: Math.max(40, Math.min(100, gaussian(70, 10))),
    pumpSpeed: Math.max(40, Math.min(100, gaussian(72, 8))),
    health: 'ok',
    copHistory: genHistory(t => gaussian(3.8 + airportLoad(t) * 1.2, 0.15), 0.1),
    kwHistory:  genHistory(t => gaussian(600 + airportLoad(t) * 900, 30), 20),
  }
}

export class ChillerStore {
  chillers: Chiller[] = DEFS.map(makeChiller)
  airsideKw = gaussian(200, 30)
  mechFanKw = gaussian(65, 8)

  constructor() {
    makeAutoObservable(this)
    setInterval(() => this.tick(), 5000)
  }

  get chillerPlantKw() { return this.chillers.reduce((s, c) => s + c.kw, 0) }
  get avgCOP()         { return this.chillers.reduce((s, c) => s + c.cop, 0) / this.chillers.length }
  get avgCHWST()       { return this.chillers.reduce((s, c) => s + c.chwST, 0) / this.chillers.length }
  get avgCWST()        { return this.chillers.reduce((s, c) => s + c.cwST, 0) / this.chillers.length }

  get allFindings(): Finding[] {
    const out: Finding[] = []
    for (const c of this.chillers) {
      if (c.chwST > c.chwSP + 1.5) {
        out.push({
          ruleId: 'CHI-001', severity: 'warning', unit: c.id,
          title: 'CHW Supply Temp Above Setpoint',
          detail: `${c.name} CHW supply ${c.chwST.toFixed(1)}°C is ${(c.chwST - c.chwSP).toFixed(1)}°C above AI setpoint ${c.chwSP.toFixed(1)}°C.`,
          recommendation: 'Increase chiller capacity or lower CW supply temp to restore CHW setpoint.',
          triggerValue: `${c.chwST.toFixed(1)}°C vs SP ${c.chwSP.toFixed(1)}°C`,
        })
      }
      const approach = c.cwRT - c.cwST
      if (approach > 7.5) {
        out.push({
          ruleId: 'CHI-002', severity: 'warning', unit: c.id,
          title: 'High Condenser Approach Temp',
          detail: `${c.name} CW ΔT = ${approach.toFixed(1)}°C suggests cooling tower fouling or low flow.`,
          recommendation: 'Inspect cooling tower fill, nozzles and basin. Check CT fan operation.',
          triggerValue: `CW ΔT = ${approach.toFixed(1)}°C`,
        })
      }
      if (c.cop < 3.8) {
        out.push({
          ruleId: 'CHI-003', severity: c.cop < 3.5 ? 'critical' : 'warning', unit: c.id,
          title: 'Low COP Detected',
          detail: `${c.name} COP = ${c.cop.toFixed(2)} is below efficiency threshold.`,
          recommendation: 'Review refrigerant charge, compressor health, and heat exchanger surfaces.',
          triggerValue: `COP = ${c.cop.toFixed(2)}`,
        })
      }
    }
    return out
  }

  private tick() {
    const t = new Date().getHours() + new Date().getMinutes() / 60
    const load = airportLoad(t)
    for (const c of this.chillers) {
      c.kw       = Math.max(800, Math.min(1500, gaussian(600 + load * 900, 20)))
      c.cop      = Math.max(3.5, Math.min(6.0, gaussian(3.8 + load * 1.2, 0.12)))
      c.load     = Math.max(30, Math.min(100, gaussian(30 + load * 70, 3)))
      c.chwST    = Math.max(6.5, Math.min(8.5, gaussian(7.2, 0.2)))
      c.chwRT    = Math.max(11, Math.min(14, gaussian(12.5, 0.3)))
      c.chwSP    = Math.max(5.5, Math.min(8.5, gaussian(7.0 - load * 0.5, 0.3)))
      c.cwST     = Math.max(28, Math.min(32, gaussian(30, 0.5)))
      c.cwRT     = Math.max(34, Math.min(38, gaussian(36, 0.5)))
      c.cwSP     = Math.max(27, Math.min(32, gaussian(29, 0.5)))
      c.fanSpeed = Math.max(40, Math.min(100, gaussian(40 + load * 60, 5)))
      c.pumpSpeed= Math.max(40, Math.min(100, gaussian(40 + load * 60, 5)))
      c.health   = c.cop < 3.5 ? 'critical' : (c.cop < 3.8 || c.chwST > c.chwSP + 1.5) ? 'warning' : 'ok'
    }
    this.airsideKw = Math.max(120, Math.min(350, gaussian(120 + load * 230, 15)))
    this.mechFanKw = Math.max(40,  Math.min(90,  gaussian(40  + load * 50,  5)))
  }
}
