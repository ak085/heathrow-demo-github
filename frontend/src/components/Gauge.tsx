import React from 'react'
import ReactECharts from 'echarts-for-react'
import { useStore } from '../stores'
import { useEchartsTheme } from '../theme/echartsTheme'
import { zonesToGaugeStops, type RangeZone } from './RangeBar'

interface GaugeProps {
  label: string
  value: number
  min: number
  max: number
  zones: RangeZone[]
  unit?: string
  precision?: number
  height?: number
}

/** Radial gauge for a single hero KPI — used sparingly, one per page/card at most. */
export const Gauge: React.FC<GaugeProps> = ({ label, value, min, max, zones, unit = '', precision = 2, height = 180 }) => {
  const store = useStore()
  const theme = useEchartsTheme()
  const textColor = store.darkMode ? 'rgba(255,255,255,0.85)' : '#262626'
  const mutedColor = store.darkMode ? 'rgba(255,255,255,0.45)' : '#8c8c8c'
  const stops = zonesToGaugeStops(zones, min, max)

  const option = {
    series: [{
      type: 'gauge',
      min, max,
      startAngle: 210, endAngle: -30,
      radius: '92%',
      progress: { show: false },
      axisLine: { lineStyle: { width: 12, color: stops } },
      pointer: { itemStyle: { color: textColor }, width: 4 },
      axisTick: { show: false },
      splitLine: { length: 10, lineStyle: { color: mutedColor, width: 1.5 } },
      axisLabel: { show: false },
      anchor: { show: true, size: 12, itemStyle: { color: textColor } },
      title: { show: true, offsetCenter: [0, '70%'], color: mutedColor, fontSize: 12 },
      detail: {
        valueAnimation: true,
        offsetCenter: [0, '35%'],
        formatter: (v: number) => `${v.toFixed(precision)}${unit}`,
        color: textColor, fontSize: 22, fontWeight: 700,
      },
      data: [{ value, name: label }],
    }],
  }
  return <ReactECharts option={option} theme={theme} style={{ height }} />
}

export default Gauge
