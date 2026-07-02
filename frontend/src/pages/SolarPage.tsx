import React, { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { Tabs, Card, Row, Col, Statistic, Alert, Typography, Table, Badge } from 'antd'
import ReactECharts from 'echarts-for-react'
import 'echarts-liquidfill'
import { useStore } from '../stores'
import { FDDPanel } from '../components/FDDPanel'
import { RangeBar, buildZones } from '../components/RangeBar'
import { Sparkline } from '../components/Sparkline'
import { TimelineSwitch, type TimelineDays } from '../components/TimelineSwitch'
import { useEchartsTheme } from '../theme/echartsTheme'
import { windowHistory, timeLabels, labelInterval, dayMarkLine, dailyEnergyKwh } from '../utils/history'
import type { SolarArray } from '../stores/SolarStore'

const { Title, Paragraph, Text } = Typography
const PURPLE = '#5a0057'
const SOLAR_GOLD = '#f59e0b'
const ARRAY_COLORS = [SOLAR_GOLD, '#e74c3c', '#1677ff']
const NEUTRAL_ZONES = buildZones({ min: 0, max: 100 })

function healthTag(h: 'ok' | 'warning' | 'critical') {
  return h === 'critical' ? <Badge status="error" text="Critical" />
       : h === 'warning'  ? <Badge status="warning" text="Warning" />
       :                    <Badge status="success" text="Normal" />
}

const SolarPage: React.FC = observer(() => {
  const store = useStore()
  const { solar } = store
  const {
    arrays, generationKw, todayGenerationKwh, todaySavingsGbp, siteConsumptionKw,
    exportKw, exportLimitKw, headroomKw, headroomHealth, selfConsumptionPct,
    consumptionHistory, exportHistory, allFindings,
  } = solar
  const chartTheme = useEchartsTheme()
  const [days, setDays] = useState<TimelineDays>(1)

  const headroomColor = headroomHealth === 'critical' ? '#ff4d4f'
                      : headroomHealth === 'warning'  ? '#faad14'
                      : '#52c41a'
  const labels = timeLabels(days)
  const interval = labelInterval(days)

  const generationShareOpt = {
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c} kW ({d}%)' },
    series: [{
      type: 'pie' as const, radius: ['55%', '80%'],
      label: { show: false }, labelLine: { show: false },
      data: arrays.map((a, i) => ({ name: a.name, value: Number(a.generationKw.toFixed(1)), itemStyle: { color: ARRAY_COLORS[i] } })),
    }],
  }

  // ── Overview tab ──────────────────────────────────────────────────────────
  const overviewTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={6}>
          <Card style={{ height: '100%', textAlign: 'center', background: '#fffbeb', border: `2px solid ${SOLAR_GOLD}` }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Generating Now</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: SOLAR_GOLD, lineHeight: 1 }}>{generationKw.toFixed(0)}</div>
            <div style={{ fontSize: 13, color: '#888' }}>kW</div>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card style={{ height: '100%' }} bodyStyle={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <ReactECharts option={generationShareOpt} theme={chartTheme} style={{ width: 90, height: 90, flexShrink: 0 }} />
              <div style={{ marginLeft: 8, fontSize: 11 }}>
                {arrays.map((a, i) => (
                  <div key={a.id}><span style={{ color: ARRAY_COLORS[i] }}>■</span> {a.name.replace(' Array', '')} {a.generationKw.toFixed(0)}</div>
                ))}
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card style={{ height: '100%', textAlign: 'center' }}>
            <Statistic title="Today's Generation" value={todayGenerationKwh.toFixed(0)} suffix="kWh" valueStyle={{ fontWeight: 700, color: SOLAR_GOLD }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card style={{ height: '100%', textAlign: 'center', background: '#f0fdf4' }}>
            <Statistic title="Today's Savings" value={`£${todaySavingsGbp.toFixed(0)}`} valueStyle={{ fontWeight: 700, color: '#16a34a', fontSize: 24 }} />
            <div style={{ fontSize: 11, color: '#888' }}>@ £0.25/kWh</div>
          </Card>
        </Col>
      </Row>

      <Card title="Solar Arrays" size="small" style={{ marginBottom: 16 }}>
        <Table
          dataSource={arrays}
          rowKey="id"
          pagination={false}
          size="small"
          columns={[
            { title: 'Array', dataIndex: 'name', key: 'name', render: (v) => <strong>{v}</strong> },
            { title: 'Location', dataIndex: 'location', key: 'loc' },
            { title: 'Rated', key: 'rated', render: (_, a: SolarArray) => `${a.ratedKw} kW` },
            { title: 'Generation', key: 'gen', width: 170, render: (_, a: SolarArray) =>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{a.generationKw.toFixed(0)} kW</span><Sparkline data={windowHistory(a.generationHistory, 1)} color={SOLAR_GOLD} />
              </div> },
            { title: 'Output %', key: 'pct', width: 130, render: (_, a: SolarArray) =>
              <RangeBar label="" value={(a.generationKw / a.ratedKw) * 100} unit="%" min={0} max={100} zones={NEUTRAL_ZONES} precision={0} bare barWidth={60} /> },
            { title: 'Health', key: 'h', render: (_, a: SolarArray) => healthTag(a.health) },
          ]}
        />
      </Card>

      <Card title="Generation vs Site Consumption" extra={<TimelineSwitch value={days} onChange={setDays} />}>
        <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
          Solar generation (gold) against total site consumption (purple, from Power &amp; Grid substations) —
          Heathrow's load far exceeds generation, so all solar is self-consumed.
        </Paragraph>
        <ReactECharts option={{
          tooltip: { trigger: 'axis' as const },
          legend: { data: ['Site Consumption', 'Solar Generation'], bottom: 0 },
          grid: { bottom: 50, left: 55, right: 20, top: 40, containLabel: true },
          xAxis: { type: 'category' as const, data: labels, axisLabel: { interval } },
          yAxis: { type: 'value' as const, name: 'kW' },
          series: [
            {
              name: 'Site Consumption', type: 'line' as const, smooth: true, showSymbol: false,
              data: windowHistory(consumptionHistory, days),
              lineStyle: { color: PURPLE, width: 2 }, itemStyle: { color: PURPLE }, areaStyle: { color: PURPLE, opacity: 0.08 },
              markLine: dayMarkLine(days, store.darkMode),
            },
            {
              name: 'Solar Generation', type: 'line' as const, smooth: true, showSymbol: false,
              data: arrays.reduce<number[]>((sum, a) => {
                const w = windowHistory(a.generationHistory, days)
                return sum.length === 0 ? w : sum.map((v, i) => v + w[i])
              }, []),
              lineStyle: { color: SOLAR_GOLD, width: 2 }, itemStyle: { color: SOLAR_GOLD }, areaStyle: { color: SOLAR_GOLD, opacity: 0.25 },
            },
          ],
        }} theme={chartTheme} style={{ height: 300 }} />
      </Card>
    </div>
  )

  // ── Export Management tab ─────────────────────────────────────────────────
  const liquidOpt = {
    series: [{
      type: 'liquidFill',
      data: [Math.max(0, Math.min(1, headroomKw / exportLimitKw))],
      radius: '85%',
      color: [headroomColor],
      backgroundStyle: { color: 'transparent' },
      outline: { show: true, borderDistance: 2, itemStyle: { borderColor: headroomColor, borderWidth: 2 } },
      label: {
        formatter: () => `${headroomKw.toFixed(0)} kW\nheadroom`,
        fontSize: 16, fontWeight: 700, color: '#262626',
      },
    }],
  }

  const exportByArrayOpt = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: arrays.map(a => a.name), bottom: 0 },
    grid: { bottom: 50, left: 55, right: 20, top: 40, containLabel: true },
    xAxis: { type: 'category' as const, data: labels, axisLabel: { interval } },
    yAxis: { type: 'value' as const, name: 'kW' },
    series: arrays.map((a, i) => ({
      name: a.name, type: 'line' as const, stack: 'gen', smooth: true, showSymbol: false,
      data: windowHistory(a.generationHistory, days),
      lineStyle: { color: ARRAY_COLORS[i] }, itemStyle: { color: ARRAY_COLORS[i] }, areaStyle: { opacity: 0.5 },
    })),
  }

  const exportTab = (
    <div>
      {allFindings.filter(f => f.ruleId === 'SOL-001').map((f, i) => (
        <Alert key={i} type="error" showIcon style={{ marginBottom: 12 }} message={f.title} description={`${f.detail} — ${f.recommendation}`} />
      ))}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card style={{ height: '100%', textAlign: 'center' }} title="Export Headroom">
            <ReactECharts option={liquidOpt} theme={chartTheme} style={{ height: 200 }} />
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
              {exportKw.toFixed(0)} kW exported of {exportLimitKw} kW limit
            </div>
          </Card>
        </Col>
        <Col xs={24} md={16}>
          <Card title="Generation by Array (stacked)" size="small" style={{ height: '100%' }}>
            <ReactECharts option={exportByArrayOpt} theme={chartTheme} style={{ height: 240 }} />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16, background: '#e6f4ff', border: '1px solid #91caff' }}>
        <Text style={{ fontSize: 13 }}>
          <strong>HAL Grid Export Cap:</strong> the Heathrow grid connection has a hard {exportLimitKw} kW export limit.
          Exceeding this prevents further solar connections — including additional BA Hangar arrays, which is the
          exact case the consultant raised. AiHVAC monitors this in real time and can curtail generation or increase
          HVAC pre-cooling load automatically.
        </Text>
      </Card>

      <Card title="Export Trend (with limit line)" extra={<TimelineSwitch value={days} onChange={setDays} />}>
        <ReactECharts option={{
          tooltip: { trigger: 'axis' as const },
          legend: { data: ['Export kW', 'Export Limit'], bottom: 0 },
          grid: { bottom: 50, left: 55, right: 20, top: 40, containLabel: true },
          xAxis: { type: 'category' as const, data: labels, axisLabel: { interval } },
          yAxis: { type: 'value' as const, name: 'kW', min: 0, max: exportLimitKw * 1.3 },
          series: [
            {
              name: 'Export kW', type: 'line' as const, smooth: true, showSymbol: false,
              data: windowHistory(exportHistory, days),
              lineStyle: { color: '#2ecc71', width: 2 }, areaStyle: { color: '#2ecc71', opacity: 0.2 }, itemStyle: { color: '#2ecc71' },
              markLine: dayMarkLine(days, store.darkMode),
            },
            {
              name: 'Export Limit', type: 'line' as const, data: labels.map(() => exportLimitKw),
              lineStyle: { color: '#ff4d4f', type: 'dashed' as const, width: 2 }, showSymbol: false, symbol: 'none', itemStyle: { color: '#ff4d4f' },
            },
          ],
        }} theme={chartTheme} style={{ height: 260 }} />
      </Card>
    </div>
  )

  // ── History tab ───────────────────────────────────────────────────────────
  const dailyPerArray = arrays.map(a => dailyEnergyKwh(a.generationHistory))
  const dayLabels = Array.from({ length: dailyPerArray[0]?.length ?? 0 }, (_, i) => `Day ${i + 1}`)
  const totalKwhAllDays = dailyPerArray.reduce((s, arr) => s + arr.reduce((a, b) => a + b, 0), 0)
  const monthSavings = (totalKwhAllDays / dayLabels.length) * 30 * 0.25

  const historyBarOpt = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: arrays.map(a => a.name), bottom: 0 },
    grid: { bottom: 50, top: 30, left: 55, right: 20, containLabel: true },
    xAxis: { type: 'category' as const, data: dayLabels },
    yAxis: { type: 'value' as const, name: 'kWh' },
    series: arrays.map((a, i) => ({
      name: a.name, type: 'bar' as const, stack: 'total',
      data: dailyPerArray[i].map(v => Math.round(v)),
      itemStyle: { color: ARRAY_COLORS[i] },
    })),
  }

  const historyTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={8}>
          <Card style={{ textAlign: 'center' }}>
            <Statistic title="Today's Generation" value={todayGenerationKwh.toFixed(0)} suffix="kWh" valueStyle={{ color: SOLAR_GOLD, fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card style={{ textAlign: 'center', background: '#f0fdf4' }}>
            <Statistic title="Est. Savings This Month" value={`£${monthSavings.toFixed(0)}`} valueStyle={{ color: '#16a34a', fontWeight: 700 }} />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>@ £0.25/kWh, projected from 7-day avg</div>
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card style={{ textAlign: 'center' }}>
            <Statistic title="Avg Daily Generation" value={(totalKwhAllDays / dayLabels.length).toFixed(0)} suffix="kWh" valueStyle={{ fontWeight: 700 }} />
          </Card>
        </Col>
      </Row>
      <Card title="Daily Generation by Array — Last 7 Days">
        <ReactECharts option={historyBarOpt} theme={chartTheme} style={{ height: 300 }} />
      </Card>
    </div>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <Title level={3} style={{ color: PURPLE, marginBottom: 4 }}>Solar &amp; Export</Title>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        3 arrays — T5 Roof, Cargo Village &amp; BA Hangar (800 kW peak). Export limit management in real time.
      </Paragraph>
      <Tabs
        defaultActiveKey="live"
        items={[
          { key: 'live',    label: 'Overview',            children: overviewTab },
          { key: 'export',  label: 'Export Management',   children: exportTab },
          { key: 'history', label: 'History',             children: historyTab },
          { key: 'alarms',  label: `Alarms (${allFindings.length})`, children: <FDDPanel findings={allFindings} systemLabel="Solar & Export" /> },
        ]}
      />
    </div>
  )
})

export default SolarPage
