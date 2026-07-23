import React, { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { Tabs, Card, Row, Col, Statistic, Alert, Typography, Table, Badge } from 'antd'
import ReactECharts from 'echarts-for-react'
import 'echarts-liquidfill'
import { useStore } from '../stores'
import { FDDPanel } from '../components/FDDPanel'
import { RangeBar, buildZones, ZONE_COLOR } from '../components/RangeBar'
import { Gauge } from '../components/Gauge'
import { Sparkline } from '../components/Sparkline'
import { TimelineSwitch, type TimelineDays } from '../components/TimelineSwitch'
import PageHeroImage from '../components/PageHeroImage'
import { FlashValue } from '../components/FlashValue'
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

  // Array output % — horizontal ranking bar (performance vs rated capacity).
  const outputPctSorted = [...arrays].sort((a, b) => (b.generationKw / b.ratedKw) - (a.generationKw / a.ratedKw))
  const outputPctOpt = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 110, right: 30, top: 10, bottom: 20 },
    xAxis: { type: 'value' as const, name: '%', min: 0, max: 100 },
    yAxis: { type: 'category' as const, data: outputPctSorted.map(a => a.name), inverse: true },
    series: [{
      type: 'bar' as const,
      data: outputPctSorted.map(a => {
        const pct = (a.generationKw / a.ratedKw) * 100
        return { value: Math.round(pct), itemStyle: { color: a.health === 'critical' ? ZONE_COLOR.critical : a.health === 'warning' ? ZONE_COLOR.warning : SOLAR_GOLD } }
      }),
      barWidth: 18,
      label: { show: true, position: 'right' as const, formatter: '{c}%' },
    }],
  }

  // Today's generation — vertical column chart.
  const todayGenBarOpt = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 55, right: 20, top: 34, bottom: 30 },
    xAxis: { type: 'category' as const, data: arrays.map(a => a.name.replace(' Array', '')) },
    yAxis: { type: 'value' as const, name: 'kWh', nameGap: 14 },
    series: [{
      type: 'bar' as const,
      data: arrays.map((a, i) => ({ value: Math.round(a.todayGenerationKwh), itemStyle: { color: ARRAY_COLORS[i] } })),
      barWidth: '55%',
      label: { show: true, position: 'top' as const, fontSize: 10 },
    }],
  }

  // ── Overview tab ──────────────────────────────────────────────────────────
  const overviewTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <PageHeroImage
            src="/assets/airport_solar_export_3d.webp"
            alt="Airport solar export"
            caption="Rooftop and apron solar arrays — grid export overview"
          />
        </Col>
        <Col xs={24} lg={10}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%', textAlign: 'center', border: `2px solid ${SOLAR_GOLD}` }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Generating Now</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: SOLAR_GOLD, lineHeight: 1 }}><FlashValue value={generationKw}>{generationKw.toFixed(0)}</FlashValue></div>
                <div style={{ fontSize: 13, color: '#888' }}>kW</div>
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%' }} bodyStyle={{ padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <ReactECharts option={generationShareOpt} theme={chartTheme} style={{ width: 70, height: 70, flexShrink: 0 }} />
                  <div style={{ marginLeft: 8, fontSize: 11 }}>
                    {arrays.map((a, i) => (
                      <div key={a.id}><span style={{ color: ARRAY_COLORS[i] }}>■</span> {a.name.replace(' Array', '')} {a.generationKw.toFixed(0)}</div>
                    ))}
                  </div>
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%', textAlign: 'center' }}>
                <Statistic title="Today's Generation" value={todayGenerationKwh.toFixed(0)} suffix="kWh" valueStyle={{ fontWeight: 700, color: SOLAR_GOLD }} />
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%', textAlign: 'center' }}>
                <Statistic title="Today's Savings" value={`£${todaySavingsGbp.toFixed(0)}`} valueStyle={{ fontWeight: 700, color: '#16a34a', fontSize: 24 }} />
                <div style={{ fontSize: 11, color: '#888' }}>@ £0.25/kWh</div>
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Array Output % — Ranked" size="small" style={{ height: '100%' }}>
            <ReactECharts option={outputPctOpt} theme={chartTheme} style={{ height: 40 + arrays.length * 40 }} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card style={{ height: '100%' }} bodyStyle={{ padding: 8 }}>
            <Gauge label="Self-Consumption" value={selfConsumptionPct} min={0} max={100}
              zones={buildZones({ min: 0, max: 100 })} height={170} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Today's Generation by Array" size="small" style={{ height: '100%' }}>
            <ReactECharts option={todayGenBarOpt} theme={chartTheme} style={{ height: 260 }} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Generation Trend by Array (24h)" size="small" style={{ height: '100%' }}>
            <Row gutter={[12, 12]}>
              {arrays.map((a, i) => (
                <Col xs={24} sm={12} key={a.id}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{a.name.replace(' Array', '')}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: ARRAY_COLORS[i] }}>{a.generationKw.toFixed(0)} kW</div>
                    </div>
                    <Sparkline data={windowHistory(a.generationHistory, 1)} color={ARRAY_COLORS[i]} />
                  </div>
                </Col>
              ))}
            </Row>
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
          the airport's load far exceeds generation, so all solar is self-consumed.
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

  const schematicTab = (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <PageHeroImage
            src="/assets/schematic_solar_grid.webp"
            alt="Solar grid schematic"
            caption="Solar generation — grid export schematic"
            size="large"
          />
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Live Export Conditions" size="small" style={{ height: '100%' }}>
            <Row gutter={[12, 12]}>
              <Col span={12}>
                <Gauge label="Export Now" value={exportKw} min={0} max={exportLimitKw}
                  zones={buildZones({ min: 0, max: exportLimitKw, warnHigh: exportLimitKw - 80, critHigh: exportLimitKw - 20 })}
                  unit=" kW" precision={0} height={140} />
              </Col>
              <Col span={12}>
                <Statistic title="Headroom" value={headroomKw.toFixed(0)} suffix="kW"
                  valueStyle={{ fontSize: 20, color: headroomColor }} />
                <div style={{ marginTop: 10 }}>
                  <Statistic title="Export Limit" value={exportLimitKw} suffix="kW" valueStyle={{ fontSize: 20 }} />
                </div>
                <div style={{ marginTop: 10 }}>
                  <Statistic title="Self-Consumption" value={selfConsumptionPct.toFixed(0)} suffix="%" valueStyle={{ fontSize: 20 }} />
                </div>
              </Col>
            </Row>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(128,128,128,0.2)' }}>
              <div style={{ fontSize: 12, color: undefined, marginBottom: 8 }}>Array Output % of Rated</div>
              {arrays.map(a => (
                <RangeBar key={a.id} label={a.name.replace(' Array', '')} value={(a.generationKw / a.ratedKw) * 100}
                  unit="%" min={0} max={100} zones={NEUTRAL_ZONES} precision={0} compact />
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )

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

      <Card style={{ marginBottom: 16, border: '1px solid #91caff' }}>
        <Text style={{ fontSize: 13 }}>
          <strong>Airport Grid Export Cap:</strong> the airport's grid connection has a hard {exportLimitKw} kW export limit.
          Exceeding this prevents further solar connections — including additional BA Hangar arrays, which is the
          exact case the consultant raised. The platform monitors this in real time and can curtail generation or increase
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
          <Card style={{ textAlign: 'center' }}>
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
      <Title level={3} style={{ color: undefined, marginBottom: 4 }}>Solar &amp; Export</Title>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        3 arrays — T5 Roof, Cargo Village &amp; BA Hangar (800 kW peak). Export limit management in real time.
      </Paragraph>
      <Tabs
        defaultActiveKey="live"
        items={[
          { key: 'live',    label: 'Overview',            children: overviewTab },
          { key: 'schematic', label: 'System Schematic',  children: schematicTab },
          { key: 'export',  label: 'Export Management',   children: exportTab },
          { key: 'history', label: 'History',             children: historyTab },
          { key: 'alarms',  label: `Alarms (${allFindings.length})`, children: <FDDPanel findings={allFindings} systemLabel="Solar & Export" /> },
        ]}
      />
    </div>
  )
})

export default SolarPage
