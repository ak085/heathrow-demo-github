export const POINTS_PER_DAY = 288 // 24h × 5-min
export const MAX_HISTORY_DAYS = 7

export function gaussian(mean: number, std: number): number {
  return mean + std * Math.sqrt(-2 * Math.log(Math.random() + 1e-10)) * Math.cos(2 * Math.PI * Math.random())
}

export function airportLoad(t: number): number {
  return 0.45 + 0.35 * (
    Math.exp(-0.5 * ((t - 8.5) / 1.5) ** 2) +
    Math.exp(-0.5 * ((t - 16) / 2) ** 2)
  )
}

/** Generates `days` × 288 points. baseFn receives hour-of-day (0-24), a per-day
 *  wobble keeps weekday/weekend-ish variation so a 7D view isn't just the same day repeated. */
export function genHistory(baseFn: (hourOfDay: number) => number, noise: number, days = 1): number[] {
  const n = Math.min(days, MAX_HISTORY_DAYS) * POINTS_PER_DAY
  return Array.from({ length: n }, (_, i) => {
    const dayIdx = Math.floor(i / POINTS_PER_DAY)
    const hourOfDay = (i % POINTS_PER_DAY) * (24 / POINTS_PER_DAY)
    const dayWobble = 1 + Math.sin(dayIdx * 1.7) * 0.04
    return Math.max(0, gaussian(baseFn(hourOfDay) * dayWobble, noise))
  })
}

/** Slice the trailing `windowDays` from a full history array + build matching time labels. */
export function windowHistory(history: number[], windowDays: number): number[] {
  const n = Math.min(windowDays, MAX_HISTORY_DAYS) * POINTS_PER_DAY
  return history.slice(Math.max(0, history.length - n))
}

export function timeLabels(windowDays: number): string[] {
  const n = Math.min(windowDays, MAX_HISTORY_DAYS) * POINTS_PER_DAY
  return Array.from({ length: n }, (_, i) => {
    const dayIdx = Math.floor(i / POINTS_PER_DAY)
    const hourOfDay = (i % POINTS_PER_DAY) * (24 / POINTS_PER_DAY)
    const h = Math.floor(hourOfDay)
    const m = Math.round((hourOfDay - h) * 60)
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    return windowDays > 1 ? `D${dayIdx + 1} ${time}` : time
  })
}

/** Sparse axis-label interval so labels don't overlap regardless of window length. */
export function labelInterval(windowDays: number): number {
  const n = Math.min(windowDays, MAX_HISTORY_DAYS) * POINTS_PER_DAY
  return Math.floor(n / 6)
}

/** Per-day energy (kWh) from a kW time series at 5-min resolution — for daily bar charts. */
export function dailyEnergyKwh(history: number[]): number[] {
  const days = Math.floor(history.length / POINTS_PER_DAY)
  return Array.from({ length: days }, (_, d) => {
    const chunk = history.slice(d * POINTS_PER_DAY, (d + 1) * POINTS_PER_DAY)
    return chunk.reduce((s, kw) => s + kw * (5 / 60), 0)
  })
}

/** ECharts markLine config that draws a dashed vertical separator + "Day N" label at each
 *  midnight boundary — attach to the first series of any multi-day trend chart. Returns
 *  undefined for a 1-day window (nothing to separate). */
export function dayMarkLine(windowDays: number, dark: boolean) {
  const days = Math.min(windowDays, MAX_HISTORY_DAYS)
  if (days <= 1) return undefined
  const lineColor = dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.25)'
  const data = Array.from({ length: days - 1 }, (_, i) => ({
    xAxis: (i + 1) * POINTS_PER_DAY,
    label: { formatter: `Day ${i + 2}`, color: lineColor, fontSize: 10 },
  }))
  return {
    symbol: 'none' as const,
    silent: true,
    animation: false,
    lineStyle: { color: lineColor, type: 'dashed' as const, width: 1 },
    data,
  }
}
