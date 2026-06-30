import React from 'react'
import { observer } from 'mobx-react-lite'
import { Tabs, Card, Row, Col, Statistic, Alert, Typography, Progress, Tag } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useStore } from '../stores'
import { FDDPanel } from '../components/FDDPanel'
import type { Substation } from '../stores/PowerGridStore'

const { Title, Paragraph } = Typography
const PURPLE = '#5a0057'

const TIMES = Array.from({ length: 288 }, (_, i) => {
  const h = Math.floor(i * 24 / 288)
  const m = Math.round((i * 24 / 288 - h) * 60)
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
})

function pfColor(pf: number): string {
  return pf >= 0.92 ? '#52c41a' : pf >= 0.85 ? '#faad14' : '#ff4d4f'
}

function pfPercent(pf: number): number {
  return Math.round(((pf - 0.80) / (1.00 - 0.80)) * 100)
}

const PowerGridPage: React.FC = observer(() => {
  const { power } = useStore()
  const { substations, totalBuildingKw, chillerPlantKw, airsideKw, mechFanKw,
          todayTotalKwh, todayChillerKwh, todayAirsideKwh, todayMechFanKwh, todayOtherKwh,
          heatmapData, allFindings } = power

  const criticalPF = substations.filter(s => s.pf < 0.85)
  const warningPF  = substations.filter(s => s.pf < 0.92 && s.pf >= 0.85)

  // ── Demand Profiles Tab ───────────────────────────────────────────────────
  const demandOpt = {
    tooltip: { trigger: 'axis' as const, formatter: (params: any[]) =>
      params.map((p: any) => `${p.seriesName}: <b>${p.value.toFixed(0)} kW</b>`).join('<br/>') },
    legend: { data: substations.map(s => s.name), bottom: 0 },
    grid: { bottom: 50, top: 20, right: 20 },
    xAxis: {
      type: 'category' as const, data: TIMES,
      axisLabel: { interval: 47, fontSize: 11 },
    },
    yAxis: { type: 'value' as const, name: 'kW', nameTextStyle: { fontSize: 11 } },
    series: substations.map(s => ({
      name: s.name, type: 'line' as const, smooth: true, showSymbol: false,
      data: s.demandHistory,
      lineStyle: { color: s.color, width: 2 },
      itemStyle: { color: s.color },
      areaStyle: { color: s.color, opacity: 0.05 },
    })),
  }

  const demandTab = (
    <div>
      {/* Total + per-substation stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={6}>
          <Card style={{
            textAlign: 'center', background: `rgba(90,0,87,0.06)`,
            border: `2px solid ${PURPLE}`,
          }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Total Building</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: PURPLE }}>{totalBuildingKw.toFixed(0)}</div>
            <div style={{ fontSize: 13, color: '#888' }}>kW</div>
          </Card>
        </Col>
        {substations.map(s => (
          <Col xs={12} sm={4} key={s.id}>
            <Card size="small" style={{ textAlign: 'center', borderTop: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 11, color: '#888' }}>{s.name}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.kw.toFixed(0)}</div>
              <div style={{ fontSize: 10, color: '#aaa' }}>kW</div>
              <div style={{ fontSize: 10, color: '#bbb', marginTop: 3 }}>
                Peak: {Math.max(...s.demandHistory).toFixed(0)} kW
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="24h Demand Profile — All Substations">
        <ReactECharts option={demandOpt} style={{ height: 350 }} />
      </Card>
    </div>
  )

  // ── Power Factor Tab ──────────────────────────────────────────────────────
  const pfHistOpt = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: substations.map(s => s.name), bottom: 0 },
    grid: { bottom: 50, top: 20 },
    xAxis: { type: 'category' as const, data: TIMES, axisLabel: { interval: 47 } },
    yAxis: {
      type: 'value' as const, name: 'Power Factor', min: 0.78, max: 1.01,
      axisLabel: { formatter: (v: number) => v.toFixed(2) },
    },
    series: [
      // Reference lines
      { type: 'line' as const, name: 'Target 0.92', data: TIMES.map(() => 0.92),
        lineStyle: { color: '#52c41a', type: 'dashed' as const, width: 1 },
        showSymbol: false, symbol: 'none', itemStyle: { color: '#52c41a' } },
      { type: 'line' as const, name: 'Alert 0.85', data: TIMES.map(() => 0.85),
        lineStyle: { color: '#ff4d4f', type: 'dashed' as const, width: 1 },
        showSymbol: false, symbol: 'none', itemStyle: { color: '#ff4d4f' } },
      ...substations.map(s => ({
        name: s.name, type: 'line' as const, smooth: true, showSymbol: false,
        data: s.pfHistory,
        lineStyle: { color: s.color, width: 2 },
        itemStyle: { color: s.color },
      })),
    ],
  }

  const pfTab = (
    <div>
      {/* Alert banners */}
      {criticalPF.map(s => (
        <Alert key={s.id} type="error" showIcon style={{ marginBottom: 10 }}
          message={`Power Factor Alert — ${s.name}: ${s.pf.toFixed(3)} — Below critical threshold (0.85)`}
          description="Exceeding PF threshold triggers network penalty charges. Immediate action required." />
      ))}
      {warningPF.map(s => (
        <Alert key={s.id} type="warning" showIcon style={{ marginBottom: 10 }}
          message={`Power Factor Warning — ${s.name}: ${s.pf.toFixed(3)} — Below target (0.92)`} />
      ))}
      {criticalPF.length === 0 && warningPF.length === 0 && (
        <Alert type="success" showIcon style={{ marginBottom: 16 }}
          message="All substations within power factor target (≥ 0.92)" />
      )}

      {/* Explanation */}
      <Card style={{ marginBottom: 16, background: '#fffbe6', border: '1px solid #ffe58f' }}>
        <Paragraph style={{ marginBottom: 0, fontSize: 13 }}>
          <strong>Why Power Factor Matters:</strong> Low PF increases apparent power demand and triggers UKPN
          network charges (reactive power penalty above 33% kVArh / kWh ratio).
          Target: <Tag color="success">PF ≥ 0.92</Tag>
          Warning: <Tag color="warning">PF 0.85–0.92</Tag>
          Critical: <Tag color="error">PF &lt; 0.85</Tag>
        </Paragraph>
      </Card>

      {/* Per-substation PF gauges */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {substations.map(s => (
          <Col key={s.id} xs={24} sm={12} md={6}>
            <Card style={{
              textAlign: 'center',
              border: `2px solid ${pfColor(s.pf)}`,
              background: s.pf < 0.85 ? '#fff1f0' : s.pf < 0.92 ? '#fffbe6' : '#f6ffed',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{s.name}</div>
              <div style={{ fontSize: 36, fontWeight: 800, color: pfColor(s.pf), lineHeight: 1 }}>
                {s.pf.toFixed(3)}
              </div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>Power Factor</div>
              <Progress
                percent={pfPercent(s.pf)}
                strokeColor={pfColor(s.pf)}
                trailColor="#f0f0f0"
                showInfo={false}
                size="small"
              />
              <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
                {s.kw.toFixed(0)} kW &nbsp;|&nbsp; {s.current.toFixed(0)} A
              </div>
              <Tag color={s.pfHealth === 'ok' ? 'success' : s.pfHealth === 'warning' ? 'warning' : 'error'}
                style={{ marginTop: 8 }}>
                {s.pfHealth === 'ok' ? 'OK — No Action' : s.pfHealth === 'warning' ? 'Review Required' : 'Action Required'}
              </Tag>
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="Power Factor Trend — 24h">
        <ReactECharts option={pfHistOpt} style={{ height: 300 }} />
      </Card>
    </div>
  )

  // ── Sub-Meters Tab ────────────────────────────────────────────────────────
  const stackedBarOpt = {
    tooltip: { trigger: 'item' as const },
    legend: { data: ['Chiller Plant', 'Airside (AHU)', 'Mech Fans', 'Other'], bottom: 0 },
    grid: { bottom: 50, top: 20 },
    xAxis: { type: 'value' as const, name: 'kWh' },
    yAxis: { type: 'category' as const, data: ['Today'] },
    series: [
      { name: 'Chiller Plant', type: 'bar' as const, stack: 'total',
        data: [Math.round(todayChillerKwh)], itemStyle: { color: PURPLE } },
      { name: 'Airside (AHU)', type: 'bar' as const, stack: 'total',
        data: [Math.round(todayAirsideKwh)], itemStyle: { color: '#9b59b6' } },
      { name: 'Mech Fans', type: 'bar' as const, stack: 'total',
        data: [Math.round(todayMechFanKwh)], itemStyle: { color: '#3498db' } },
      { name: 'Other', type: 'bar' as const, stack: 'total',
        data: [Math.round(todayOtherKwh)], itemStyle: { color: '#bbb' } },
    ],
  }

  const subMetersTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={6}>
          <Card style={{ textAlign: 'center', background: `rgba(90,0,87,0.05)`, border: `2px solid ${PURPLE}` }}>
            <Statistic title="Total Building Today" value={Math.round(todayTotalKwh).toLocaleString()} suffix="kWh"
              valueStyle={{ color: PURPLE, fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center', borderTop: `3px solid ${PURPLE}` }}>
            <Statistic title="Chiller Plant" value={Math.round(todayChillerKwh).toLocaleString()} suffix="kWh"
              valueStyle={{ color: PURPLE }} />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              Now: {chillerPlantKw.toFixed(0)} kW
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center', borderTop: '3px solid #9b59b6' }}>
            <Statistic title="Airside (AHU)" value={Math.round(todayAirsideKwh).toLocaleString()} suffix="kWh"
              valueStyle={{ color: '#9b59b6' }} />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              Now: {airsideKw.toFixed(0)} kW
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center', borderTop: '3px solid #3498db' }}>
            <Statistic title="Mech Fans" value={Math.round(todayMechFanKwh).toLocaleString()} suffix="kWh"
              valueStyle={{ color: '#3498db' }} />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              Now: {mechFanKw.toFixed(0)} kW
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="Energy Breakdown by Sub-Meter — Today (kWh)">
        <ReactECharts option={stackedBarOpt} style={{ height: 180 }} />
      </Card>
    </div>
  )

  // ── Demand Heatmap Tab ────────────────────────────────────────────────────
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2,'0')}:00`)

  const flatData: [number, number, number][] = []
  heatmapData.forEach((row, dayIdx) => {
    row.forEach((val, hr) => {
      flatData.push([hr, dayIdx, val])
    })
  })
  const allVals = flatData.map(d => d[2])
  const minV = Math.min(...allVals)
  const maxV = Math.max(...allVals)

  const heatmapOpt = {
    tooltip: {
      formatter: (p: any) =>
        `${DAYS[p.data[1]]} ${HOURS[p.data[0]]}: <b>${p.data[2]} kW</b>`,
    },
    grid: { bottom: 60, top: 40, left: 60, right: 80 },
    xAxis: {
      type: 'category' as const,
      data: HOURS,
      splitArea: { show: true },
      axisLabel: { interval: 1, fontSize: 10 },
    },
    yAxis: {
      type: 'category' as const,
      data: DAYS,
      splitArea: { show: true },
    },
    visualMap: {
      min: minV, max: maxV,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: { color: ['#f0f2f5', 'rgba(90,0,87,0.3)', PURPLE] },
      text: ['High', 'Low'],
      textStyle: { fontSize: 11 },
    },
    series: [{
      name: 'Demand (kW)',
      type: 'heatmap' as const,
      data: flatData,
      label: { show: false },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
    }],
  }

  const heatmapTab = (
    <Card title="Demand Pattern — Last 7 Days (T1 Main)" extra={
      <span style={{ fontSize: 12, color: '#888' }}>Hour of day × Day of week</span>
    }>
      <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
        Airport demand shows two characteristic peaks: morning bank (07:00–10:00) and afternoon bank (14:00–18:00),
        with overnight troughs. Weekend patterns show reduced early-morning demand.
      </Paragraph>
      <ReactECharts option={heatmapOpt} style={{ height: 360 }} />
    </Card>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <Title level={3} style={{ color: PURPLE, marginBottom: 4 }}>Power &amp; Grid</Title>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        4 HV substations — demand monitoring, power factor analysis, and sub-meter breakdown.
      </Paragraph>
      <Tabs
        defaultActiveKey="demand"
        items={[
          { key: 'demand',    label: 'Demand Profiles',  children: demandTab },
          { key: 'pf',        label: 'Power Factor ⚡',   children: pfTab },
          { key: 'submeters', label: 'Sub-Meters',        children: subMetersTab },
          { key: 'heatmap',   label: 'Demand Heatmap',    children: heatmapTab },
          { key: 'alarms',    label: `Alarms (${allFindings.length})`, children: <FDDPanel findings={allFindings} systemLabel="Power & Grid" /> },
        ]}
      />
    </div>
  )
})

export default PowerGridPage
