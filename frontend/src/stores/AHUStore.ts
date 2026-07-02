import { makeAutoObservable } from 'mobx'
import type { Finding } from '../types/fdd'
import { gaussian, airportLoad, genHistory, MAX_HISTORY_DAYS } from '../utils/history'

const RATED_FAN_KW = 30
const RATED_FRESH_AIR_FAN_KW = 15

function clamp(min: number, max: number, v: number) { return Math.max(min, Math.min(max, v)) }

export type AHUType = 'control-station' | 'electrical-room'

export interface AHU {
  id: string
  name: string
  zone: string
  type: AHUType

  sat: number
  satSP: number
  rat: number

  chwValve: number      // actual position feedback, %
  chwValveCmd: number   // AI/local-loop command, %

  fanSpeed: number       // EC fan actual, %
  fanSP: number          // EC fan AI setpoint, %
  fanKW: number

  co2: number            // ppm — control-station only
  freshAirSpeed: number
  freshAirSpeedSP: number
  freshAirFanKW: number
  freshAirFanRun: boolean

  hvlsOn: boolean         // DI/DO — AI only switches ON/OFF
  hvlsFixedSpeed: number  // AV — set at commissioning, does not change

  zoneTemp: number
  zoneTempSP: number      // 27°C fan-on / 25°C fan-off (control-station); fixed 27°C (electrical-room)

  filterDP: number
  health: 'ok' | 'warning' | 'critical'

  co2History: number[]
  freshAirHistory: number[]
  fanKwHistory: number[]
}

const DEFS: { id: string; name: string; zone: string; type: AHUType }[] = [
  { id: 'AHU-T1-01', name: 'AHU-T1-01', zone: 'T1 Arrivals Hall',        type: 'control-station' },
  { id: 'AHU-T1-02', name: 'AHU-T1-02', zone: 'T1 Departures',           type: 'control-station' },
  { id: 'AHU-T2-01', name: 'AHU-T2-01', zone: 'T2 Departures Gate A',    type: 'control-station' },
  { id: 'AHU-T2-02', name: 'AHU-T2-02', zone: 'T2 Departures Gate B',    type: 'control-station' },
  { id: 'AHU-T2-03', name: 'AHU-T2-03', zone: 'T2 Baggage Hall',         type: 'control-station' },
  { id: 'AHU-T3-01', name: 'AHU-T3-01', zone: 'T3 Main Hall',            type: 'control-station' },
  { id: 'AHU-T3-02', name: 'AHU-T3-02', zone: 'T3 Gate Pier',            type: 'control-station' },
  { id: 'AHU-T3-EL', name: 'AHU-T3-EL', zone: 'T3 Electrical Room',      type: 'electrical-room' },
  { id: 'AHU-T5-01', name: 'AHU-T5-01', zone: 'T5 Satellite',            type: 'control-station' },
  { id: 'AHU-T5-EL', name: 'AHU-T5-EL', zone: 'T5 Electrical Room',      type: 'electrical-room' },
]

function computeHealth(a: Pick<AHU, 'type' | 'co2' | 'filterDP' | 'sat' | 'satSP' | 'chwValve' | 'chwValveCmd'>): AHU['health'] {
  const satDev = Math.abs(a.sat - a.satSP)
  const valveDev = Math.abs(a.chwValve - a.chwValveCmd)
  const isCS = a.type === 'control-station'
  if (isCS && a.co2 > 1000) return 'critical'
  if ((isCS && a.co2 > 800) || a.filterDP > 200 || satDev > 2 || valveDev > 12) return 'warning'
  return 'ok'
}

function makeAHU(def: { id: string; name: string; zone: string; type: AHUType }): AHU {
  const isCS = def.type === 'control-station'
  const co2 = isCS ? clamp(400, 1100, gaussian(650, 100)) : 0
  const satSP = clamp(13, 16, gaussian(14.5, 0.8))
  const sat = clamp(12, 18, gaussian(satSP + 0.3, 0.5))
  const fanSpeed = clamp(40, 100, gaussian(70, 10))
  const hvlsOn = isCS ? Math.random() > 0.3 : false
  const freshAirSpeed = isCS ? clamp(20, 100, 20 + (co2 - 400) / 700 * 80) : 0
  const chwValveCmd = clamp(0, 100, 50 + (sat - satSP) * 15)
  const chwValve = clamp(0, 100, gaussian(chwValveCmd, 3))
  const filterDP = clamp(80, 230, gaussian(140, 30))

  return {
    ...def,
    sat, satSP,
    rat: clamp(22, 27, gaussian(24, 0.8)),
    chwValve, chwValveCmd,
    fanSpeed, fanSP: clamp(40, 100, gaussian(fanSpeed - 2, 3)),
    fanKW: RATED_FAN_KW * (fanSpeed / 100) ** 3,
    co2, freshAirSpeed, freshAirSpeedSP: clamp(20, 100, freshAirSpeed - gaussian(1, 1.5)),
    freshAirFanKW: isCS ? RATED_FRESH_AIR_FAN_KW * (freshAirSpeed / 100) ** 3 : 0,
    freshAirFanRun: isCS,
    hvlsOn, hvlsFixedSpeed: isCS ? Math.round(clamp(50, 75, gaussian(62, 6))) : 0,
    zoneTemp: clamp(23, 28, gaussian(25, 0.8)),
    zoneTempSP: isCS ? (hvlsOn ? 27 : 25) : 27,
    filterDP,
    health: computeHealth({ type: def.type, co2, filterDP, sat, satSP, chwValve, chwValveCmd }),
    co2History: isCS ? genHistory(t => gaussian(400 + airportLoad(t) * 600, 40), 30, MAX_HISTORY_DAYS) : [],
    freshAirHistory: isCS ? genHistory(t => gaussian(20 + airportLoad(t) * 60, 8), 5, MAX_HISTORY_DAYS) : [],
    fanKwHistory: genHistory(t => gaussian(RATED_FAN_KW * (0.4 + airportLoad(t) * 0.6) ** 3, 1.5), 0.5, MAX_HISTORY_DAYS),
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
  get avgCO2()   { const cs = this.ahus.filter(a => a.type === 'control-station'); return cs.reduce((s, a) => s + a.co2, 0) / cs.length }
  get totalFanKw() { return this.ahus.reduce((s, a) => s + a.fanKW + a.freshAirFanKW, 0) }
  get normalCount() { return this.ahus.filter(a => a.health === 'ok').length }
  get filterAlerts() { return this.ahus.filter(a => a.filterDP > 200).length }

  get allFindings(): Finding[] {
    const out: Finding[] = []
    for (const a of this.ahus) {
      if (a.type === 'control-station') {
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
      const valveDev = Math.abs(a.chwValve - a.chwValveCmd)
      if (valveDev > 12) {
        out.push({
          ruleId: 'AHU-004', severity: 'warning', unit: a.id,
          title: 'CHW Valve Tracking Error',
          detail: `${a.name} valve feedback ${a.chwValve.toFixed(0)}% deviates ${valveDev.toFixed(0)}% from AI command ${a.chwValveCmd.toFixed(0)}% — possible actuator/linkage fault.`,
          recommendation: 'Inspect valve actuator, linkage and control signal wiring.',
          triggerValue: `Δ = ${valveDev.toFixed(0)}%`,
        })
      }
    }
    return out
  }

  private tick() {
    const t = new Date().getHours() + new Date().getMinutes() / 60
    const load = airportLoad(t)
    for (const a of this.ahus) {
      const isCS = a.type === 'control-station'
      a.satSP        = clamp(13, 16, gaussian(15.5 - load * 1.5, 0.3))
      a.sat          = clamp(12, 18, gaussian(a.satSP + 0.3, 0.5))
      a.rat          = clamp(22, 27, gaussian(24, 0.5))
      a.chwValveCmd  = clamp(0, 100, 50 + (a.sat - a.satSP) * 15 + (load - 0.6) * 25)
      a.chwValve     = clamp(0, 100, gaussian(a.chwValveCmd, 3))
      a.fanSpeed     = clamp(40, 100, gaussian(40 + load * 60, 5))
      a.fanSP        = clamp(40, 100, a.fanSpeed - Math.abs(gaussian(2, 2)))
      a.fanKW        = RATED_FAN_KW * (a.fanSpeed / 100) ** 3

      if (isCS) {
        a.co2            = clamp(400, 1100, gaussian(400 + load * 600, 40))
        a.freshAirSpeed  = clamp(20, 100, 20 + (a.co2 - 400) / 700 * 80)
        a.freshAirSpeedSP= clamp(20, 100, a.freshAirSpeed - gaussian(1, 1.5))
        a.freshAirFanKW  = RATED_FRESH_AIR_FAN_KW * (a.freshAirSpeed / 100) ** 3
        a.zoneTempSP     = a.hvlsOn ? 27 : 25
      }
      a.zoneTemp     = clamp(23, 28, gaussian(a.zoneTempSP - 2 + load, 0.5))
      a.filterDP     = clamp(80, 230, gaussian(140, 5))
      a.health       = computeHealth(a)
    }
  }
}
