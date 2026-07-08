import React, { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { Card, Row, Col, Statistic, Table, Badge, Typography, Tabs, Tag, Progress } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useStore } from '../stores'
import { FDDPanel } from '../components/FDDPanel'
import { RangeBar, buildZones, zoneAt, ZONE_COLOR } from '../components/RangeBar'
import { Gauge } from '../components/Gauge'
import { Sparkline } from '../components/Sparkline'
import { TimelineSwitch, type TimelineDays } from '../components/TimelineSwitch'
import { useEchartsTheme } from '../theme/echartsTheme'
import { windowHistory, timeLabels, labelInterval, dayMarkLine } from '../utils/history'
import PageHeroImage from '../components/PageHeroImage'
import { FlashValue } from '../components/FlashValue'
import type { LightingZone } from '../stores/LightingStore'

const { Title, Paragraph, Text } = Typography
const PURPLE = '#5a0057'
const LINE_COLORS = ['#5a0057', '#9b59b6', '#e74c3c', '#1677ff', '#13a8a8', '#faad14', '#52c41a', '#eb2f96', '#2ecc71', '#722ed1']
const NEUTRAL_ZONES = buildZones({ min: 0, max: 100 })

// Same thresholds as Power & Grid's substation meters (src/pages/PowerGridPage.tsx) — redefined
// locally rather than cross-imported, matching how every page already owns its own zone constants.
const PF_ZONES    = buildZones({ min: 0.80, max: 1.00, critLow: 0.85, warnLow: 0.92 })
const THD_V_ZONES = buildZones({ min: 0, max: 10, warnHigh: 5, critHigh: 8 })
const THD_I_ZONES = buildZones({ min: 0, max: 25, warnHigh: 15, critHigh: 20 })
const FREQ_ZONES  = buildZones({ min: 49.5, max: 50.5, critLow: 49.8, warnLow: 49.9, warnHigh: 50.1, critHigh: 50.2 })

const TERMINAL_COLOR: Record<string, string> = {
  T1: '#5a0057', T2: '#9b59b6', T3: '#e74c3c', T5: '#1677ff', 'Cargo Village': '#faad14', Landside: '#13a8a8',
}

function healthTag(h: 'ok' | 'warning' | 'critical') {
  return h === 'critical' ? <Badge status="error" text="Critical" />
       : h === 'warning'  ? <Badge status="warning" text="Warning" />
       :                    <Badge status="success" text="Normal" />
}

function faultText(count: number) {
  if (count === 0) return <span style={{ color: '#52c41a' }}>0</span>
  const color = count > 5 ? ZONE_COLOR.critical : ZONE_COLOR.warning
  return <span style={{ color, fontWeight: 600 }}>{count}</span>
}

const LightingPage: React.FC = observer(() => {
  const store = useStore()
  const { lighting } = store
  const { zones, mainMeter, totalPowerKw, totalRatedKw, totalKwhSavedToday, totalSavingsGbpToday, activeZones, allFindings } = lighting
  const chartTheme = useEchartsTheme()
  const [days, setDays] = useState<TimelineDays>(1)

  const totalFixtures = zones.reduce((s, z) => s + z.fixtureCount, 0)

  const powerByTerminalOpt = {
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c} kW ({d}%)' },
    series: [{
      type: 'pie' as const, radius: ['55%', '80%'],
      label: { show: false }, labelLine: { show: false },
      data: Object.entries(
        zones.reduce<Record<string, number>>((acc, z) => { acc[z.zone] = (acc[z.zone] ?? 0) + z.powerKw; return acc }, {})
      ).map(([zone, value]) => ({ name: zone, value: Number(value.toFixed(1)), itemStyle: { color: TERMINAL_COLOR[zone] } })),
    }],
  }

  const powerCompareOpt = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 130, right: 50, top: 10, bottom: 20 },
    xAxis: { type: 'value' as const, name: 'kW' },
    yAxis: { type: 'category' as const, data: zones.map(z => z.name), inverse: true },
    series: [{
      type: 'bar' as const, data: zones.map(z => ({ value: Number(z.powerKw.toFixed(1)), itemStyle: { color: TERMINAL_COLOR[z.zone] } })),
      barWidth: 14, label: { show: true, position: 'right' as const, formatter: '{c} kW' },
    }],
  }

  // Footfall vs power — are we lighting empty zones?
  const footfallVsPowerOpt = {
    tooltip: {
      trigger: 'item' as const,
      formatter: (p: any) => `${p.data[2]}<br/>Footfall ${p.data[0].toFixed(0)}%  |  Power ${p.data[1].toFixed(1)} kW`,
    },
    grid: { left: 50, right: 20, top: 16, bottom: 34 },
    xAxis: { type: 'value' as const, name: 'Footfall %', min: 0, max: 100, nameLocation: 'middle' as const, nameGap: 26 },
    yAxis: { type: 'value' as const, name: 'kW' },
    series: [{
      type: 'scatter' as const,
      symbolSize: 16,
      data: zones.map(z => [Math.round(z.footfallPct), Number(z.powerKw.toFixed(1)), z.name]),
      itemStyle: { color: (p: any) => TERMINAL_COLOR[zones.find(z => z.name === p.data[2])?.zone ?? 'T1'] },
    }],
  }

  // kWh saved by zone — vertical column chart.
  const kwhSavedBarOpt = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 55, right: 20, top: 34, bottom: 60 },
    xAxis: { type: 'category' as const, data: zones.map(z => z.name.replace(/^T\d\s|Cargo Village\s|Landside\s/, '')), axisLabel: { rotate: 35, fontSize: 9 } },
    yAxis: { type: 'value' as const, name: 'kWh', nameGap: 14 },
    series: [{
      type: 'bar' as const,
      data: zones.map(z => ({ value: Math.round(z.kwhSavedToday), itemStyle: { color: '#16a34a' } })),
      barWidth: '55%',
      label: { show: true, position: 'top' as const, fontSize: 9 },
    }],
  }

  // Zone health matrix — Dimming Accuracy / Occupancy Utilization / Fixture Health / Power Efficiency.
  const lightingHeatmapMetrics = ['Dimming Acc.', 'Occ. Util.', 'Fixture Health', 'Efficiency'] as const
  function lightingHeatmapScore(z: LightingZone, metric: typeof lightingHeatmapMetrics[number]): number {
    if (metric === 'Dimming Acc.') return 100 - Math.min(100, Math.abs(z.dimmingActual - z.dimmingCommand) * 2)
    if (metric === 'Occ. Util.') return z.footfallPct > 2 ? 100 : Math.max(0, 100 - z.minutesNoFootfall)
    if (metric === 'Fixture Health') return z.faultyFixtureCount > 5 ? 20 : z.faultyFixtureCount > 0 ? 60 : 100
    return z.expectedKw > 0 ? Math.max(0, 100 - Math.abs(z.powerKw - z.expectedKw) / z.expectedKw * 100) : 100
  }
  const lightingHeatmapData: [number, number, number][] = []
  zones.forEach((z, zi) => {
    lightingHeatmapMetrics.forEach((m, mi) => {
      lightingHeatmapData.push([mi, zi, Math.round(lightingHeatmapScore(z, m))])
    })
  })
  const lightingHeatmapOpt = {
    tooltip: {
      position: 'top' as const,
      formatter: (p: any) => `${zones[p.data[1]].name} — ${lightingHeatmapMetrics[p.data[0]]}: ${p.data[2]}`,
    },
    grid: { left: 130, right: 20, top: 10, bottom: 30 },
    xAxis: { type: 'category' as const, data: lightingHeatmapMetrics, splitArea: { show: true } },
    yAxis: { type: 'category' as const, data: zones.map(z => z.name), splitArea: { show: true } },
    visualMap: { min: 0, max: 100, show: false, inRange: { color: ['#cf1322', '#faad14', '#52c41a'] } },
    series: [{
      type: 'heatmap' as const,
      data: lightingHeatmapData,
      label: { show: true, fontSize: 9, formatter: (p: any) => p.data[2] },
    }],
  }

  const overviewTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <PageHeroImage
            src="/assets/airport_lighting_monitoring_page.png"
            alt="Lighting monitoring overview"
            caption="Terminal lighting — power monitoring overview"
          />
        </Col>
        <Col xs={24} lg={10}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%' }} bodyStyle={{ padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <ReactECharts option={powerByTerminalOpt} theme={chartTheme} style={{ width: 70, height: 70, flexShrink: 0 }} />
                  <div style={{ marginLeft: 8 }}>
                    <div style={{ fontSize: 11, color: undefined }}>Total Lighting Power</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: undefined }}><FlashValue value={totalPowerKw}>{totalPowerKw.toFixed(1)} kW</FlashValue></div>
                    <div style={{ fontSize: 10, color: undefined }}>of {totalRatedKw.toFixed(1)} kW rated</div>
                  </div>
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%' }} bodyStyle={{ padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <ReactECharts
                    option={{
                      series: [{
                        type: 'pie', radius: ['65%', '85%'], startAngle: 90,
                        label: { show: true, position: 'center', formatter: `${activeZones}/${zones.length}`, fontSize: 16, fontWeight: 700 },
                        data: [
                          { value: activeZones, itemStyle: { color: PURPLE } },
                          { value: zones.length - activeZones, itemStyle: { color: '#f0f0f0' } },
                        ],
                      }],
                    }}
                    theme={chartTheme} style={{ width: 70, height: 70, flexShrink: 0 }}
                  />
                  <div style={{ marginLeft: 8 }}>
                    <div style={{ fontSize: 11, color: undefined }}>Zones Active</div>
                    <div style={{ fontSize: 10, color: undefined }}>{totalFixtures.toLocaleString()} fixtures</div>
                  </div>
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%', textAlign: 'center' }}>
                <Statistic title="Saved Today" value={totalKwhSavedToday.toFixed(0)} suffix="kWh" valueStyle={{ fontWeight: 700, color: '#16a34a', fontSize: 22 }} />
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%', textAlign: 'center' }}>
                <Statistic title="Est. Savings Today" value={`£${totalSavingsGbpToday.toFixed(0)}`} valueStyle={{ fontWeight: 700, color: '#16a34a', fontSize: 22 }} />
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>

      <Card
        title="Main Incoming Meter — Lighting LV Distribution Board"
        size="small"
        style={{ marginBottom: 16 }}
        extra={<Tag color="default">415V LV, 3-phase</Tag>}
      >
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={8} md={4}>
            <div style={{ fontSize: 11, color: undefined, marginBottom: 4 }}>Voltage (L1/L2/L3)</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {mainMeter.vL1.toFixed(0)} / {mainMeter.vL2.toFixed(0)} / {mainMeter.vL3.toFixed(0)} V
            </div>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <div style={{ fontSize: 11, color: undefined, marginBottom: 4 }}>Current (L1/L2/L3)</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {mainMeter.iL1.toFixed(0)} / {mainMeter.iL2.toFixed(0)} / {mainMeter.iL3.toFixed(0)} A
            </div>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <div style={{ fontSize: 11, color: undefined, marginBottom: 4 }}>Power (kW / kVAR / kVA)</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {mainMeter.kw.toFixed(1)} / {mainMeter.kvar.toFixed(1)} / {mainMeter.kva.toFixed(1)}
            </div>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <RangeBar label="Power Factor" value={mainMeter.pf} min={0.80} max={1.00} zones={PF_ZONES} precision={3} compact />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <RangeBar label="Frequency" value={mainMeter.freq} unit=" Hz" min={49.5} max={50.5} zones={FREQ_ZONES} precision={2} compact />
          </Col>
          <Col xs={12} sm={8} md={2}>
            <RangeBar label="THD-V" value={mainMeter.thdV} unit="%" min={0} max={10} zones={THD_V_ZONES} precision={1} compact />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <RangeBar label="THD-I" value={mainMeter.thdI} unit="%" min={0} max={25} zones={THD_I_ZONES} precision={1} compact />
          </Col>
        </Row>
        <Text type="secondary" style={{ fontSize: 11 }}>
          One comprehensive meter on the incoming LV feed to the whole lighting system — kW ties back exactly to
          the zone dimming totals below. THD-I runs higher than Power &amp; Grid's HV substations: switch-mode
          LED/DALI drivers are a well-known harmonic-distortion source.
        </Text>
      </Card>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Zone dimming is set via DALI scene commands on a near-24/7 airport schedule (95% during operating hours,
          55% overnight safety floor 23:00–05:00) — a much flatter profile than an office building since terminals
          never fully close. Actual vs commanded dimming, occupancy-linked waste, and individual ballast/driver
          faults reported on the DALI bus are all monitored per zone below.
        </Text>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Power by Zone" size="small" style={{ height: '100%' }}>
            <ReactECharts option={powerCompareOpt} theme={chartTheme} style={{ height: 40 + zones.length * 32 }} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Footfall vs Power" size="small" style={{ height: '100%' }}>
            <ReactECharts option={footfallVsPowerOpt} theme={chartTheme} style={{ height: 40 + zones.length * 32 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="kWh Saved by Zone (Today)" size="small" style={{ height: '100%' }}>
            <ReactECharts option={kwhSavedBarOpt} theme={chartTheme} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Zone Health Matrix" size="small" style={{ height: '100%' }}>
            <ReactECharts option={lightingHeatmapOpt} theme={chartTheme} style={{ height: 300 }} />
          </Card>
        </Col>
      </Row>

      <Card title="Lighting Zones" size="small">
        <Table
          dataSource={zones}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 1200 }}
          columns={[
            { title: 'Zone', dataIndex: 'name', key: 'name', fixed: 'left', width: 170, render: (v) => <strong>{v}</strong> },
            { title: 'Terminal', key: 'zone', width: 110,
              filters: Object.keys(TERMINAL_COLOR).map(t => ({ text: t, value: t })),
              onFilter: (value, z: LightingZone) => z.zone === value,
              render: (_, z: LightingZone) => <Tag color={TERMINAL_COLOR[z.zone]}>{z.zone}</Tag> },
            { title: 'Fixtures', dataIndex: 'fixtureCount', key: 'fx', width: 90, render: (v: number) => v.toLocaleString() },
            { title: 'Dimming (actual / AI command)', key: 'dim', width: 170, render: (_, z: LightingZone) =>
              <RangeBar label="" value={z.dimmingActual} unit="%" min={0} max={100} zones={NEUTRAL_ZONES} target={z.dimmingCommand} precision={0} bare barWidth={70} /> },
            { title: 'Footfall', key: 'ff', width: 130, render: (_, z: LightingZone) =>
              <Progress percent={Math.round(z.footfallPct)} size="small" strokeColor={PURPLE} style={{ width: 90 }} /> },
            { title: 'Power', key: 'pw', width: 150, render: (_, z: LightingZone) =>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{z.powerKw.toFixed(1)} kW</span><Sparkline data={windowHistory(z.powerHistory, 1)} color={TERMINAL_COLOR[z.zone]} width={60} height={22} />
              </div> },
            { title: 'Faulty Fixtures', key: 'flt', width: 120, render: (_, z: LightingZone) => faultText(z.faultyFixtureCount) },
            { title: 'Health', key: 'h', width: 100,
              filters: [{ text: 'Normal', value: 'ok' }, { text: 'Warning', value: 'warning' }, { text: 'Critical', value: 'critical' }],
              onFilter: (value, z: LightingZone) => z.health === value,
              render: (_, z: LightingZone) => healthTag(z.health) },
          ]}
        />
      </Card>
    </div>
  )

  const labels = timeLabels(days)
  const interval = labelInterval(days)

  const powerTrendOpt = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: zones.map(z => z.name), bottom: 0, type: 'scroll' as const },
    grid: { bottom: 60, left: 55, right: 20, top: 40, containLabel: true },
    xAxis: { type: 'category' as const, data: labels, axisLabel: { interval } },
    yAxis: { type: 'value' as const, name: 'kW' },
    series: zones.map((z, i) => ({
      name: z.name, type: 'line' as const, smooth: true, showSymbol: false,
      data: windowHistory(z.powerHistory, days),
      lineStyle: { color: LINE_COLORS[i % LINE_COLORS.length] }, itemStyle: { color: LINE_COLORS[i % LINE_COLORS.length] },
      ...(i === 0 ? { markLine: dayMarkLine(days, store.darkMode) } : {}),
    })),
  }

  const schematicTab = (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <PageHeroImage
            src="/assets/schematic_lighting_layout.png"
            alt="Lighting layout schematic"
            caption="Lighting distribution — zone layout schematic"
            size="large"
          />
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Live Meter Readout" size="small" style={{ height: '100%' }}>
            <Row gutter={[12, 12]}>
              <Col span={12}>
                <Gauge label="Power Factor" value={mainMeter.pf} min={0.80} max={1.00} zones={PF_ZONES} precision={3} height={140} />
              </Col>
              <Col span={12}>
                <Statistic title="Total Power" value={totalPowerKw.toFixed(1)} suffix="kW" valueStyle={{ fontSize: 20 }} />
                <div style={{ marginTop: 10 }}>
                  <Statistic title="THD-I" value={mainMeter.thdI.toFixed(1)} suffix="%" valueStyle={{ fontSize: 20 }} />
                </div>
                <div style={{ marginTop: 10 }}>
                  <Statistic title="Frequency" value={mainMeter.freq.toFixed(2)} suffix="Hz" valueStyle={{ fontSize: 20 }} />
                </div>
              </Col>
            </Row>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(128,128,128,0.2)' }}>
              <div style={{ fontSize: 12, color: undefined, marginBottom: 8 }}>Dimming — Actual vs Command by Zone</div>
              {zones.slice(0, 6).map(z => (
                <RangeBar key={z.id} label={z.name} value={z.dimmingActual} unit="%" min={0} max={100}
                  zones={NEUTRAL_ZONES} target={z.dimmingCommand} precision={0} compact />
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )

  const trendsTab = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <TimelineSwitch value={days} onChange={setDays} />
      </div>
      <Card title="Power History — All Zones">
        <ReactECharts option={powerTrendOpt} theme={chartTheme} style={{ height: 320 }} />
      </Card>
    </div>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <Title level={3} style={{ color: undefined, marginBottom: 4 }}>Lighting — Power Monitoring</Title>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        10 zones — T1, T2, T3, T5, Cargo Village &amp; landside car park. DALI dimming, occupancy and driver-fault monitoring.
        Need to change a setpoint? Head to <strong>Lighting Control</strong>.
      </Paragraph>
      <Tabs
        defaultActiveKey="overview"
        items={[
          { key: 'overview', label: 'Overview', children: overviewTab },
          { key: 'schematic', label: 'System Schematic', children: schematicTab },
          { key: 'trends', label: 'Trends', children: trendsTab },
          { key: 'alarms', label: `Alarms (${allFindings.length})`, children: <FDDPanel findings={allFindings} systemLabel="Lighting" /> },
        ]}
      />
    </div>
  )
})

export default LightingPage
