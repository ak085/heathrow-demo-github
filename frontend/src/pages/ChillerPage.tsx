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
import PageHeroImage from '../components/PageHeroImage'
import { FlashValue } from '../components/FlashValue'
import { useEchartsTheme } from '../theme/echartsTheme'
import { windowHistory, timeLabels, labelInterval, dayMarkLine } from '../utils/history'
import type { Chiller } from '../stores/ChillerStore'

const { Title, Paragraph, Text } = Typography
const PURPLE = '#5a0057'
const LINE_COLORS = ['#5a0057', '#9b59b6', '#e74c3c', '#1677ff', '#13a8a8']

const CHW_ST_ZONES   = buildZones({ min: 5, max: 10, critLow: 5.5, warnLow: 6.5, warnHigh: 8.5, critHigh: 9.5 })
const CW_ST_ZONES    = buildZones({ min: 26, max: 36, critLow: 27, warnLow: 28, warnHigh: 32, critHigh: 34 })
const COP_ZONES      = buildZones({ min: 3, max: 6.2, critLow: 3.5, warnLow: 4.0 })
const KW_PER_RT_ZONES = buildZones({ min: 0.5, max: 1.0, warnHigh: 0.80, critHigh: 0.90 })
const FLOW_RATIO_ZONES = buildZones({ min: 1.5, max: 4.0, warnLow: 2.0, warnHigh: 3.5 })
const APPROACH_ZONES = buildZones({ min: 0, max: 12, warnHigh: 7, critHigh: 8.5 })

function healthTag(h: 'ok' | 'warning' | 'critical') {
  return h === 'critical' ? <Badge status="error" text="Critical" />
       : h === 'warning'  ? <Badge status="warning" text="Warning" />
       :                    <Badge status="success" text="Normal" />
}

function runTag(on: boolean) {
  return on ? <Tag color="success">ON</Tag> : <Tag color="default">OFF</Tag>
}

function coloredText(value: number, zones: ReturnType<typeof buildZones>, text: string) {
  const lvl = zoneAt(zones, value)
  return <span style={{ color: lvl === 'ok' ? undefined : ZONE_COLOR[lvl], fontWeight: lvl === 'ok' ? 400 : 600 }}>{text}</span>
}

function normCOP(cop: number) {
  return Math.min(100, Math.max(0, ((cop - 3.0) / (6.2 - 3.0)) * 100))
}

const ChillerPage: React.FC = observer(() => {
  const store = useStore()
  const { chiller, ahu } = store
  const {
    chillers, chillerPlantKw, avgCOP, avgCHWST, avgCWST, airsideKw, mechFanKw, allFindings,
    totalCoolingCapRT, avgKwPerRT, plantAuxKw, wetBulb, flowConsistencyErrorPct,
    headerChwFlow, headerCwFlow,
  } = chiller
  const chartTheme = useEchartsTheme()
  const [days, setDays] = useState<TimelineDays>(1)

  const powerBreakdownOpt = {
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c} kW ({d}%)' },
    legend: { show: false },
    series: [{
      type: 'pie' as const, radius: ['55%', '80%'], avoidLabelOverlap: true,
      label: { show: false },
      labelLine: { show: false },
      data: [
        { name: 'Chillers', value: Math.round(chillerPlantKw), itemStyle: { color: PURPLE } },
        { name: 'Pumps + CT', value: Math.round(plantAuxKw), itemStyle: { color: '#9b59b6' } },
        { name: 'Airside', value: Math.round(airsideKw), itemStyle: { color: '#1677ff' } },
        { name: 'Mech Fans', value: Math.round(mechFanKw), itemStyle: { color: '#13a8a8' } },
      ],
    }],
  }

  const copCompareOpt = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 60, right: 20, top: 10, bottom: 20 },
    xAxis: { type: 'value' as const, min: 3, max: 6 },
    yAxis: { type: 'category' as const, data: chillers.map(c => c.name), inverse: true },
    series: [{
      type: 'bar' as const, data: chillers.map(c => ({
        value: Number(c.cop.toFixed(2)),
        itemStyle: { color: ZONE_COLOR[zoneAt(COP_ZONES, c.cop)] },
      })),
      barWidth: 16,
      label: { show: true, position: 'right' as const, formatter: '{c}' },
    }],
  }

  // Load % vs COP — reveals the efficiency curve across the fleet, not just a ranking.
  const loadVsCopOpt = {
    tooltip: {
      trigger: 'item' as const,
      formatter: (p: any) => `${p.data[2]}<br/>Load ${p.data[0].toFixed(0)}%  |  COP ${p.data[1].toFixed(2)}`,
    },
    grid: { left: 45, right: 20, top: 16, bottom: 34 },
    xAxis: { type: 'value' as const, name: 'Load %', min: 20, max: 100, nameLocation: 'middle' as const, nameGap: 26 },
    yAxis: { type: 'value' as const, name: 'COP', min: 3, max: 6 },
    series: [{
      type: 'scatter' as const,
      symbolSize: 16,
      data: chillers.map(c => [Math.round(c.load), Number(c.cop.toFixed(2)), c.name]),
      itemStyle: { color: (p: any) => ZONE_COLOR[zoneAt(COP_ZONES, p.data[1])] },
      label: { show: true, formatter: (p: any) => p.data[2], position: 'top' as const, fontSize: 10, color: undefined },
    }],
  }

  // Run hours — maintenance-relevant ranking, sorted longest-running first.
  const runHoursSorted = [...chillers].sort((a, b) => b.runHours - a.runHours)
  const runHoursOpt = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 60, right: 30, top: 10, bottom: 20 },
    xAxis: { type: 'value' as const, name: 'hours' },
    yAxis: { type: 'category' as const, data: runHoursSorted.map(c => c.name), inverse: true },
    series: [{
      type: 'bar' as const,
      data: runHoursSorted.map(c => ({
        value: c.runHours,
        itemStyle: { color: c.runHours > 16000 ? '#faad14' : '#13a8a8' },
      })),
      barWidth: 16,
      label: { show: true, position: 'right' as const, formatter: (p: any) => p.value.toLocaleString() },
    }],
  }

  // Fleet health matrix — Load/COP/kW-per-RT/Approach normalised 0-100 per chiller, one heatmap.
  const heatmapMetrics = ['Load %', 'COP', 'kW/RT', 'Approach'] as const
  function heatmapCellScore(c: Chiller, metric: typeof heatmapMetrics[number]): number {
    if (metric === 'Load %') return c.load
    if (metric === 'COP') return normCOP(c.cop)
    if (metric === 'kW/RT') return 100 - clampPct((c.kwPerRT - 0.5) / (1.0 - 0.5) * 100)
    return 100 - clampPct((c.approach / 12) * 100)
  }
  function clampPct(v: number) { return Math.min(100, Math.max(0, v)) }
  const heatmapData: [number, number, number][] = []
  chillers.forEach((c, ci) => {
    heatmapMetrics.forEach((m, mi) => {
      heatmapData.push([mi, ci, Math.round(heatmapCellScore(c, m))])
    })
  })
  const fleetHeatmapOpt = {
    tooltip: {
      position: 'top' as const,
      formatter: (p: any) => `${chillers[p.data[1]].name} — ${heatmapMetrics[p.data[0]]}: ${p.data[2]}`,
    },
    grid: { left: 70, right: 20, top: 10, bottom: 30 },
    xAxis: { type: 'category' as const, data: heatmapMetrics, splitArea: { show: true } },
    yAxis: { type: 'category' as const, data: chillers.map(c => c.name), splitArea: { show: true } },
    visualMap: {
      min: 0, max: 100, show: false,
      inRange: { color: ['#cf1322', '#faad14', '#52c41a'] },
    },
    series: [{
      type: 'heatmap' as const,
      data: heatmapData,
      label: { show: true, fontSize: 10, formatter: (p: any) => p.data[2] },
    }],
  }

  // Cooling capacity — vertical column chart (orientation variety vs. the horizontal bars above).
  const coolingCapBarOpt = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 55, right: 20, top: 34, bottom: 30 },
    xAxis: { type: 'category' as const, data: chillers.map(c => c.name) },
    yAxis: { type: 'value' as const, name: 'RT', nameGap: 14 },
    series: [{
      type: 'bar' as const,
      data: chillers.map(c => ({ value: Math.round(c.coolingCapacityRT), itemStyle: { color: '#13a8a8' } })),
      barWidth: '55%',
      label: { show: true, position: 'top' as const, fontSize: 10 },
    }],
  }

  const fleetAvg = {
    load: chillers.reduce((s, c) => s + c.load, 0) / chillers.length,
    cop: chillers.reduce((s, c) => s + normCOP(c.cop), 0) / chillers.length,
    chwPump: chillers.reduce((s, c) => s + c.chwPumpSpeed, 0) / chillers.length,
    cwPump: chillers.reduce((s, c) => s + c.cwPumpSpeed, 0) / chillers.length,
    ctFan: chillers.reduce((s, c) => s + c.ctFanSpeed, 0) / chillers.length,
  }

  function radarOption(c: Chiller) {
    return {
      tooltip: {},
      legend: { data: [c.name, 'Fleet avg'], bottom: 0, textStyle: { fontSize: 11 } },
      radar: {
        indicator: [
          { name: 'Load %', max: 100 },
          { name: 'COP (norm)', max: 100 },
          { name: 'CHW Pump %', max: 100 },
          { name: 'CW Pump %', max: 100 },
          { name: 'CT Fan %', max: 100 },
        ],
        radius: '65%',
      },
      series: [{
        type: 'radar',
        data: [
          {
            name: c.name, value: [c.load, normCOP(c.cop), c.chwPumpSpeed, c.cwPumpSpeed, c.ctFanSpeed],
            areaStyle: { color: PURPLE, opacity: 0.25 }, lineStyle: { color: PURPLE }, itemStyle: { color: PURPLE },
          },
          {
            name: 'Fleet avg', value: [fleetAvg.load, fleetAvg.cop, fleetAvg.chwPump, fleetAvg.cwPump, fleetAvg.ctFan],
            lineStyle: { color: undefined, type: 'dashed' }, itemStyle: { color: undefined }, areaStyle: { opacity: 0 },
          },
        ],
      }],
    }
  }

  const expandedRow = (c: Chiller) => (
    <Row gutter={24}>
      <Col xs={24} md={9}>
        <ReactECharts option={radarOption(c)} theme={chartTheme} style={{ height: 240 }} />
      </Col>
      <Col xs={24} md={15}>
        <RangeBar label={`${c.name} — CHW Supply Temp`} value={c.chwST} unit="°C" min={5} max={10}
          zones={CHW_ST_ZONES} target={c.chwSP} precision={1} compact />
        <RangeBar label={`${c.name} — CW Supply Temp`} value={c.cwST} unit="°C" min={26} max={36}
          zones={CW_ST_ZONES} target={c.cwSP} precision={1} compact />
        <RangeBar label={`${c.name} — CHW Flow`} value={c.chwFlow} unit=" L/s" min={100} max={350}
          zones={buildZones({ min: 100, max: 350 })} target={c.chwFlowSP} precision={0} compact />
        <RangeBar label={`${c.name} — CW Flow`} value={c.cwFlow} unit=" L/s" min={140} max={450}
          zones={buildZones({ min: 140, max: 450 })} target={c.cwFlowSP} precision={0} compact />
        <div style={{ fontSize: 12, color: undefined, marginTop: 4 }}>
          Run hours: <strong>{c.runHours.toLocaleString()}</strong> &nbsp;|&nbsp;
          Cooling capacity: <strong>{c.coolingCapacityRT.toFixed(0)} RT</strong> ({c.coolingCapacityKW.toFixed(0)} kWth) &nbsp;|&nbsp;
          kW/RT: {coloredText(c.kwPerRT, KW_PER_RT_ZONES, c.kwPerRT.toFixed(2))}
        </div>
      </Col>
    </Row>
  )

  // ── Overview tab ──────────────────────────────────────────────────────────
  const overviewTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <PageHeroImage
            src="/assets/heathrow_schematic_v2_ground_pumps.webp"
            alt="Chiller plant 3D render"
            caption="Central plant — chilled water generation overview"
          />
        </Col>
        <Col xs={24} lg={10}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%' }} bodyStyle={{ padding: 12 }}>
                <div style={{ fontSize: 11, color: undefined }}>Total Plant Power</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}><FlashValue value={chillerPlantKw}>{chillerPlantKw.toFixed(0)} kW</FlashValue></div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <ReactECharts option={powerBreakdownOpt} theme={chartTheme} style={{ width: 90, height: 90, flexShrink: 0 }} />
                  <div style={{ marginLeft: 8 }}>
                    <div style={{ fontSize: 11 }}><span style={{ color: PURPLE }}>■</span> Chillers {chillerPlantKw.toFixed(0)}</div>
                    <div style={{ fontSize: 11 }}><span style={{ color: '#9b59b6' }}>■</span> Pumps+CT {plantAuxKw.toFixed(0)}</div>
                    <div style={{ fontSize: 11 }}><span style={{ color: '#1677ff' }}>■</span> Airside {airsideKw.toFixed(0)}</div>
                    <div style={{ fontSize: 11 }}><span style={{ color: '#13a8a8' }}>■</span> Mech Fans {mechFanKw.toFixed(0)}</div>
                  </div>
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%' }} bodyStyle={{ padding: 8 }}>
                <Gauge label="Avg COP" value={avgCOP} min={3} max={6.2} zones={COP_ZONES} height={170} />
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%', textAlign: 'center' }}>
                <Statistic title="Total Cooling Capacity" value={totalCoolingCapRT.toFixed(0)} suffix="RT"
                  valueStyle={{ fontWeight: 700, fontSize: 24 }} />
                <div style={{ fontSize: 11, color: undefined, marginTop: 6 }}>= flow × ΔT × 4.186 (BTU-meter calc)</div>
                <div style={{ marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: undefined }}>Plant kW/RT: </span>
                  {coloredText(avgKwPerRT, KW_PER_RT_ZONES, avgKwPerRT.toFixed(2))}
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%' }} title="Setpoint Tracking" bodyStyle={{ paddingBottom: 4 }}>
                <RangeBar label="Avg CHW Supply Temp" value={avgCHWST} unit="°C" min={5} max={10} zones={CHW_ST_ZONES} precision={1} compact />
                <RangeBar label="Avg CW Supply Temp" value={avgCWST} unit="°C" min={26} max={36} zones={CW_ST_ZONES} precision={1} compact />
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Fleet COP Comparison" size="small" style={{ height: '100%' }}>
            <ReactECharts option={copCompareOpt} theme={chartTheme} style={{ height: 40 + chillers.length * 34 }} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Load % vs COP — Efficiency Curve" size="small" style={{ height: '100%' }}>
            <ReactECharts option={loadVsCopOpt} theme={chartTheme} style={{ height: 40 + chillers.length * 34 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Run Hours by Chiller" size="small" style={{ height: '100%' }}>
            <ReactECharts option={runHoursOpt} theme={chartTheme} style={{ height: 40 + chillers.length * 34 }} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Fleet Health Matrix" size="small" style={{ height: '100%' }}>
            <ReactECharts option={fleetHeatmapOpt} theme={chartTheme} style={{ height: 40 + chillers.length * 34 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Cooling Capacity by Chiller" size="small" style={{ height: '100%' }}>
            <ReactECharts option={coolingCapBarOpt} theme={chartTheme} style={{ height: 260 }} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="COP Trend by Chiller (24h)" size="small" style={{ height: '100%' }}>
            <Row gutter={[12, 12]}>
              {chillers.map(c => (
                <Col xs={24} sm={12} key={c.id}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: ZONE_COLOR[zoneAt(COP_ZONES, c.cop)] }}>{c.cop.toFixed(2)}</div>
                    </div>
                    <Sparkline data={windowHistory(c.copHistory, 1)} color={PURPLE} />
                  </div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          <strong>How cooling capacity is calculated:</strong> there is no separate hardware BTU meter — the FDS's CHW flow meter
          (per chiller, §10.2) plus the supply/return temperature sensors (§10.1) already form one:
          {' '}<code>Cooling Capacity (kWth) = CHW Flow (L/s) × ΔT (°C) × 4.186</code>, converted to RT at 3.517 kW/RT.
          {' '}<code>COP = Cooling Capacity (kWth) ÷ Electrical Input (kW)</code> — both values below are derived live from flow and temperature,
          not simulated independently. Ambient wet-bulb (currently {wetBulb.toFixed(1)}°C) drives the cooling-tower approach calc.
          {flowConsistencyErrorPct > 2 && (
            <span style={{ color: '#faad14', fontWeight: 600 }}> Flow consistency check: {flowConsistencyErrorPct.toFixed(1)}% deviation between Σchiller flow and header meter — see Alarms.</span>
          )}
        </Text>
      </Card>

      <Card title="Chiller Fleet" size="small">
        <Table
          dataSource={chillers}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 1000 }}
          expandable={{ expandedRowRender: expandedRow }}
          columns={[
            { title: 'Chiller', dataIndex: 'name', key: 'name', fixed: 'left', width: 90, render: (v) => <strong>{v}</strong> },
            { title: 'Location', dataIndex: 'location', key: 'loc', width: 110 },
            { title: 'kW elec', key: 'kw', width: 130, render: (_, r: Chiller) =>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{r.kw.toFixed(0)}</span><Sparkline data={windowHistory(r.kwHistory, 1)} color={PURPLE} />
              </div> },
            { title: 'Cooling Capacity', key: 'cap', width: 140, render: (_, r: Chiller) =>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{r.coolingCapacityRT.toFixed(0)} RT</span><Sparkline data={windowHistory(r.coolingCapHistory, 1)} color="#13a8a8" />
              </div> },
            { title: 'COP', key: 'cop', width: 130, render: (_, r: Chiller) =>
              <RangeBar label="" value={r.cop} min={3} max={6.2} zones={COP_ZONES} precision={2} bare barWidth={60} /> },
            { title: 'kW/RT', key: 'kwrt', width: 130, render: (_, r: Chiller) =>
              <RangeBar label="" value={r.kwPerRT} min={0.5} max={1.0} zones={KW_PER_RT_ZONES} precision={2} bare barWidth={60} /> },
            { title: 'Load %', key: 'load', width: 110, render: (_, r: Chiller) =>
              <Progress percent={Math.round(r.load)} size="small" strokeColor={PURPLE} style={{ width: 90 }} /> },
            { title: 'CHW ΔT', key: 'chwdt', width: 80, render: (_, r: Chiller) => `${(r.chwRT - r.chwST).toFixed(1)}°C` },
            { title: 'Health', key: 'h', width: 100, render: (_, r: Chiller) => healthTag(r.health) },
          ]}
        />
      </Card>
    </div>
  )

  // ── Flows & Hydraulics tab ──────────────────────────────────────────────────
  const flowsTab = (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Every flow below is a physical CH-AI point per the FDS (§10.2); condenser flow ratio and approach are the
          derived engineering checks used to judge whether the plant is hydraulically healthy.
        </Text>
      </Card>
      <Card title="Flows & Hydraulics" size="small">
        <Table
          dataSource={chillers}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 1100 }}
          columns={[
            { title: 'Chiller', dataIndex: 'name', key: 'name', fixed: 'left', width: 90, render: (v) => <strong>{v}</strong> },
            { title: 'CHW Flow (actual / SP)', key: 'chwflow', width: 190, render: (_, r: Chiller) =>
              `${r.chwFlow.toFixed(0)} / ${r.chwFlowSP.toFixed(0)} L/s` },
            { title: 'CW Flow (actual / SP)', key: 'cwflow', width: 190, render: (_, r: Chiller) =>
              `${r.cwFlow.toFixed(0)} / ${r.cwFlowSP.toFixed(0)} L/s` },
            { title: 'DPS-02 / DPS-03', key: 'dps', width: 150, render: (_, r: Chiller) =>
              `${r.dps02.toFixed(0)} / ${r.dps03.toFixed(0)} kPa` },
            { title: 'Condenser Flow Ratio', key: 'cfr', width: 150, render: (_, r: Chiller) =>
              <RangeBar label="" value={r.condenserFlowRatio} min={1.5} max={4.0} zones={FLOW_RATIO_ZONES} precision={2} unit=" GPM/RT" bare barWidth={60} /> },
            { title: 'CT Approach', key: 'approach', width: 140, render: (_, r: Chiller) =>
              <RangeBar label="" value={r.approach} min={0} max={12} zones={APPROACH_ZONES} precision={1} unit="°C" bare barWidth={60} /> },
            { title: 'CHW ΔT / CW ΔT', key: 'delta', width: 150, render: (_, r: Chiller) =>
              `${(r.chwRT - r.chwST).toFixed(1)}°C / ${(r.cwRT - r.cwST).toFixed(1)}°C` },
          ]}
        />
      </Card>
    </div>
  )

  // ── Pumps & Cooling Towers tab ───────────────────────────────────────────────
  const pumpsTab = (
    <Card title="Pumps & Cooling Towers" size="small">
      <Table
        dataSource={chillers}
        rowKey="id"
        pagination={false}
        size="small"
        scroll={{ x: 1300 }}
        columns={[
          { title: 'Chiller', dataIndex: 'name', key: 'name', fixed: 'left', width: 90, render: (v) => <strong>{v}</strong> },
          { title: 'CHW Pump Speed (SP dashed)', key: 'chwp', width: 150, render: (_, r: Chiller) =>
            <Progress percent={Math.round(r.chwPumpSpeed)} success={{ percent: Math.round(r.chwPumpSpeedSP) }} size="small" strokeColor="#5a0057" style={{ width: 110 }} /> },
          { title: 'CHW Pump kW', key: 'chwpkw', width: 110, render: (_, r: Chiller) => r.chwPumpKW.toFixed(1) },
          { title: 'CHW Pump Run', key: 'chwprun', width: 110, render: (_, r: Chiller) => runTag(r.chwPumpRun) },
          { title: 'CW Pump Speed', key: 'cwp', width: 150, render: (_, r: Chiller) =>
            <Progress percent={Math.round(r.cwPumpSpeed)} success={{ percent: Math.round(r.cwPumpSpeedSP) }} size="small" strokeColor="#9b59b6" style={{ width: 110 }} /> },
          { title: 'CW Pump kW', key: 'cwpkw', width: 110, render: (_, r: Chiller) => r.cwPumpKW.toFixed(1) },
          { title: 'CW Pump Run', key: 'cwprun', width: 110, render: (_, r: Chiller) => runTag(r.cwPumpRun) },
          { title: 'CT Fan Speed', key: 'ctf', width: 130, render: (_, r: Chiller) =>
            <Progress percent={Math.round(r.ctFanSpeed)} size="small" strokeColor="#13a8a8" style={{ width: 90 }} /> },
          { title: 'CT Fan kW', key: 'ctfkw', width: 100, render: (_, r: Chiller) => r.ctFanKW.toFixed(1) },
          { title: 'CT Run', key: 'ctrun', width: 90, render: (_, r: Chiller) => runTag(r.ctRun) },
        ]}
      />
    </Card>
  )

  // ── Trends tab ─────────────────────────────────────────────────────────────
  const labels = timeLabels(days)
  const interval = labelInterval(days)

  function trendOpt(field: 'copHistory' | 'kwHistory' | 'coolingCapHistory', yName: string, min?: number, max?: number) {
    const markLine = dayMarkLine(days, store.darkMode)
    return {
      tooltip: { trigger: 'axis' as const },
      legend: { data: chillers.map(c => c.name), bottom: 0 },
      grid: { bottom: 50, left: 55, right: 20, top: 40, containLabel: true },
      xAxis: { type: 'category' as const, data: labels, axisLabel: { interval } },
      yAxis: { type: 'value' as const, name: yName, min, max },
      series: chillers.map((c, i) => ({
        name: c.name, type: 'line' as const, smooth: true,
        data: windowHistory(c[field], days), lineStyle: { color: LINE_COLORS[i] }, itemStyle: { color: LINE_COLORS[i] },
        showSymbol: false,
        ...(i === 0 && markLine ? { markLine } : {}),
      })),
    }
  }

  const trendsTab = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <TimelineSwitch value={days} onChange={setDays} />
      </div>
      <Card title="COP History" style={{ marginBottom: 16 }}>
        <ReactECharts option={trendOpt('copHistory', 'COP', 3, 6.5)} theme={chartTheme} style={{ height: 280 }} />
      </Card>
      <Card title="Cooling Capacity History" style={{ marginBottom: 16 }}>
        <ReactECharts option={trendOpt('coolingCapHistory', 'RT')} theme={chartTheme} style={{ height: 280 }} />
      </Card>
      <Card title="Plant Power History">
        <ReactECharts option={trendOpt('kwHistory', 'kW')} theme={chartTheme} style={{ height: 280 }} />
      </Card>
    </div>
  )

  const avgApproach = chillers.reduce((s, c) => s + c.approach, 0) / chillers.length

  const schematicTab = (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <PageHeroImage
            src="/assets/schematic_chiller_plant_chw.webp"
            alt="Chiller plant chilled water schematic"
            caption="Chiller plant — chilled water loop schematic"
            size="large"
          />
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Live Plant Conditions" size="small" style={{ height: '100%' }}>
            <Row gutter={[12, 12]}>
              <Col span={12}>
                <Statistic title="Header CHW Flow" value={headerChwFlow.toFixed(0)} suffix="L/s" valueStyle={{ fontSize: 20 }} />
                <div style={{ marginTop: 10 }}>
                  <Statistic title="Header CW Flow" value={headerCwFlow.toFixed(0)} suffix="L/s" valueStyle={{ fontSize: 20 }} />
                </div>
                <div style={{ marginTop: 10 }}>
                  <Statistic title="Ambient Wet-Bulb" value={wetBulb.toFixed(1)} suffix="°C" valueStyle={{ fontSize: 20 }} />
                </div>
              </Col>
              <Col span={12}>
                <Gauge label="Avg CT Approach" value={avgApproach} min={0} max={12} zones={APPROACH_ZONES} unit="°C" precision={1} height={140} />
              </Col>
            </Row>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(128,128,128,0.2)' }}>
              <div style={{ fontSize: 12, color: undefined, marginBottom: 4 }}>Flow Consistency Check</div>
              {coloredText(
                flowConsistencyErrorPct,
                buildZones({ min: 0, max: 6, warnHigh: 2, critHigh: 4 }),
                `${flowConsistencyErrorPct.toFixed(1)}% deviation — Σchiller flow vs header meter`,
              )}
            </div>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(128,128,128,0.2)' }}>
              <div style={{ fontSize: 12, color: undefined, marginBottom: 8 }}>Cooling Tower Approach by Chiller</div>
              {chillers.map(c => (
                <RangeBar key={c.id} label={c.name} value={c.approach} unit="°C" min={0} max={12}
                  zones={APPROACH_ZONES} precision={1} compact />
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <Title level={3} style={{ marginBottom: 4 }}>Chiller Plant</Title>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        5 water-cooled chillers — T2, T3 &amp; T5 plant rooms. AI setpoints refresh every 5 min.
      </Paragraph>
      <Tabs
        defaultActiveKey="overview"
        items={[
          { key: 'overview', label: 'Overview', children: overviewTab },
          { key: 'schematic', label: 'System Schematic', children: schematicTab },
          { key: 'flows', label: 'Flows & Hydraulics', children: flowsTab },
          { key: 'pumps', label: 'Pumps & Cooling Towers', children: pumpsTab },
          { key: 'trends', label: 'Trends', children: trendsTab },
          { key: 'alarms', label: `Alarms (${allFindings.length})`, children: <FDDPanel findings={allFindings} systemLabel="Chiller Plant" /> },
        ]}
      />
    </div>
  )
})

export default ChillerPage
