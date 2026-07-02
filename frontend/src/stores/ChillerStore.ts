import { makeAutoObservable } from 'mobx'
import type { Finding } from '../types/fdd'
import { gaussian, airportLoad, genHistory, MAX_HISTORY_DAYS } from '../utils/history'
import type { AHUStore } from './AHUStore'

// Water specific heat (kJ/kg·°C) at 1 kg/L density — the basis for every
// cooling-capacity ("BTU meter") calculation below: Q(kW) = flow(L/s) × ΔT(°C) × 4.186
const SPECIFIC_HEAT = 4.186
const KW_PER_RT = 3.5168      // 1 refrigeration ton, kW
const LS_TO_GPM = 15.850

// Illustrative nameplate sizes — not from the FDS, used only to derive pump/fan kW via the cube (affinity) law.
const RATED_CHW_PUMP_KW = 90
const RATED_CW_PUMP_KW = 110
const RATED_CT_FAN_KW = 55

function clamp(min: number, max: number, v: number) { return Math.max(min, Math.min(max, v)) }

export interface Chiller {
  id: string
  name: string
  location: string

  // Electrical
  kw: number            // compressor electrical input
  chwPumpKW: number
  cwPumpKW: number
  ctFanKW: number

  // Chilled water side
  chwST: number
  chwRT: number
  chwSP: number
  chwFlow: number       // L/s, actual (CH-AI-003)
  chwFlowSP: number     // L/s, AI setpoint (CH-AO-002)
  chwPumpSpeed: number  // % actual VFD feedback
  chwPumpSpeedSP: number
  dps02: number         // kPa — furthest-point differential pressure sensor (§3.2)
  dps03: number

  // Condenser water side
  cwST: number
  cwRT: number
  cwSP: number
  cwFlow: number
  cwFlowSP: number
  cwPumpSpeed: number
  cwPumpSpeedSP: number
  ctFanSpeed: number    // % feedback — local loop driven by CW supply temp setpoint
  condenserFlowRatio: number  // GPM/RT
  approach: number      // °C — CW supply temp − ambient wet-bulb

  // Run status (DI)
  chillerRun: boolean
  chwPumpRun: boolean
  cwPumpRun: boolean
  ctRun: boolean

  // Derived cooling-capacity / efficiency (computed from flow × ΔT, not randomised)
  coolingCapacityKW: number
  coolingCapacityRT: number
  cop: number
  kwPerRT: number
  /** Per-chiller design efficiency baseline — flow is derived to track this (± noise), not the other way round. */
  baseCOP: number

  load: number
  runHours: number
  health: 'ok' | 'warning' | 'critical'

  copHistory: number[]
  kwHistory: number[]
  coolingCapHistory: number[]  // RT — derived from kwHistory × copHistory for a consistent trend
}

const DEFS = [
  { id: 'CH-01', name: 'CH-01', location: 'T2 Plant Room' },
  { id: 'CH-02', name: 'CH-02', location: 'T2 Plant Room' },
  { id: 'CH-03', name: 'CH-03', location: 'T3 Plant Room' },
  { id: 'CH-04', name: 'CH-04', location: 'T3 Plant Room' },
  { id: 'CH-05', name: 'CH-05', location: 'T5 Plant Room' },
]

/** Recompute every quantity that's a function of flow/ΔT/kW rather than an independent random point. */
function deriveChiller(c: Chiller, wetBulb: number) {
  const chwDeltaT = c.chwRT - c.chwST
  c.coolingCapacityKW = c.chwFlow * chwDeltaT * SPECIFIC_HEAT
  c.coolingCapacityRT = c.coolingCapacityKW / KW_PER_RT
  c.cop = c.coolingCapacityKW / c.kw
  c.kwPerRT = c.kw / c.coolingCapacityRT
  c.condenserFlowRatio = (c.cwFlow * LS_TO_GPM) / c.coolingCapacityRT
  c.approach = c.cwST - wetBulb
  c.chwPumpKW = RATED_CHW_PUMP_KW * (c.chwPumpSpeed / 100) ** 3
  c.cwPumpKW = RATED_CW_PUMP_KW * (c.cwPumpSpeed / 100) ** 3
  c.ctFanKW = RATED_CT_FAN_KW * (c.ctFanSpeed / 100) ** 3
}

function computeChillerHealth(c: Pick<Chiller, 'cop' | 'chwST' | 'chwSP' | 'approach'>): Chiller['health'] {
  if (c.cop < 3.5) return 'critical'
  if (c.cop < 3.8 || c.chwST > c.chwSP + 1.5 || c.approach > 8.5) return 'warning'
  return 'ok'
}

/** Flow is derived to track a per-chiller design COP (± noise) rather than being randomised
 *  independently of kW — that independence is what let COP swing to unrealistic values (e.g. 7+). */
function flowForTargetCOP(kw: number, baseCOP: number, chwDeltaT: number): number {
  const targetCOP = clamp(3.3, 6.0, gaussian(baseCOP, 0.15))
  const targetCapacityKW = kw * targetCOP
  return clamp(100, 360, targetCapacityKW / (chwDeltaT * SPECIFIC_HEAT))
}

function makeChiller(def: { id: string; name: string; location: string }): Chiller {
  const kw = clamp(800, 1500, gaussian(1100, 100))
  const chwST = clamp(6.5, 8.5, gaussian(7.2, 0.3))
  const chwRT = clamp(11, 14, gaussian(12.5, 0.5))
  const cwST = clamp(28, 32, gaussian(30, 0.8))
  const cwRT = clamp(34, 38, gaussian(36, 0.8))
  const load = clamp(30, 100, gaussian(65, 10))
  const loadFrac = load / 100
  const baseCOP = clamp(3.8, 5.2, gaussian(4.4, 0.35))
  const chwFlow = flowForTargetCOP(kw, baseCOP, chwRT - chwST)
  const heatRejectKW = chwFlow * (chwRT - chwST) * SPECIFIC_HEAT + kw
  const cwFlow = clamp(150, 420, (heatRejectKW * (1 + gaussian(0, 0.02))) / ((cwRT - cwST) * SPECIFIC_HEAT))
  const chwPumpSpeed = clamp(40, 100, gaussian(40 + loadFrac * 60, 5))
  const cwPumpSpeed = clamp(40, 100, gaussian(40 + loadFrac * 58, 5))
  const ctFanSpeed = clamp(40, 100, gaussian(70, 10))

  const c: Chiller = {
    ...def,
    kw, chwPumpKW: 0, cwPumpKW: 0, ctFanKW: 0,
    chwST, chwRT,
    chwSP: clamp(5.5, 8.5, gaussian(7.0, 0.5)),
    chwFlow, chwFlowSP: clamp(120, 340, chwFlow - gaussian(3, 2)),
    chwPumpSpeed, chwPumpSpeedSP: clamp(40, 100, chwPumpSpeed - gaussian(1, 1.5)),
    dps02: clamp(70, 130, gaussian(100, 8)),
    dps03: clamp(70, 130, gaussian(100, 8)),
    cwST, cwRT,
    cwSP: clamp(27, 32, gaussian(29, 1)),
    cwFlow, cwFlowSP: clamp(150, 420, cwFlow - gaussian(3, 2)),
    cwPumpSpeed, cwPumpSpeedSP: clamp(40, 100, cwPumpSpeed - gaussian(1, 1.5)),
    ctFanSpeed,
    condenserFlowRatio: 0, approach: 0,
    chillerRun: true, chwPumpRun: true, cwPumpRun: true, ctRun: true,
    coolingCapacityKW: 0, coolingCapacityRT: 0, cop: 0, kwPerRT: 0, baseCOP,
    load, runHours: Math.round(gaussian(14000, 500)),
    health: 'ok',
    copHistory: genHistory(t => gaussian(baseCOP - 0.6 + airportLoad(t) * 1.2, 0.15), 0.1, MAX_HISTORY_DAYS),
    kwHistory: genHistory(t => gaussian(600 + airportLoad(t) * 900, 30), 20, MAX_HISTORY_DAYS),
    coolingCapHistory: [],
  }
  deriveChiller(c, 24)
  c.health = computeChillerHealth(c)
  c.coolingCapHistory = c.kwHistory.map((kwPt, i) => (kwPt * c.copHistory[i]) / KW_PER_RT)
  return c
}

export class ChillerStore {
  chillers: Chiller[] = DEFS.map(makeChiller)
  mechFanKw = gaussian(65, 8)
  wetBulb = 24
  headerChwFlow = 0
  headerCwFlow = 0
  private ahu: AHUStore

  constructor(ahu: AHUStore) {
    this.ahu = ahu
    makeAutoObservable(this)
    this.updateHeaders()
    setInterval(() => this.tick(), 5000)
  }

  /** Real AHU fan power, not an independently-randomised duplicate — this is the same
   *  number the AHU page shows, so the two pages can never visibly disagree. */
  get airsideKw()           { return this.ahu.totalFanKw }
  get chillerPlantKw()      { return this.chillers.reduce((s, c) => s + c.kw, 0) }
  get avgCOP()              { return this.chillers.reduce((s, c) => s + c.cop, 0) / this.chillers.length }
  get avgCHWST()            { return this.chillers.reduce((s, c) => s + c.chwST, 0) / this.chillers.length }
  get avgCWST()             { return this.chillers.reduce((s, c) => s + c.cwST, 0) / this.chillers.length }
  get totalCoolingCapRT()   { return this.chillers.reduce((s, c) => s + c.coolingCapacityRT, 0) }
  get avgKwPerRT()          { return this.chillerPlantKw / this.totalCoolingCapRT }
  get plantAuxKw()          { return this.chillers.reduce((s, c) => s + c.chwPumpKW + c.cwPumpKW + c.ctFanKW, 0) }

  private updateHeaders() {
    const sumChw = this.chillers.reduce((s, c) => s + c.chwFlow, 0)
    const sumCw = this.chillers.reduce((s, c) => s + c.cwFlow, 0)
    this.headerChwFlow = sumChw * (1 + gaussian(0, 0.015))
    this.headerCwFlow = sumCw * (1 + gaussian(0, 0.015))
  }

  get flowConsistencyErrorPct() {
    const sumChw = this.chillers.reduce((s, c) => s + c.chwFlow, 0)
    return Math.abs(sumChw - this.headerChwFlow) / this.headerChwFlow * 100
  }

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
      const condenserRange = c.cwRT - c.cwST
      if (condenserRange > 7.5) {
        out.push({
          ruleId: 'CHI-002', severity: 'warning', unit: c.id,
          title: 'High Condenser Range',
          detail: `${c.name} CW ΔT = ${condenserRange.toFixed(1)}°C suggests cooling tower fouling or low condenser flow.`,
          recommendation: 'Inspect cooling tower fill, nozzles and basin. Check CW pump flow.',
          triggerValue: `CW ΔT = ${condenserRange.toFixed(1)}°C`,
        })
      }
      if (c.cop < 3.8) {
        out.push({
          ruleId: 'CHI-003', severity: c.cop < 3.5 ? 'critical' : 'warning', unit: c.id,
          title: 'Low COP Detected',
          detail: `${c.name} COP = ${c.cop.toFixed(2)} (cooling capacity ${c.coolingCapacityRT.toFixed(0)} RT ÷ ${c.kw.toFixed(0)} kW electrical) is below efficiency threshold.`,
          recommendation: 'Review refrigerant charge, compressor health, and heat exchanger surfaces.',
          triggerValue: `COP = ${c.cop.toFixed(2)}`,
        })
      }
      if (c.approach > 7) {
        out.push({
          ruleId: 'CHI-004', severity: c.approach > 8.5 ? 'critical' : 'warning', unit: c.id,
          title: 'High Cooling Tower Approach',
          detail: `${c.name} approach (CW supply ${c.cwST.toFixed(1)}°C − wet-bulb ${this.wetBulb.toFixed(1)}°C) = ${c.approach.toFixed(1)}°C, indicating reduced tower heat-rejection performance.`,
          recommendation: 'Inspect cooling tower fill/nozzles for scaling or fouling; verify fan operation.',
          triggerValue: `Approach = ${c.approach.toFixed(1)}°C`,
        })
      }
    }
    if (this.flowConsistencyErrorPct > 2) {
      out.push({
        ruleId: 'PLANT-001', severity: this.flowConsistencyErrorPct > 4 ? 'critical' : 'warning', unit: 'Plant',
        title: 'CHW Flow Consistency Check Failed',
        detail: `Sum of individual chiller CHW flows deviates ${this.flowConsistencyErrorPct.toFixed(1)}% from the CHW header flow meter reading (FDS §8 consistency check).`,
        recommendation: 'Verify header flow meter calibration and check for unmetered bypass flow.',
        triggerValue: `${this.flowConsistencyErrorPct.toFixed(1)}% deviation`,
      })
    }
    return out
  }

  private tick() {
    const t = new Date().getHours() + new Date().getMinutes() / 60
    const load = airportLoad(t)
    this.wetBulb = clamp(20, 28, gaussian(this.wetBulb, 0.3))

    for (const c of this.chillers) {
      c.kw           = clamp(800, 1500, gaussian(600 + load * 900, 20))
      c.load          = clamp(30, 100, gaussian(30 + load * 70, 3))
      c.chwST         = clamp(6.5, 8.5, gaussian(7.2, 0.2))
      c.chwRT         = clamp(11, 14, gaussian(12.5, 0.3))
      c.chwSP         = clamp(5.5, 8.5, gaussian(7.0 - load * 0.5, 0.3))
      c.cwST          = clamp(28, 32, gaussian(30, 0.5))
      c.cwRT          = clamp(34, 38, gaussian(36, 0.5))
      c.cwSP          = clamp(27, 32, gaussian(29, 0.5))

      c.chwFlow       = flowForTargetCOP(c.kw, c.baseCOP, c.chwRT - c.chwST)
      c.chwFlowSP     = clamp(100, 360, c.chwFlow - gaussian(3, 2))
      const heatRejectKW = c.chwFlow * (c.chwRT - c.chwST) * SPECIFIC_HEAT + c.kw
      c.cwFlow        = clamp(150, 420, (heatRejectKW * (1 + gaussian(0, 0.02))) / ((c.cwRT - c.cwST) * SPECIFIC_HEAT))
      c.cwFlowSP      = clamp(150, 420, c.cwFlow - gaussian(3, 2))

      c.ctFanSpeed    = clamp(40, 100, gaussian(40 + load * 60, 5))
      c.chwPumpSpeed  = clamp(40, 100, gaussian(40 + load * 60, 5))
      c.chwPumpSpeedSP= clamp(40, 100, c.chwPumpSpeed - gaussian(1, 1.5))
      c.cwPumpSpeed   = clamp(40, 100, gaussian(40 + load * 58, 5))
      c.cwPumpSpeedSP = clamp(40, 100, c.cwPumpSpeed - gaussian(1, 1.5))

      c.dps02         = clamp(70, 130, gaussian(100, 8))
      c.dps03         = clamp(70, 130, gaussian(100, 8))

      deriveChiller(c, this.wetBulb)
      c.health        = computeChillerHealth(c)
    }
    this.updateHeaders()
    this.mechFanKw = clamp(40, 90, gaussian(40 + load * 50, 5))
  }
}
