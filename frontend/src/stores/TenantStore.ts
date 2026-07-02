import { makeAutoObservable } from 'mobx'
import type { Finding } from '../types/fdd'
import { gaussian } from '../utils/history'

function clamp(min: number, max: number, v: number) { return Math.max(min, Math.min(max, v)) }

const TARIFF_GBP_PER_KWH = 0.25
const SAMPLE_SIZE = 20
const REAL_PORTFOLIO_SIZE = 500 // consultant's "~500 manually read meters"

export type MeteringType = 'automated' | 'manual' | 'deemed'
export type TenantCategory = 'Retail' | 'F&B' | 'Cargo' | 'Office'

export interface TenantMeter {
  id: string
  name: string
  zone: string
  category: TenantCategory
  meteringType: MeteringType
  baselineKwh: number       // expected monthly consumption (what's billed/allocated)
  consumptionKwh: number    // actual/estimated monthly consumption
  anomalyPct: number        // derived: (consumption - baseline) / baseline * 100
  daysSinceReading: number  // manual meters only; 0 for automated, -1 (N/A) for deemed
  history: number[]         // 7 daily kWh points, for the sparkline
  health: 'ok' | 'warning' | 'critical'
}

// Category baselines reflect airport-scale tenants (large-format F&B/retail, industrial cargo units),
// not typical high-street units.
const CATEGORY_BASE: Record<TenantCategory, { kwh: number; noise: number }> = {
  Retail: { kwh: 2000, noise: 400 },
  'F&B':  { kwh: 6000, noise: 1200 },
  Cargo:  { kwh: 15000, noise: 3000 },
  Office: { kwh: 1200, noise: 200 },
}

const ZONES = ['T1 Arrivals Hall', 'T2 Baggage Hall', 'T3 Main Hall', 'T5 Satellite', 'Cargo Village']

const DEFS: { id: string; name: string; zone: string; category: TenantCategory; meteringType: MeteringType }[] = [
  { id: 'TEN-01', name: 'WHSmith T1',            zone: 'T1 Arrivals Hall', category: 'Retail', meteringType: 'manual' },
  { id: 'TEN-02', name: 'Boots T2',               zone: 'T2 Baggage Hall',  category: 'Retail', meteringType: 'manual' },
  { id: 'TEN-03', name: 'Dixons Travel T3',       zone: 'T3 Main Hall',     category: 'Retail', meteringType: 'manual' },
  { id: 'TEN-04', name: 'World Duty Free T5',     zone: 'T5 Satellite',     category: 'Retail', meteringType: 'automated' },
  { id: 'TEN-05', name: 'Harrods T5',             zone: 'T5 Satellite',     category: 'Retail', meteringType: 'automated' },
  { id: 'TEN-06', name: 'Currency Exchange T2',   zone: 'T2 Baggage Hall',  category: 'Retail', meteringType: 'manual' },
  { id: 'TEN-07', name: 'Costa Coffee T1',        zone: 'T1 Arrivals Hall', category: 'F&B',    meteringType: 'manual' },
  { id: 'TEN-08', name: 'Wagamama T2',            zone: 'T2 Baggage Hall',  category: 'F&B',    meteringType: 'manual' },
  { id: 'TEN-09', name: 'Giraffe T3 Food Court',  zone: 'T3 Main Hall',     category: 'F&B',    meteringType: 'manual' },
  { id: 'TEN-10', name: 'Caviar House T5',        zone: 'T5 Satellite',     category: 'F&B',    meteringType: 'automated' },
  { id: 'TEN-11', name: 'Pret A Manger T1',       zone: 'T1 Arrivals Hall', category: 'F&B',    meteringType: 'deemed' },
  { id: 'TEN-12', name: 'DHL Cargo Unit 4',       zone: 'Cargo Village',    category: 'Cargo',  meteringType: 'manual' },
  { id: 'TEN-13', name: 'FedEx Cargo Unit 7',     zone: 'Cargo Village',    category: 'Cargo',  meteringType: 'manual' },
  { id: 'TEN-14', name: 'Swissport Cold Store',   zone: 'Cargo Village',    category: 'Cargo',  meteringType: 'deemed' },
  { id: 'TEN-15', name: 'Menzies Aviation Unit 2',zone: 'Cargo Village',    category: 'Cargo',  meteringType: 'manual' },
  { id: 'TEN-16', name: 'BA Admin Office T5',     zone: 'T5 Satellite',     category: 'Office', meteringType: 'manual' },
  { id: 'TEN-17', name: 'Virgin Atlantic Office T3', zone: 'T3 Main Hall',  category: 'Office', meteringType: 'manual' },
  { id: 'TEN-18', name: 'HAL Terminal Ops T1',    zone: 'T1 Arrivals Hall',category: 'Office',  meteringType: 'manual' },
  { id: 'TEN-19', name: 'Border Force Office T2', zone: 'T2 Baggage Hall', category: 'Office',  meteringType: 'manual' },
  { id: 'TEN-20', name: 'Aviation Security T5',   zone: 'T5 Satellite',    category: 'Office',  meteringType: 'manual' },
]

function computeHealth(m: Pick<TenantMeter, 'meteringType' | 'anomalyPct' | 'daysSinceReading'>): TenantMeter['health'] {
  const anomaly = Math.abs(m.anomalyPct)
  if (anomaly > 40) return 'critical'
  if (m.meteringType === 'manual' && m.daysSinceReading > 90) return 'critical'
  if (anomaly > 20 || (m.meteringType === 'manual' && m.daysSinceReading > 60)) return 'warning'
  return 'ok'
}

function makeMeter(def: typeof DEFS[0], index: number): TenantMeter {
  const cat = CATEGORY_BASE[def.category]
  const baselineKwh = Math.max(200, gaussian(cat.kwh, cat.noise * 0.3))
  // ~30% of the sample carries a deliberate positive bias — representing genuine under-billing,
  // not just meter-to-meter noise. Weighted toward manual/deemed meters, matching the consultant's
  // own framing that manual reading and unmetered areas are where the loss concentrates.
  const biased = (def.meteringType !== 'automated') && (index % 3 === 0)
  const anomalyPct = biased ? gaussian(30, 8) : gaussian(0, 6)
  const consumptionKwh = Math.max(0, baselineKwh * (1 + anomalyPct / 100))
  const daysSinceReading = def.meteringType === 'manual' ? Math.round(clamp(2, 120, gaussian(35, 25)))
                          : def.meteringType === 'deemed' ? -1 : 0
  const history = Array.from({ length: 7 }, () => Math.max(0, gaussian(consumptionKwh / 30, (cat.noise * 0.3) / 30)))

  return {
    ...def,
    baselineKwh, consumptionKwh, anomalyPct, daysSinceReading, history,
    health: computeHealth({ meteringType: def.meteringType, anomalyPct, daysSinceReading }),
  }
}

export class TenantStore {
  meters: TenantMeter[] = DEFS.map(makeMeter)

  constructor() {
    makeAutoObservable(this)
    setInterval(() => this.tick(), 5000)
  }

  get automatedCount() { return this.meters.filter(m => m.meteringType === 'automated').length }
  get manualCount()    { return this.meters.filter(m => m.meteringType === 'manual').length }
  get deemedCount()    { return this.meters.filter(m => m.meteringType === 'deemed').length }
  get totalTenantKwh() { return this.meters.reduce((s, m) => s + m.consumptionKwh, 0) }

  /** Sum of (consumption − baseline) across the sample, annualised at the standard tariff —
   *  only positive deviations count as "loss" (under-billed vs actual usage). */
  get sampleAnnualLossGbp() {
    return this.meters.reduce((s, m) => s + Math.max(0, m.consumptionKwh - m.baselineKwh), 0) * 12 * TARIFF_GBP_PER_KWH
  }

  /** Illustrative extrapolation to the consultant's ~500-meter portfolio. This is a detectable
   *  *subset* of their quoted £4-5m/year loss — billing/settlement errors and admin overhead
   *  outside meter-anomaly detection are not represented here, so it should read as "contributes
   *  to", not "equals", their estimate. */
  get extrapolatedAnnualLossGbp() {
    return (this.sampleAnnualLossGbp / SAMPLE_SIZE) * REAL_PORTFOLIO_SIZE
  }

  get allFindings(): Finding[] {
    const out: Finding[] = []
    for (const m of this.meters) {
      const anomaly = Math.abs(m.anomalyPct)
      if (m.meteringType !== 'deemed' && anomaly > 20) {
        out.push({
          ruleId: 'TEN-001', severity: anomaly > 40 ? 'critical' : 'warning', unit: m.id,
          title: 'Consumption Anomaly vs Billed Baseline',
          detail: `${m.name} (${m.zone}) is consuming ${m.consumptionKwh.toFixed(0)} kWh/mo vs a billed baseline of ${m.baselineKwh.toFixed(0)} kWh/mo — ${m.anomalyPct >= 0 ? '+' : ''}${m.anomalyPct.toFixed(0)}% deviation.`,
          recommendation: 'Flag for tenant billing review — likely under-billing if consumption consistently exceeds baseline.',
          triggerValue: `${m.anomalyPct >= 0 ? '+' : ''}${m.anomalyPct.toFixed(0)}% vs baseline`,
        })
      }
      if (m.meteringType === 'manual' && m.daysSinceReading > 60) {
        out.push({
          ruleId: 'TEN-002', severity: m.daysSinceReading > 90 ? 'critical' : 'warning', unit: m.id,
          title: 'Manual Meter Reading Overdue',
          detail: `${m.name} (${m.zone}) last read ${m.daysSinceReading} days ago — billing is running on a stale estimate.`,
          recommendation: 'Schedule a manual read, or prioritise this meter for automated metering upgrade.',
          triggerValue: `${m.daysSinceReading} days since reading`,
        })
      }
      if (m.meteringType === 'deemed') {
        out.push({
          ruleId: 'TEN-003', severity: 'info', unit: m.id,
          title: 'Deemed / Unmetered Area',
          detail: `${m.name} (${m.zone}) has no physical meter — consumption is estimated/allocated, not measured.`,
          recommendation: 'Candidate for a new sub-meter installation to convert from deemed allocation to measured billing.',
          triggerValue: 'No physical meter',
        })
      }
    }
    return out
  }

  private tick() {
    for (const m of this.meters) {
      if (m.meteringType === 'automated') {
        // Live-ish drift only for automated meters — manual/deemed values only change on a "reading".
        const cat = CATEGORY_BASE[m.category]
        m.consumptionKwh = Math.max(0, gaussian(m.consumptionKwh, cat.noise * 0.02))
        m.anomalyPct = ((m.consumptionKwh - m.baselineKwh) / m.baselineKwh) * 100
      } else if (m.meteringType === 'manual') {
        m.daysSinceReading = m.daysSinceReading + 1 / 288 // ~5-min ticks nudging the day counter forward
      }
      m.health = computeHealth(m)
    }
  }
}
