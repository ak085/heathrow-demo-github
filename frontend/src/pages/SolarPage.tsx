import React from 'react'
import { observer } from 'mobx-react-lite'
import { Tabs, Card, Row, Col, Statistic, Alert, Typography, Progress } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useStore } from '../stores'

const { Title, Paragraph } = Typography
const PURPLE = '#5a0057'
const SOLAR_GOLD = '#f59e0b'

const TIMES = Array.from({ length: 288 }, (_, i) => {
  const h = Math.floor(i * 24 / 288)
  const m = Math.round((i * 24 / 288 - h) * 60)
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
})

const SolarPage: React.FC = observer(() => {
  const { solar } = useStore()
  const {
    generationKw, todayGenerationKwh, todaySavingsGbp, siteConsumptionKw,
    exportKw, exportLimitKw, headroomKw, headroomHealth, selfConsumptionPct,
    generationHistory, consumptionHistory, exportHistory, dailyBarData,
    allFindings,
  } = solar

  const exportPct = Math.min(100, Math.round((exportKw / exportLimitKw) * 100))
  const headroomColor = headroomHealth === 'critical' ? '#ff4d4f'
                      : headroomHealth === 'warning'  ? '#faad14'
                      : '#52c41a'

  // ── Live Generation Tab ───────────────────────────────────────────────────
  const areaOpt = {
    tooltip: { trigger: 'axis' as const,
      formatter: (params: any[]) =>
        params.map((p: any) => `${p.seriesName}: <b>${p.value.toFixed(0)} kW</b>`).join('<br/>') },
    legend: { data: ['Site Consumption', 'Solar Generation'], bottom: 0 },
    grid: { bottom: 50, top: 20 },
    xAxis: { type: 'category' as const, data: TIMES, axisLabel: { interval: 47 } },
    yAxis: { type: 'value' as const, name: 'kW' },
    series: [
      {
        name: 'Site Consumption', type: 'line' as const, smooth: true, showSymbol: false,
        data: consumptionHistory,
        lineStyle: { color: PURPLE, width: 2 },
        itemStyle: { color: PURPLE },
        areaStyle: { color: PURPLE, opacity: 0.08 },
      },
      {
        name: 'Solar Generation', type: 'line' as const, smooth: true, showSymbol: false,
        data: generationHistory,
        lineStyle: { color: SOLAR_GOLD, width: 2 },
        itemStyle: { color: SOLAR_GOLD },
        areaStyle: { color: SOLAR_GOLD, opacity: 0.25 },
      },
    ],
  }

  const liveTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card style={{
            textAlign: 'center', background: '#fffbeb',
            border: `2px solid ${SOLAR_GOLD}`,
          }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Generating Now</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: SOLAR_GOLD, lineHeight: 1 }}>
              {generationKw.toFixed(0)}
            </div>
            <div style={{ fontSize: 14, color: '#888' }}>kW</div>
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card style={{ textAlign: 'center' }}>
            <Statistic title="Today's Generation" value={todayGenerationKwh.toFixed(0)} suffix="kWh"
              valueStyle={{ fontWeight: 700, color: SOLAR_GOLD }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card style={{ textAlign: 'center', background: '#f0fdf4' }}>
            <Statistic title="Today's Savings" value={`£${todaySavingsGbp.toFixed(0)}`}
              valueStyle={{ fontWeight: 700, color: '#16a34a', fontSize: 28 }} />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>@ £0.25 / kWh</div>
          </Card>
        </Col>
      </Row>

      <Card title="Solar Generation vs Site Consumption — 24h" style={{ marginBottom: 16 }}>
        <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
          Solar generation (gold) shown against site consumption (purple).
          Heathrow site load far exceeds generation — all solar is self-consumed.
        </Paragraph>
        <ReactECharts option={areaOpt} style={{ height: 300 }} />
      </Card>

      <Card>
        <Row gutter={[16, 0]}>
          <Col xs={12} sm={8}>
            <Statistic title="Self-Consumption Rate" value={selfConsumptionPct.toFixed(1)} suffix="%"
              valueStyle={{ color: '#16a34a', fontWeight: 700 }} />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              All solar is consumed on site
            </div>
          </Col>
          <Col xs={12} sm={8}>
            <Statistic title="Site Consumption" value={siteConsumptionKw.toFixed(0)} suffix="kW"
              valueStyle={{ fontWeight: 700 }} />
          </Col>
          <Col xs={12} sm={8}>
            <Statistic title="Peak Array Capacity" value="800" suffix="kW"
              valueStyle={{ fontWeight: 700 }} />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>BA Hangar + T5 Roof</div>
          </Col>
        </Row>
      </Card>
    </div>
  )

  // ── Export Management Tab ─────────────────────────────────────────────────
  const exportTrendOpt = {
    tooltip: { trigger: 'axis' as const },
    grid: { bottom: 40, top: 30 },
    xAxis: { type: 'category' as const, data: TIMES, axisLabel: { interval: 47 } },
    yAxis: { type: 'value' as const, name: 'kW', min: 0, max: exportLimitKw * 1.2 },
    series: [
      {
        name: 'Export kW', type: 'line' as const, smooth: true, showSymbol: false,
        data: exportHistory,
        lineStyle: { color: '#2ecc71', width: 2 },
        areaStyle: { color: '#2ecc71', opacity: 0.2 },
        itemStyle: { color: '#2ecc71' },
      },
      {
        name: 'Export Limit', type: 'line' as const,
        data: TIMES.map(() => exportLimitKw),
        lineStyle: { color: '#ff4d4f', type: 'dashed' as const, width: 2 },
        showSymbol: false, symbol: 'none',
        itemStyle: { color: '#ff4d4f' },
      },
    ],
    legend: { data: ['Export kW', 'Export Limit'], bottom: 0 },
  }

  const exportTab = (
    <div>
      {allFindings.map((f, i) => (
        <Alert key={i} type="error" showIcon style={{ marginBottom: 12 }}
          message={f.title}
          description={`${f.detail} — ${f.recommendation}`} />
      ))}

      {/* Big headroom number */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={10}>
          <Card style={{
            textAlign: 'center',
            border: `3px solid ${headroomColor}`,
            background: headroomHealth === 'critical' ? '#fff1f0'
                       : headroomHealth === 'warning'  ? '#fffbe6'
                       : '#f6ffed',
          }}>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>Export Headroom</div>
            <div style={{ fontSize: 56, fontWeight: 900, color: headroomColor, lineHeight: 1 }}>
              {headroomKw.toFixed(0)}
            </div>
            <div style={{ fontSize: 15, color: '#888', marginBottom: 12 }}>kW available</div>
            <Progress
              percent={100 - exportPct}
              strokeColor={headroomColor}
              trailColor="#f0f0f0"
              showInfo={false}
            />
            <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
              {exportKw.toFixed(0)} kW exported of {exportLimitKw} kW limit
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={14}>
          <Card title="Export vs Limit Gauge" style={{ height: '100%' }}>
            <ReactECharts
              option={{
                series: [{
                  type: 'gauge',
                  startAngle: 180, endAngle: 0,
                  min: 0, max: exportLimitKw * 1.2,
                  splitNumber: 6,
                  pointer: { length: '60%', width: 6 },
                  axisLine: {
                    lineStyle: {
                      width: 18,
                      color: [
                        [0.67, '#52c41a'],
                        [0.83, '#faad14'],
                        [1,    '#ff4d4f'],
                      ],
                    },
                  },
                  axisTick: { show: true },
                  splitLine: { show: true },
                  axisLabel: { fontSize: 10, formatter: (v: number) => `${v.toFixed(0)}` },
                  detail: { fontSize: 24, fontWeight: 700, color: headroomColor,
                    formatter: `{value} kW\nexported` },
                  data: [{ value: exportKw, name: 'Export kW' }],
                  title: { fontSize: 12, offsetCenter: [0, '70%'] },
                }],
              }}
              style={{ height: 220 }}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16, background: '#e6f4ff', border: '1px solid #91caff' }}>
        <Paragraph style={{ marginBottom: 0, fontSize: 13 }}>
          <strong>HAL Grid Export Cap:</strong> The Heathrow grid connection has a hard 200 kW export limit.
          Exceeding this prevents further solar connections (e.g. additional BA Hangar arrays).
          AiHVAC monitors this in real time and can curtail generation or increase HVAC pre-cooling load automatically.
        </Paragraph>
      </Card>

      <Card title="Export Trend — 24h (with limit line)">
        <ReactECharts option={exportTrendOpt} style={{ height: 260 }} />
      </Card>
    </div>
  )

  // ── History Tab ───────────────────────────────────────────────────────────
  const monthSavings = dailyBarData.reduce((s, d) => s + d.kwh * 0.25, 0)

  const barOpt = {
    tooltip: { trigger: 'axis' as const, formatter: (p: any[]) =>
      p.map((x: any) => `${x.name}: <b>${x.value.toFixed(0)} kWh</b>`).join('<br/>') },
    xAxis: { type: 'category' as const, data: dailyBarData.map(d => d.day) },
    yAxis: { type: 'value' as const, name: 'kWh' },
    series: [{
      type: 'bar' as const,
      data: dailyBarData.map(d => ({ value: d.kwh, itemStyle: { color: SOLAR_GOLD } })),
      label: { show: true, position: 'top' as const, formatter: (p: any) => `${p.value.toFixed(0)}` },
    }],
    grid: { bottom: 30, top: 40 },
  }

  const historyTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={8}>
          <Card style={{ textAlign: 'center' }}>
            <Statistic title="Today's Generation" value={todayGenerationKwh.toFixed(0)} suffix="kWh"
              valueStyle={{ color: SOLAR_GOLD, fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card style={{ textAlign: 'center', background: '#f0fdf4' }}>
            <Statistic title="Est. Savings This Month"
              value={`£${monthSavings.toFixed(0)}`}
              valueStyle={{ color: '#16a34a', fontWeight: 700 }} />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>@ £0.25 / kWh</div>
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card style={{ textAlign: 'center' }}>
            <Statistic title="Avg Daily Generation"
              value={(dailyBarData.reduce((s, d) => s + d.kwh, 0) / dailyBarData.length).toFixed(0)}
              suffix="kWh"
              valueStyle={{ fontWeight: 700 }} />
          </Card>
        </Col>
      </Row>
      <Card title="Daily Generation — Last 7 Days">
        <ReactECharts option={barOpt} style={{ height: 280 }} />
      </Card>
    </div>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <Title level={3} style={{ color: PURPLE, marginBottom: 4 }}>Solar &amp; Export</Title>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        BA Hangar + T5 roof arrays — 800 kW peak. Export limit management in real time.
      </Paragraph>
      <Tabs
        defaultActiveKey="live"
        items={[
          { key: 'live',    label: 'Live Generation',    children: liveTab },
          { key: 'export',  label: 'Export Management ⚡', children: exportTab },
          { key: 'history', label: 'History',             children: historyTab },
        ]}
      />
    </div>
  )
})

export default SolarPage
