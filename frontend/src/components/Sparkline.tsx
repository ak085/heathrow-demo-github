import React from 'react'
import ReactECharts from 'echarts-for-react'
import { useEchartsTheme } from '../theme/echartsTheme'

interface SparklineProps {
  data: number[]
  color?: string
  width?: number
  height?: number
}

/** Minimal axis-less trend line for dense table cells. */
export const Sparkline: React.FC<SparklineProps> = ({ data, color = '#5a0057', width = 100, height = 28 }) => {
  const theme = useEchartsTheme()
  const option = {
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: 'category' as const, show: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value' as const, show: false, min: 'dataMin' as const, max: 'dataMax' as const },
    series: [{
      type: 'line' as const, data, showSymbol: false, smooth: true,
      lineStyle: { color, width: 1.5 },
      areaStyle: { color, opacity: 0.12 },
    }],
    tooltip: { show: false },
  }
  return (
    <ReactECharts
      option={option}
      theme={theme}
      style={{ width, height }}
      opts={{ renderer: 'svg' }}
    />
  )
}

export default Sparkline
