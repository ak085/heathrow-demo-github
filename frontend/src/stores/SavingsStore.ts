import { makeAutoObservable } from 'mobx'
import type { Finding } from '../types/fdd'

function gaussian(mean: number, std: number): number {
  return mean + std * Math.sqrt(-2 * Math.log(Math.random() + 1e-10)) * Math.cos(2 * Math.PI * Math.random())
}

export class SavingsStore {
  baselineDailyKwh = 18000
  actualDailyKwh   = Math.max(14000, Math.min(17000, gaussian(15300, 400)))
  copBaseline      = 3.8
  copActual        = Math.max(4.4, Math.min(5.2, gaussian(4.7, 0.2)))
  weeklyBarData: { day: string; baseline: number; actual: number }[] = []
  fddSummary = { open: 0, resolvedThisWeek: 5, criticalOpen: 0 }

  constructor() {
    makeAutoObservable(this)
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    this.weeklyBarData = days.map(day => {
      const baseline = Math.max(16000, gaussian(18000, 800))
      const actual   = baseline * Math.max(0.80, Math.min(0.90, gaussian(0.85, 0.02)))
      return { day, baseline, actual }
    })
    setInterval(() => this.tick(), 5000)
  }

  get savingsPct()        { return ((this.baselineDailyKwh - this.actualDailyKwh) / this.baselineDailyKwh) * 100 }
  get savingsKwhToday()   { return this.baselineDailyKwh - this.actualDailyKwh }
  get savingsGbpToday()   { return this.savingsKwhToday * 0.25 }
  get copImprovement()    { return ((this.copActual - this.copBaseline) / this.copBaseline) * 100 }
  get annualisedGbp()     { return this.savingsGbpToday * 365 }

  get allFindings(): Finding[] { return [] }

  updateFDD(open: number, critical: number) {
    this.fddSummary = { ...this.fddSummary, open, criticalOpen: critical }
  }

  private tick() {
    this.actualDailyKwh = Math.max(14000, Math.min(17000, gaussian(15300, 200)))
    this.copActual      = Math.max(4.4,   Math.min(5.2,   gaussian(4.7, 0.1)))
  }
}
