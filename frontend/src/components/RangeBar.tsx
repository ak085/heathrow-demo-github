import React from 'react'
import { useStore } from '../stores'

export type ZoneLevel = 'critical' | 'warning' | 'ok'

export interface RangeZone {
  level: ZoneLevel
  from: number
  to: number
}

export const ZONE_COLOR: Record<ZoneLevel, string> = {
  critical: '#ff4d4f',
  warning: '#faad14',
  ok: '#52c41a',
}

/** Convert contiguous RangeZones into ECharts gauge `axisLine.lineStyle.color` stops. */
export function zonesToGaugeStops(zones: RangeZone[], min: number, max: number): [number, string][] {
  const span = max - min || 1
  return zones.map(z => [Math.min(1, Math.max(0, (z.to - min) / span)), ZONE_COLOR[z.level]])
}

/** Contiguous zones covering [min,max] — critical-low / warning-low / ok / warning-high / critical-high.
 *  Pass null for a bound that doesn't apply (e.g. PF has no upper warn/crit — it's capped at 1.0). */
export function buildZones(opts: {
  min: number
  max: number
  critLow?: number
  warnLow?: number
  warnHigh?: number
  critHigh?: number
}): RangeZone[] {
  const { min, max, critLow, warnLow, warnHigh, critHigh } = opts
  const zones: RangeZone[] = []
  let cursor = min
  if (critLow !== undefined) { zones.push({ level: 'critical', from: cursor, to: critLow }); cursor = critLow }
  if (warnLow !== undefined) { zones.push({ level: 'warning', from: cursor, to: warnLow }); cursor = warnLow }
  const okEnd = warnHigh ?? critHigh ?? max
  zones.push({ level: 'ok', from: cursor, to: okEnd })
  cursor = okEnd
  if (warnHigh !== undefined) {
    const warnEnd = critHigh ?? max
    zones.push({ level: 'warning', from: cursor, to: warnEnd })
    cursor = warnEnd
  }
  if (critHigh !== undefined) { zones.push({ level: 'critical', from: cursor, to: max }) }
  return zones
}

export function zoneAt(zones: RangeZone[], value: number): ZoneLevel {
  for (const z of zones) {
    if (value >= z.from && value <= z.to) return z.level
  }
  if (zones.length && value < zones[0].from) return zones[0].level
  if (zones.length && value > zones[zones.length - 1].to) return zones[zones.length - 1].level
  return 'ok'
}

interface RangeBarProps {
  label: string
  value: number
  unit?: string
  min: number
  max: number
  zones: RangeZone[]
  precision?: number
  compact?: boolean
  /** No label row / no min-max footer — just the bar + value, sized for a table cell. */
  bare?: boolean
  barWidth?: number
  /** Optional AI setpoint — rendered as a dashed marker distinct from the actual-value triangle. */
  target?: number
  targetLabel?: string
}

export const RangeBar: React.FC<RangeBarProps> = ({
  label, value, unit = '', min, max, zones, precision = 1, compact = false,
  bare = false, barWidth = 70,
  target, targetLabel = 'AI setpoint',
}) => {
  const store = useStore()
  const dark = store.darkMode
  const span = max - min || 1
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - min) / span) * 100))
  const level = zoneAt(zones, value)
  const glow = level !== 'ok'
  const trackColor = dark ? '#303030' : '#f0f0f0'
  const textMuted = dark ? 'rgba(255,255,255,0.45)' : '#8c8c8c'
  const textStrong = dark ? 'rgba(255,255,255,0.85)' : '#262626'

  const track = (
      <div style={{
        position: 'relative', height: compact ? 8 : 10, borderRadius: 5,
        background: trackColor, overflow: 'visible',
        boxShadow: glow ? `0 0 6px ${ZONE_COLOR[level]}66` : 'none',
        border: glow ? `1px solid ${ZONE_COLOR[level]}` : `1px solid ${dark ? '#303030' : '#e8e8e8'}`,
      }}>
        {/* zone segments */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: 5, overflow: 'hidden', display: 'flex' }}>
          {zones.map((z, i) => (
            <div key={i} style={{
              width: `${pct(z.to) - pct(z.from)}%`,
              background: ZONE_COLOR[z.level],
              opacity: z.level === 'ok' ? 0.35 : 0.55,
            }} />
          ))}
        </div>
        {/* marker */}
        <div style={{
          position: 'absolute', left: `calc(${pct(value)}% - 5px)`, top: -3,
          width: 0, height: 0,
          borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
          borderTop: `7px solid ${ZONE_COLOR[level]}`,
          filter: glow ? `drop-shadow(0 0 3px ${ZONE_COLOR[level]})` : 'none',
        }} />
        {/* AI setpoint marker */}
        {target !== undefined && (
          <div title={`${targetLabel}: ${target.toFixed(precision)}${unit}`} style={{
            position: 'absolute', left: `${pct(target)}%`, top: -4, bottom: -4,
            width: 0, borderLeft: '2px dashed #1677ff',
          }} />
        )}
      </div>
  )

  if (bare) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: barWidth, flexShrink: 0 }}>{track}</div>
        <span style={{ fontSize: 12, fontWeight: 600, color: level === 'ok' ? textStrong : ZONE_COLOR[level] }}>
          {value.toFixed(precision)}{unit}
        </span>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: compact ? 10 : 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: compact ? 11 : 12, color: textMuted }}>{label}</span>
        <span style={{
          fontSize: compact ? 14 : 17, fontWeight: 700,
          color: ZONE_COLOR[level] !== '#52c41a' ? ZONE_COLOR[level] : textStrong,
        }}>
          {value.toFixed(precision)}{unit}
          {target !== undefined && (
            <span style={{ fontSize: compact ? 10 : 11, fontWeight: 400, color: '#1677ff', marginLeft: 6 }}>
              ({targetLabel} {target.toFixed(precision)}{unit})
            </span>
          )}
        </span>
      </div>
      {track}
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          <span style={{ fontSize: 10, color: textMuted }}>{min}{unit}</span>
          <span style={{ fontSize: 10, color: textMuted }}>{max}{unit}</span>
        </div>
      )}
    </div>
  )
}

export default RangeBar
