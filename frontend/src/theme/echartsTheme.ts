import * as echarts from 'echarts'
import { useStore } from '../stores'

const LIGHT_TEXT = '#595959'
const DARK_TEXT = 'rgba(255,255,255,0.65)'
const LIGHT_SPLIT = '#eeeeee'
const DARK_SPLIT = 'rgba(255,255,255,0.09)'

const base = (textColor: string, splitColor: string) => ({
  backgroundColor: 'transparent',
  textStyle: { color: textColor },
  title: { textStyle: { color: textColor } },
  legend: { textStyle: { color: textColor } },
  tooltip: {
    backgroundColor: textColor === DARK_TEXT ? '#1f1f1f' : '#ffffff',
    borderColor: splitColor,
    textStyle: { color: textColor === DARK_TEXT ? '#fff' : '#262626' },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: splitColor } },
    axisLabel: { color: textColor },
    splitLine: { show: true, lineStyle: { color: splitColor } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: splitColor } },
    axisLabel: { color: textColor },
    splitLine: { show: true, lineStyle: { color: splitColor } },
  },
})

let registered = false

/** Call once at app startup. Registers 'heathrowLight' / 'heathrowDark' ECharts themes
 *  so every <ReactECharts theme={...}> picks up matching text/gridline colors without
 *  each page having to hardcode axis colors twice. */
export function registerEchartsThemes() {
  if (registered) return
  echarts.registerTheme('heathrowLight', base(LIGHT_TEXT, LIGHT_SPLIT))
  echarts.registerTheme('heathrowDark', base(DARK_TEXT, DARK_SPLIT))
  registered = true
}

export function useEchartsTheme(): 'heathrowLight' | 'heathrowDark' {
  const store = useStore()
  return store.darkMode ? 'heathrowDark' : 'heathrowLight'
}
