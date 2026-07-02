import React, { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { Card, Row, Col, Statistic, Table, Badge, Typography, Tabs, Tag, Progress } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useStore } from '../stores'
import { FDDPanel } from '../components/FDDPanel'
import { RangeBar, buildZones, zoneAt, ZONE_COLOR } from '../components/RangeBar'
import { Sparkline } from '../components/Sparkline'
import { TimelineSwitch, type TimelineDays } from '../components/TimelineSwitch'
import { useEchartsTheme } from '../theme/echartsTheme'
import { windowHistory, timeLabels, labelInterval, dayMarkLine } from '../utils/history'
import type { AHU } from '../stores/AHUStore'

const { Title, Paragraph, Text } = Typography
const PURPLE = '#5a0057'
const LINE_COLORS = ['#5a0057', '#9b59b6', '#e74c3c', '#1677ff', '#13a8a8', '#faad14', '#52c41a', '#eb2f96']

const SAT_ZONES       = buildZones({ min: 11, max: 19, critLow: 11.5, warnLow: 12.5, warnHigh: 16.5, critHigh: 17.5 })
const ZONE_TEMP_ZONES = buildZones({ min: 21, max: 30, critLow: 22, warnLow: 23, warnHigh: 28, critHigh: 29 })
const CO2_ZONES       = buildZones({ min: 350, max: 1150, warnHigh: 800, critHigh: 1000 })
const FILTER_DP_ZONES = buildZones({ min: 70, max: 240, warnHigh: 150, critHigh: 200 })
const NEUTRAL_ZONES   = buildZones({ min: 0, max: 100 })

function healthTag(h: 'ok' | 'warning' | 'critical') {
  return h === 'critical' ? <Badge status="error" text="Critical" />
       : h === 'warning'  ? <Badge status="warning" text="Warning" />
       :                    <Badge status="success" text="Normal" />
}

function typeTag(t: AHU['type']) {
  return t === 'control-station' ? <Tag color="blue">Control Station</Tag> : <Tag color="default">Electrical Room</Tag>
}

function coloredText(value: number, zones: ReturnType<typeof buildZones>, text: string) {
  const lvl = zoneAt(zones, value)
  return <span style={{ color: lvl === 'ok' ? undefined : ZONE_COLOR[lvl], fontWeight: lvl === 'ok' ? 400 : 600 }}>{text}</span>
}

const AHUPage: React.FC = observer(() => {
  const store = useStore()
  const { ahu } = store
  const { ahus, avgSAT, avgZoneT, avgCO2, totalFanKw, filterAlerts, allFindings } = ahu
  const chartTheme = useEchartsTheme()
  const [days, setDays] = useState<TimelineDays>(1)

  const csUnits = ahus.filter(a => a.type === 'control-station')
  const fanKwSum = ahus.reduce((s, a) => s + a.fanKW, 0)
  const freshAirKwSum = ahus.reduce((s, a) => s + a.freshAirFanKW, 0)
  const normalCount = ahus.filter(a => a.health === 'ok').length

  const powerBreakdownOpt = {
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c} kW ({d}%)' },
    series: [{
      type: 'pie' as const, radius: ['55%', '80%'],
      label: { show: false }, labelLine: { show: false },
      data: [
        { name: 'EC Fans', value: Number(fanKwSum.toFixed(1)), itemStyle: { color: PURPLE } },
        { name: 'Fresh Air Fans', value: Number(freshAirKwSum.toFixed(1)), itemStyle: { color: '#1677ff' } },
      ],
    }],
  }

  const zoneTempCompareOpt = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 100, right: 30, top: 10, bottom: 20 },
    xAxis: { type: 'value' as const, min: 20, max: 30 },
    yAxis: { type: 'category' as const, data: ahus.map(a => a.name), inverse: true },
    series: [{
      type: 'bar' as const, data: ahus.map(a => ({
        value: Number(a.zoneTemp.toFixed(1)),
        itemStyle: { color: ZONE_COLOR[zoneAt(ZONE_TEMP_ZONES, a.zoneTemp)] },
      })),
      barWidth: 12,
      label: { show: true, position: 'right' as const, formatter: '{c}°C' },
    }],
  }

  const expandedRow = (a: AHU) => (
    <Row gutter={24}>
      <Col xs={24} md={12}>
        <RangeBar label={`${a.name} — Supply Air Temp`} value={a.sat} unit="°C" min={11} max={19}
          zones={SAT_ZONES} target={a.satSP} precision={1} compact />
        <RangeBar label={`${a.name} — Zone Temp`} value={a.zoneTemp} unit="°C" min={21} max={30}
          zones={ZONE_TEMP_ZONES} target={a.zoneTempSP} precision={1} compact />
        <RangeBar label={`${a.name} — CHW Valve (actual / AI command)`} value={a.chwValve} unit="%" min={0} max={100}
          zones={NEUTRAL_ZONES} target={a.chwValveCmd} precision={0} compact />
      </Col>
      <Col xs={24} md={12}>
        {a.type === 'control-station' ? (
          <>
            <RangeBar label={`${a.name} — CO₂`} value={a.co2} unit=" ppm" min={350} max={1150} zones={CO2_ZONES} precision={0} compact />
            <RangeBar label={`${a.name} — Fresh Air Fan (actual / SP)`} value={a.freshAirSpeed} unit="%" min={0} max={100}
              zones={NEUTRAL_ZONES} target={a.freshAirSpeedSP} precision={0} compact />
          </>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>No CO₂ / fresh-air fan — electrical rooms have fixed 27°C setpoint, no occupancy-driven ventilation (FDS Table 9).</Text>
        )}
        <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 8 }}>
          HVLS: <strong>{a.hvlsOn ? `ON — fixed ${a.hvlsFixedSpeed}%` : 'OFF'}</strong> &nbsp;|&nbsp;
          Fan kW: <strong>{a.fanKW.toFixed(1)}</strong> &nbsp;|&nbsp;
          Filter DP: {coloredText(a.filterDP, FILTER_DP_ZONES, `${a.filterDP.toFixed(0)} Pa`)}
        </div>
      </Col>
    </Row>
  )

  // ── Overview tab ──────────────────────────────────────────────────────────
  const overviewTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={5}>
          <Card style={{ height: '100%', textAlign: 'center', background: 'rgba(90,0,87,0.05)', border: '1px solid rgba(90,0,87,0.2)' }}>
            <Statistic title="AHUs Normal" value={`${normalCount}/${ahus.length}`}
              valueStyle={{ color: PURPLE, fontWeight: 700, fontSize: 26 }} />
            <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 8 }}>Filter alerts: <strong>{filterAlerts}</strong></div>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card style={{ height: '100%' }} title="Fleet Averages" bodyStyle={{ paddingBottom: 4 }}>
            <RangeBar label="Avg Supply Air Temp" value={avgSAT} unit="°C" min={11} max={19} zones={SAT_ZONES} precision={1} compact />
            <RangeBar label="Avg Zone Temp" value={avgZoneT} unit="°C" min={21} max={30} zones={ZONE_TEMP_ZONES} precision={1} compact />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card style={{ height: '100%' }} bodyStyle={{ paddingBottom: 4 }} title="Avg CO₂ (Control Station)">
            <RangeBar label="" value={avgCO2} unit=" ppm" min={350} max={1150} zones={CO2_ZONES} precision={0} />
          </Card>
        </Col>
        <Col xs={24} md={7}>
          <Card style={{ height: '100%' }} bodyStyle={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <ReactECharts option={powerBreakdownOpt} theme={chartTheme} style={{ width: 90, height: 90, flexShrink: 0 }} />
              <div style={{ marginLeft: 8 }}>
                <div style={{ fontSize: 11, color: '#8c8c8c' }}>Total Fan Power</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: PURPLE }}>{totalFanKw.toFixed(1)} kW</div>
                <div style={{ fontSize: 11, marginTop: 4 }}><span style={{ color: PURPLE }}>■</span> EC Fans {fanKwSum.toFixed(1)}</div>
                <div style={{ fontSize: 11 }}><span style={{ color: '#1677ff' }}>■</span> Fresh Air {freshAirKwSum.toFixed(1)}</div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <Card title="Zone Temperature by AHU" size="small">
            <ReactECharts option={zoneTempCompareOpt} theme={chartTheme} style={{ height: 40 + ahus.length * 30 }} />
          </Card>
        </Col>
      </Row>

      <Card title="AHU Fleet" size="small">
        <Table
          dataSource={ahus}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 1150 }}
          expandable={{ expandedRowRender: expandedRow }}
          columns={[
            { title: 'AHU', dataIndex: 'name', key: 'name', fixed: 'left', width: 100, render: (v) => <strong>{v}</strong> },
            { title: 'Zone', dataIndex: 'zone', key: 'zone', width: 160 },
            { title: 'Type', key: 'type', width: 120, render: (_, r: AHU) => typeTag(r.type) },
            { title: 'SAT', key: 'sat', width: 130, render: (_, r: AHU) =>
              <RangeBar label="" value={r.sat} min={11} max={19} zones={SAT_ZONES} target={r.satSP} precision={1} bare barWidth={60} /> },
            { title: 'Zone Temp', key: 'zt', width: 130, render: (_, r: AHU) =>
              <RangeBar label="" value={r.zoneTemp} min={21} max={30} zones={ZONE_TEMP_ZONES} target={r.zoneTempSP} precision={1} bare barWidth={60} /> },
            { title: 'CO₂', key: 'co2', width: 150, render: (_, r: AHU) => r.type === 'control-station'
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{r.co2.toFixed(0)}</span><Sparkline data={windowHistory(r.co2History, 1)} color="#faad14" width={70} height={24} />
                </div>
              : <Text type="secondary" style={{ fontSize: 11 }}>N/A</Text> },
            { title: 'Filter DP', key: 'fdp', width: 130, render: (_, r: AHU) =>
              <RangeBar label="" value={r.filterDP} unit=" Pa" min={70} max={240} zones={FILTER_DP_ZONES} precision={0} bare barWidth={60} /> },
            { title: 'Health', key: 'h', width: 100, render: (_, r: AHU) => healthTag(r.health) },
          ]}
        />
      </Card>
    </div>
  )

  // ── Ventilation & IAQ tab ────────────────────────────────────────────────────
  const ventTab = (
    <div>
      <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          CO₂-driven fresh air control applies to Control Station units only (§4.2) — Electrical Rooms have no
          occupancy-driven ventilation and are excluded below. HVLS station fans are switched ON/OFF by the AI only;
          their run speed is fixed at commissioning (§4.3).
        </Text>
      </Card>
      <Card title="Fresh Air & HVLS — Control Station Units" size="small">
        <Table
          dataSource={csUnits}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 900 }}
          columns={[
            { title: 'AHU', dataIndex: 'name', key: 'name', fixed: 'left', width: 100, render: (v) => <strong>{v}</strong> },
            { title: 'CO₂', key: 'co2', width: 150, render: (_, r: AHU) =>
              <RangeBar label="" value={r.co2} unit=" ppm" min={350} max={1150} zones={CO2_ZONES} precision={0} bare barWidth={70} /> },
            { title: 'Fresh Air Fan (actual/SP)', key: 'fa', width: 150, render: (_, r: AHU) =>
              <Progress percent={Math.round(r.freshAirSpeed)} success={{ percent: Math.round(r.freshAirSpeedSP) }} size="small" strokeColor="#1677ff" style={{ width: 110 }} /> },
            { title: 'Fresh Air Fan kW', key: 'fakw', width: 130, render: (_, r: AHU) => r.freshAirFanKW.toFixed(1) },
            { title: 'Fresh Air Run', key: 'farun', width: 110, render: (_, r: AHU) => <Tag color={r.freshAirFanRun ? 'success' : 'default'}>{r.freshAirFanRun ? 'ON' : 'OFF'}</Tag> },
            { title: 'HVLS Status', key: 'hvls', width: 110, render: (_, r: AHU) => <Tag color={r.hvlsOn ? 'success' : 'default'}>{r.hvlsOn ? 'ON' : 'OFF'}</Tag> },
            { title: 'HVLS Fixed Speed', key: 'hvlsspeed', width: 130, render: (_, r: AHU) => r.hvlsOn ? `${r.hvlsFixedSpeed}%` : '—' },
            { title: 'Zone Temp Strategy', key: 'strat', width: 160, render: (_, r: AHU) => r.hvlsOn ? <Tag color="blue">Fan ON → 27°C</Tag> : <Tag color="purple">Fan OFF → 25°C</Tag> },
          ]}
        />
      </Card>
    </div>
  )

  // ── Trends tab ─────────────────────────────────────────────────────────────
  const labels = timeLabels(days)
  const interval = labelInterval(days)

  const co2Opt = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: csUnits.map(a => a.name), bottom: 0 },
    grid: { bottom: 50, left: 55, right: 20, top: 40, containLabel: true },
    xAxis: { type: 'category' as const, data: labels, axisLabel: { interval } },
    yAxis: { type: 'value' as const, name: 'ppm' },
    series: csUnits.map((a, i) => ({
      name: a.name, type: 'line' as const, smooth: true,
      data: windowHistory(a.co2History, days), lineStyle: { color: LINE_COLORS[i % LINE_COLORS.length] }, itemStyle: { color: LINE_COLORS[i % LINE_COLORS.length] },
      showSymbol: false,
      ...(i === 0 ? { markLine: dayMarkLine(days, store.darkMode) } : {}),
    })),
  }

  const freshAirOpt = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: csUnits.map(a => a.name), bottom: 0 },
    grid: { bottom: 50, left: 55, right: 20, top: 40, containLabel: true },
    xAxis: { type: 'category' as const, data: labels, axisLabel: { interval } },
    yAxis: { type: 'value' as const, name: '%' },
    series: csUnits.map((a, i) => ({
      name: a.name, type: 'line' as const, smooth: true,
      data: windowHistory(a.freshAirHistory, days), lineStyle: { color: LINE_COLORS[i % LINE_COLORS.length] }, itemStyle: { color: LINE_COLORS[i % LINE_COLORS.length] },
      showSymbol: false,
      ...(i === 0 ? { markLine: dayMarkLine(days, store.darkMode) } : {}),
    })),
  }

  const fanKwOpt = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ahus.map(a => a.name), bottom: 0, type: 'scroll' as const },
    grid: { bottom: 60, left: 55, right: 20, top: 40, containLabel: true },
    xAxis: { type: 'category' as const, data: labels, axisLabel: { interval } },
    yAxis: { type: 'value' as const, name: 'kW' },
    series: ahus.map((a, i) => ({
      name: a.name, type: 'line' as const, smooth: true,
      data: windowHistory(a.fanKwHistory, days), lineStyle: { color: LINE_COLORS[i % LINE_COLORS.length] }, itemStyle: { color: LINE_COLORS[i % LINE_COLORS.length] },
      showSymbol: false,
      ...(i === 0 ? { markLine: dayMarkLine(days, store.darkMode) } : {}),
    })),
  }

  const trendsTab = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <TimelineSwitch value={days} onChange={setDays} />
      </div>
      <Card title="CO₂ History (Control Station)" style={{ marginBottom: 16 }}>
        <ReactECharts option={co2Opt} theme={chartTheme} style={{ height: 280 }} />
      </Card>
      <Card title="Fresh Air Fan Speed History" style={{ marginBottom: 16 }}>
        <ReactECharts option={freshAirOpt} theme={chartTheme} style={{ height: 280 }} />
      </Card>
      <Card title="EC Fan Power History (All Units)">
        <ReactECharts option={fanKwOpt} theme={chartTheme} style={{ height: 300 }} />
      </Card>
    </div>
  )

  // ── System Schematic Tab — live airflow process diagram ────────────────────
  // A single representative flow (fleet-average values) for the more complex control-station
  // type (8 of 10 units) — electrical-room units skip the fresh-air/CO2 stages, noted below.
  const avgFilterDP = ahus.reduce((s, a) => s + a.filterDP, 0) / ahus.length
  const avgChwValve = ahus.reduce((s, a) => s + a.chwValve, 0) / ahus.length
  const avgFanSpeed = ahus.reduce((s, a) => s + a.fanSpeed, 0) / ahus.length
  const avgFreshAirSpeedCS = csUnits.reduce((s, a) => s + a.freshAirSpeed, 0) / csUnits.length

  const OA_COLOR = '#1677ff'
  const FILTER_COLOR = '#faad14'
  const COIL_COLOR = '#7c3aed'
  const FAN_COLOR = PURPLE
  const ZONE_COLOR_SCHEMATIC = '#52c41a'

  const ahuSchematicNodes = [
    { name: 'Outside Air Intake', x: 130, y: 150, symbol: 'roundRect', symbolSize: [230, 90],
      itemStyle: { color: OA_COLOR }, label: { formatter: `Outside Air Intake\nDamper ${avgFreshAirSpeedCS.toFixed(0)}%  |  Fans ${freshAirKwSum.toFixed(0)} kW\n(control-station units)` } },
    { name: 'Filter', x: 400, y: 150, symbol: 'roundRect', symbolSize: [180, 90],
      itemStyle: { color: FILTER_COLOR }, label: { formatter: `Filter\nAvg DP ${avgFilterDP.toFixed(0)} Pa\n${filterAlerts} unit(s) elevated` } },
    { name: 'Cooling Coil (CHW)', x: 650, y: 150, symbol: 'roundRect', symbolSize: [220, 90],
      itemStyle: { color: COIL_COLOR }, label: { formatter: `Cooling Coil (CHW)\nValve ${avgChwValve.toFixed(0)}% open\nFed from Chiller Plant CHW header` } },
    { name: 'Supply Fan', x: 900, y: 150, symbol: 'roundRect', symbolSize: [200, 90],
      itemStyle: { color: FAN_COLOR }, label: { formatter: `Supply Fan (EC)\n${avgFanSpeed.toFixed(0)}% speed\n${fanKwSum.toFixed(0)} kW total` } },
    { name: 'Discharge → Zone', x: 1150, y: 150, symbol: 'roundRect', symbolSize: [240, 90],
      itemStyle: { color: ZONE_COLOR_SCHEMATIC }, label: { formatter: `Discharge → Zone\nSAT ${avgSAT.toFixed(1)}°C  |  Zone ${avgZoneT.toFixed(1)}°C\nCO₂ ${avgCO2.toFixed(0)} ppm (CS units)` } },
  ]
  const ahuSchematicLinks = [
    { source: 'Outside Air Intake', target: 'Filter', lineStyle: { color: '#999', width: 2 } },
    { source: 'Filter', target: 'Cooling Coil (CHW)', lineStyle: { color: '#999', width: 2 } },
    { source: 'Cooling Coil (CHW)', target: 'Supply Fan', lineStyle: { color: '#999', width: 2 } },
    { source: 'Supply Fan', target: 'Discharge → Zone', lineStyle: { color: '#999', width: 2 } },
  ]
  const ahuSchematicOpt = {
    tooltip: { show: false },
    series: [{
      type: 'graph' as const, layout: 'none' as const,
      symbol: 'roundRect', roam: false,
      label: { show: true, color: '#fff', fontSize: 12, fontWeight: 600, lineHeight: 16 },
      edgeSymbol: ['none', 'arrow'], edgeSymbolSize: [0, 8],
      lineStyle: { color: '#999', width: 2, curveness: 0 },
      data: ahuSchematicNodes,
      links: ahuSchematicLinks,
    }],
  }

  const schematicTab = (
    <div>
      <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Live airflow schematic for a typical control-station AHU (8 of 10 units) — outside air → filter →
          cooling coil → supply fan → zone. Values are fleet averages across all 10 units unless noted; the 2
          electrical-room units skip the fresh-air/CO₂ stages and run to a fixed 27°C zone setpoint instead.
        </Text>
      </Card>
      <Card title="AHUs — System Schematic">
        <ReactECharts option={ahuSchematicOpt} theme={chartTheme} style={{ height: 340 }} />
      </Card>
    </div>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <Title level={3} style={{ color: PURPLE, marginBottom: 4 }}>Air Handling Units</Title>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        10 AHUs — T1, T2, T3 &amp; T5 (8 Control Station + 2 Electrical Room per FDS Table 9). AI setpoints refresh every 5 min.
      </Paragraph>
      <Tabs
        defaultActiveKey="overview"
        items={[
          { key: 'overview', label: 'Overview', children: overviewTab },
          { key: 'schematic', label: 'System Schematic', children: schematicTab },
          { key: 'vent', label: 'Ventilation & IAQ', children: ventTab },
          { key: 'trends', label: 'Trends', children: trendsTab },
          { key: 'alarms', label: `Alarms (${allFindings.length})`, children: <FDDPanel findings={allFindings} systemLabel="AHUs" /> },
        ]}
      />
    </div>
  )
})

export default AHUPage
