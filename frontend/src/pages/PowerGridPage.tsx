import React, { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { Tabs, Card, Row, Col, Statistic, Alert, Typography, Table, Tag, Badge } from 'antd'
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
import type { Substation } from '../stores/PowerGridStore'

const { Title, Paragraph, Text } = Typography
const PURPLE = '#5a0057'

const PF_ZONES     = buildZones({ min: 0.80, max: 1.00, critLow: 0.85, warnLow: 0.92 })
const THD_V_ZONES  = buildZones({ min: 0, max: 10, warnHigh: 5, critHigh: 8 })
const THD_I_ZONES  = buildZones({ min: 0, max: 25, warnHigh: 15, critHigh: 20 })
const UNBAL_ZONES  = buildZones({ min: 0, max: 5, warnHigh: 2, critHigh: 3 })
const FREQ_ZONES   = buildZones({ min: 49.5, max: 50.5, critLow: 49.8, warnLow: 49.9, warnHigh: 50.1, critHigh: 50.2 })
const DEMAND_PCT_ZONES = buildZones({ min: 0, max: 110, warnHigh: 85, critHigh: 95 })
const SYSTEM_COLOR: Record<MeterRow['system'], string> = {
  'Chiller Plant': 'purple', 'Airside': 'magenta', 'Lighting': 'lime', 'Mech Fans': 'blue',
}

function healthBadge(pfHealth: 'ok' | 'warning' | 'critical') {
  return pfHealth === 'critical' ? <Badge status="error" text="Critical" />
       : pfHealth === 'warning'  ? <Badge status="warning" text="Warning" />
       :                           <Badge status="success" text="Normal" />
}

function coloredText(value: number, zones: ReturnType<typeof buildZones>, text: string) {
  const lvl = zoneAt(zones, value)
  return <span style={{ color: lvl === 'ok' ? undefined : ZONE_COLOR[lvl], fontWeight: lvl === 'ok' ? 400 : 600 }}>{text}</span>
}

interface MeterRow {
  id: string
  name: string
  system: 'Chiller Plant' | 'Airside' | 'Lighting' | 'Mech Fans'
  location: string
  kw: number
  health: 'ok' | 'warning' | 'critical' | null
}

const PowerGridPage: React.FC = observer(() => {
  const store = useStore()
  const { power, chiller, ahu, lighting } = store
  const { substations, totalBuildingKw, chillerPlantKw, airsideKw, mechFanKw, lightingKw, otherKw,
          todayTotalKwh, todayChillerKwh, todayAirsideKwh, todayLightingKwh, todayMechFanKwh, todayOtherKwh,
          heatmapData, allFindings, avgPF } = power
  const chartTheme = useEchartsTheme()
  const [days, setDays] = useState<TimelineDays>(1)

  const criticalPF = substations.filter(s => s.pf < 0.85)
  const warningPF  = substations.filter(s => s.pf < 0.92 && s.pf >= 0.85)
  const avgFreq = substations.reduce((s, sub) => s + sub.freq, 0) / substations.length
  const labels = timeLabels(days)
  const interval = labelInterval(days)

  // ── Demand Profiles Tab ───────────────────────────────────────────────────
  const demandOpt = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: substations.map(s => s.name), bottom: 0 },
    grid: { bottom: 50, left: 55, right: 20, top: 40, containLabel: true },
    xAxis: { type: 'category' as const, data: labels, axisLabel: { interval } },
    yAxis: { type: 'value' as const, name: 'kW' },
    series: substations.map((s, i) => ({
      name: s.name, type: 'line' as const, smooth: true, showSymbol: false,
      data: windowHistory(s.demandHistory, days),
      lineStyle: { color: s.color, width: 2 }, itemStyle: { color: s.color },
      areaStyle: { color: s.color, opacity: 0.05 },
      ...(i === 0 ? { markLine: dayMarkLine(days, store.darkMode) } : {}),
    })),
  }

  const demandCompareOpt = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 80, right: 60, top: 10, bottom: 20 },
    xAxis: { type: 'value' as const, name: 'kW' },
    yAxis: { type: 'category' as const, data: substations.map(s => s.name), inverse: true },
    series: [{
      type: 'bar' as const, data: substations.map(s => ({ value: Math.round(s.kw), itemStyle: { color: s.color } })),
      barWidth: 18, label: { show: true, position: 'right' as const, formatter: '{c} kW' },
    }],
  }

  // Today's energy — vertical column chart (orientation variety vs. the horizontal demand bar).
  const todayKwhBarOpt = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 60, right: 20, top: 34, bottom: 30 },
    xAxis: { type: 'category' as const, data: substations.map(s => s.name) },
    yAxis: { type: 'value' as const, name: 'kWh', nameGap: 14 },
    series: [{
      type: 'bar' as const,
      data: substations.map(s => ({ value: Math.round(s.todayKwh), itemStyle: { color: s.color } })),
      barWidth: '55%',
      label: { show: true, position: 'top' as const, fontSize: 10, formatter: (p: any) => p.value.toLocaleString() },
    }],
  }

  // Substation profile radar — kW-of-rated / PF / THD-I / voltage balance, all substations overlaid.
  const substationRadarOpt = {
    tooltip: {},
    legend: { data: substations.map(s => s.name), bottom: 0, textStyle: { fontSize: 10 } },
    radar: {
      indicator: [
        { name: '% of Rated', max: 100 },
        { name: 'PF (norm)', max: 100 },
        { name: 'THD-I (inv)', max: 100 },
        { name: 'V Balance', max: 100 },
      ],
      radius: '65%',
    },
    series: [{
      type: 'radar' as const,
      data: substations.map(s => ({
        name: s.name,
        value: [
          Math.round((s.kw / s.ratedKw) * 100),
          Math.round(((s.pf - 0.8) / 0.2) * 100),
          Math.round(100 - Math.min(100, (s.thdI / 25) * 100)),
          Math.round(100 - Math.min(100, (s.voltageUnbalance / 5) * 100)),
        ],
        lineStyle: { color: s.color }, itemStyle: { color: s.color }, areaStyle: { color: s.color, opacity: 0.08 },
      })),
    }],
  }

  const demandTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <PageHeroImage
            src="/assets/airport_power_grid_3d.webp"
            alt="Airport power grid substations"
            caption="Terminal substations — power distribution overview"
          />
        </Col>
        <Col xs={24} lg={10}>
          <Row gutter={[16, 16]}>
            <Col xs={24}>
              <Card style={{ textAlign: 'center', border: `2px solid ${PURPLE}` }}>
                <Statistic title="Total Building Demand" value={totalBuildingKw.toFixed(0)} suffix="kW"
                  formatter={() => <FlashValue value={totalBuildingKw}>{totalBuildingKw.toFixed(0)}</FlashValue>}
                  valueStyle={{ color: undefined, fontWeight: 800, fontSize: 30 }} />
              </Card>
            </Col>
            <Col xs={12}>
              <Card style={{ height: '100%' }} bodyStyle={{ padding: 8 }}>
                <Gauge label="Avg Power Factor" value={avgPF} min={0.8} max={1.0} zones={PF_ZONES} precision={3} height={130} />
              </Card>
            </Col>
            <Col xs={12}>
              <Card style={{ height: '100%' }} bodyStyle={{ padding: 8 }}>
                <Gauge label="Avg Frequency" value={avgFreq} min={49.5} max={50.5} zones={FREQ_ZONES} unit=" Hz" precision={2} height={130} />
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Demand by Substation" size="small" style={{ height: '100%' }}>
            <ReactECharts option={demandCompareOpt} theme={chartTheme} style={{ height: 40 + substations.length * 40 }} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Substation Profile Comparison" size="small" style={{ height: '100%' }}>
            <ReactECharts option={substationRadarOpt} theme={chartTheme} style={{ height: 280 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Today's Energy by Substation" size="small" style={{ height: '100%' }}>
            <ReactECharts option={todayKwhBarOpt} theme={chartTheme} style={{ height: 260 }} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Demand — Live Sparklines" size="small" style={{ height: '100%' }}>
            <Row gutter={[12, 12]}>
              {substations.map(s => (
                <Col xs={24} sm={12} key={s.id}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.kw.toFixed(0)} kW</div>
                    </div>
                    <Sparkline data={windowHistory(s.demandHistory, 1)} color={s.color} />
                  </div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
      </Row>

      <Card title="Substations" size="small" style={{ marginBottom: 16 }}>
        <Table
          dataSource={substations}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 900 }}
          columns={[
            { title: 'Substation', dataIndex: 'name', key: 'name', fixed: 'left', width: 100, render: (v) => <strong>{v}</strong> },
            { title: 'Demand', key: 'kw', width: 150, render: (_, s: Substation) =>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{s.kw.toFixed(0)} kW</span><Sparkline data={windowHistory(s.demandHistory, 1)} color={s.color} />
              </div> },
            { title: '% of Rated', key: 'pctrated', width: 150, render: (_, s: Substation) =>
              <RangeBar label="" value={(s.kw / s.ratedKw) * 100} unit="%" min={0} max={110} zones={DEMAND_PCT_ZONES} precision={0} bare barWidth={70} /> },
            { title: 'Rated', key: 'rated', width: 100, render: (_, s: Substation) => `${s.ratedKw} kW` },
            { title: 'Today', key: 'kwh', width: 120, render: (_, s: Substation) => `${Math.round(s.todayKwh).toLocaleString()} kWh` },
            { title: 'Health', key: 'h', width: 100, render: (_, s: Substation) => healthBadge(s.pfHealth) },
          ]}
        />
      </Card>

      <Card title="Demand Profile" extra={<TimelineSwitch value={days} onChange={setDays} />}>
        <ReactECharts option={demandOpt} theme={chartTheme} style={{ height: 350 }} />
      </Card>
    </div>
  )

  // ── Power Factor Tab ──────────────────────────────────────────────────────
  const pfCompareOpt = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 80, right: 60, top: 10, bottom: 20 },
    xAxis: { type: 'value' as const, min: 0.8, max: 1.0 },
    yAxis: { type: 'category' as const, data: substations.map(s => s.name), inverse: true },
    series: [{
      type: 'bar' as const, data: substations.map(s => ({
        value: Number(s.pf.toFixed(3)), itemStyle: { color: ZONE_COLOR[zoneAt(PF_ZONES, s.pf)] },
      })),
      barWidth: 18, label: { show: true, position: 'right' as const, formatter: '{c}' },
    }],
  }

  const pfHistOpt = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: substations.map(s => s.name), bottom: 0 },
    grid: { bottom: 50, left: 55, right: 20, top: 40, containLabel: true },
    xAxis: { type: 'category' as const, data: labels, axisLabel: { interval } },
    yAxis: { type: 'value' as const, name: 'Power Factor', min: 0.78, max: 1.01 },
    series: substations.map((s, i) => ({
      name: s.name, type: 'line' as const, smooth: true, showSymbol: false,
      data: windowHistory(s.pfHistory, days),
      lineStyle: { color: s.color, width: 2 }, itemStyle: { color: s.color },
      ...(i === 0 ? { markLine: dayMarkLine(days, store.darkMode) } : {}),
    })),
  }

  const pfTab = (
    <div>
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

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={6}>
          <Card style={{ height: '100%', textAlign: 'center' }}>
            <Statistic title="Building Avg PF" value={avgPF.toFixed(3)}
              valueStyle={{ color: ZONE_COLOR[zoneAt(PF_ZONES, avgPF)], fontWeight: 700, fontSize: 26 }} />
          </Card>
        </Col>
        <Col xs={24} md={18}>
          <Card title="PF by Substation" size="small">
            <ReactECharts option={pfCompareOpt} theme={chartTheme} style={{ height: 40 + substations.length * 40 }} />
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16, border: '1px solid #ffe58f' }}>
        <Text style={{ fontSize: 13 }}>
          <strong>Why Power Factor Matters:</strong> Low PF increases apparent power demand and triggers UKPN
          network charges. Target: <Tag color="success">PF ≥ 0.92</Tag> Warning: <Tag color="warning">0.85–0.92</Tag> Critical: <Tag color="error">&lt; 0.85</Tag>
        </Text>
      </Card>

      <Card title="Substations — Electrical Detail" size="small" style={{ marginBottom: 16 }}>
        <Table
          dataSource={substations}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 950 }}
          columns={[
            { title: 'Substation', dataIndex: 'name', key: 'name', fixed: 'left', width: 100, render: (v) => <strong>{v}</strong> },
            { title: 'PF', key: 'pf', width: 140, render: (_, s: Substation) =>
              <RangeBar label="" value={s.pf} min={0.80} max={1.00} zones={PF_ZONES} precision={3} bare barWidth={70} /> },
            { title: 'kW', key: 'kw', width: 90, render: (_, s: Substation) => s.kw.toFixed(0) },
            { title: 'kVAR', key: 'kvar', width: 90, render: (_, s: Substation) => s.kvar.toFixed(0) },
            { title: 'kVA', key: 'kva', width: 90, render: (_, s: Substation) => s.kva.toFixed(0) },
            { title: 'Current', key: 'i', width: 90, render: (_, s: Substation) => `${s.current.toFixed(0)} A` },
            { title: 'Voltage', key: 'v', width: 100, render: (_, s: Substation) => `${(s.voltage / 1000).toFixed(1)} kV` },
            { title: 'Health', key: 'h', width: 100, render: (_, s: Substation) => healthBadge(s.pfHealth) },
          ]}
        />
      </Card>

      <Card title="Power Factor Trend" extra={<TimelineSwitch value={days} onChange={setDays} />}>
        <ReactECharts option={pfHistOpt} theme={chartTheme} style={{ height: 300 }} />
      </Card>
    </div>
  )

  // ── Power Quality (THD / Harmonics) Tab ───────────────────────────────────
  function harmonicsOpt(s: Substation) {
    const orders = s.harmonicsI.map(h => `${h.order}${h.order === 3 ? 'rd' : 'th'}`)
    return {
      tooltip: { trigger: 'axis' as const },
      legend: { data: ['Voltage %', 'Current %'], bottom: 0 },
      grid: { left: 45, right: 20, top: 40, bottom: 40, containLabel: true },
      xAxis: { type: 'category' as const, data: orders, name: 'Harmonic order' },
      yAxis: { type: 'value' as const, name: '%' },
      series: [
        { name: 'Voltage %', type: 'bar' as const, data: s.harmonicsV.map(h => Number(h.pct.toFixed(2))), itemStyle: { color: '#1677ff' } },
        { name: 'Current %', type: 'bar' as const, data: s.harmonicsI.map(h => Number(h.pct.toFixed(2))), itemStyle: { color: '#e74c3c' } },
      ],
    }
  }

  const pqExpandedRow = (s: Substation) => (
    <Row gutter={24}>
      <Col xs={24} lg={14}>
        <ReactECharts option={harmonicsOpt(s)} theme={chartTheme} style={{ height: 220 }} />
      </Col>
      <Col xs={24} lg={10}>
        <RangeBar label={`${s.name} — Frequency`} value={s.freq} unit=" Hz" min={49.5} max={50.5} zones={FREQ_ZONES} precision={2} compact />
        <div style={{ fontSize: 12, color: undefined, marginTop: 8 }}>
          Phase voltages: <strong>{s.vL1.toFixed(0)} / {s.vL2.toFixed(0)} / {s.vL3.toFixed(0)} V</strong><br />
          Phase currents: <strong>{s.iL1.toFixed(0)} / {s.iL2.toFixed(0)} / {s.iL3.toFixed(0)} A</strong><br />
          Current unbalance: {coloredText(s.currentUnbalance, UNBAL_ZONES, `${s.currentUnbalance.toFixed(1)}%`)}<br />
          Breaker: <Tag color={s.breakerClosed ? 'success' : 'error'}>{s.breakerClosed ? 'CLOSED' : 'OPEN'}</Tag>
          Meter comms: <Tag color={s.meterOk ? 'success' : 'error'}>{s.meterOk ? 'OK' : 'FAIL'}</Tag>
        </div>
      </Col>
    </Row>
  )

  const pqTab = (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          THD-V, THD-I and individual odd harmonics (3rd–13th) are standard on BACnet-native Class 0.5S multifunction
          meters (e.g. Schneider PM5000 series) — no separate power-quality analyzer is required. THD here is derived
          as √(Σ harmonic²), consistent with the individual harmonics shown in each row's detail view.
          IEEE 519 guidance: THD-I ≤ 15% (industrial), THD-V ≤ 5% (transmission-level).
        </Text>
      </Card>
      <Card title="Power Quality by Substation" size="small">
        <Table
          dataSource={substations}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 900 }}
          expandable={{ expandedRowRender: pqExpandedRow }}
          columns={[
            { title: 'Substation', dataIndex: 'name', key: 'name', fixed: 'left', width: 100, render: (v) => <strong>{v}</strong> },
            { title: 'THD-V', key: 'thdv', width: 140, render: (_, s: Substation) =>
              <RangeBar label="" value={s.thdV} unit="%" min={0} max={10} zones={THD_V_ZONES} precision={1} bare barWidth={70} /> },
            { title: 'THD-I', key: 'thdi', width: 140, render: (_, s: Substation) =>
              <RangeBar label="" value={s.thdI} unit="%" min={0} max={25} zones={THD_I_ZONES} precision={1} bare barWidth={70} /> },
            { title: 'Voltage Unbalance', key: 'vunbal', width: 160, render: (_, s: Substation) =>
              <RangeBar label="" value={s.voltageUnbalance} unit="%" min={0} max={5} zones={UNBAL_ZONES} precision={1} bare barWidth={70} /> },
            { title: 'Frequency', key: 'freq', width: 100, render: (_, s: Substation) => `${s.freq.toFixed(2)} Hz` },
            { title: 'Health', key: 'h', width: 100, render: (_, s: Substation) => healthBadge(s.pfHealth) },
          ]}
        />
      </Card>
    </div>
  )

  // ── Sub-Meters Tab ────────────────────────────────────────────────────────
  const subMeterDonutOpt = {
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c} kWh ({d}%)' },
    legend: { show: false },
    series: [{
      type: 'pie' as const, radius: ['55%', '80%'],
      label: { show: false }, labelLine: { show: false },
      data: [
        { name: 'Chiller Plant', value: Math.round(todayChillerKwh), itemStyle: { color: PURPLE } },
        { name: 'Airside (AHU)', value: Math.round(todayAirsideKwh), itemStyle: { color: '#9b59b6' } },
        { name: 'Lighting', value: Math.round(todayLightingKwh), itemStyle: { color: '#65a30d' } },
        { name: 'Mech Fans', value: Math.round(todayMechFanKwh), itemStyle: { color: '#3498db' } },
        { name: 'Other', value: Math.round(todayOtherKwh), itemStyle: { color: '#bbb' } },
      ],
    }],
  }

  const meterRows: MeterRow[] = [
    ...chiller.chillers.map(c => ({
      id: c.id, name: c.name, system: 'Chiller Plant' as const, location: c.location, kw: c.kw, health: c.health,
    })),
    ...ahu.ahus.map(a => ({
      id: a.id, name: a.name, system: 'Airside' as const, location: a.zone, kw: a.fanKW + a.freshAirFanKW, health: a.health,
    })),
    ...lighting.zones.map(z => ({
      id: z.id, name: z.name, system: 'Lighting' as const, location: z.zone, kw: z.powerKw, health: z.health,
    })),
    { id: 'MECH-AGG', name: 'Mechanical Fans (aggregate)', system: 'Mech Fans' as const, location: 'Plant-wide', kw: mechFanKw, health: null },
  ]

  const subMetersTab = (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card style={{ height: '100%' }} bodyStyle={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <ReactECharts option={subMeterDonutOpt} theme={chartTheme} style={{ width: 130, height: 130, flexShrink: 0 }} />
              <div style={{ marginLeft: 8 }}>
                <div style={{ fontSize: 11, color: undefined }}>Total Building Today</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: undefined, marginBottom: 6 }}>{Math.round(todayTotalKwh).toLocaleString()} kWh</div>
                <div style={{ fontSize: 11 }}><span style={{ color: PURPLE }}>■</span> Chiller Plant {Math.round(todayChillerKwh).toLocaleString()}</div>
                <div style={{ fontSize: 11 }}><span style={{ color: '#9b59b6' }}>■</span> Airside {Math.round(todayAirsideKwh).toLocaleString()}</div>
                <div style={{ fontSize: 11 }}><span style={{ color: '#65a30d' }}>■</span> Lighting {Math.round(todayLightingKwh).toLocaleString()}</div>
                <div style={{ fontSize: 11 }}><span style={{ color: '#3498db' }}>■</span> Mech Fans {Math.round(todayMechFanKwh).toLocaleString()}</div>
                <div style={{ fontSize: 11 }}><span style={{ color: '#bbb' }}>■</span> Other {Math.round(todayOtherKwh).toLocaleString()}</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card style={{ textAlign: 'center', height: '100%' }}>
            <Statistic title="Chiller Plant Now" value={chillerPlantKw.toFixed(0)} suffix="kW" valueStyle={{ color: undefined, fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card style={{ textAlign: 'center', height: '100%' }}>
            <Statistic title="Airside Now" value={airsideKw.toFixed(0)} suffix="kW" valueStyle={{ color: '#9b59b6', fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card style={{ textAlign: 'center', height: '100%' }}>
            <Statistic title="Lighting Now" value={lightingKw.toFixed(0)} suffix="kW" valueStyle={{ color: '#65a30d', fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card style={{ textAlign: 'center', height: '100%' }}>
            <Statistic title="Mech Fans Now" value={mechFanKw.toFixed(0)} suffix="kW" valueStyle={{ color: '#3498db', fontSize: 20 }} />
          </Card>
        </Col>
      </Row>
      <Row style={{ marginTop: 8, marginBottom: 16 }}>
        <Col span={24}>
          <Text type="secondary" style={{ fontSize: 11 }}>Other (unmetered here — retail, IT, baggage systems etc.): {otherKw.toFixed(0)} kW now</Text>
        </Col>
      </Row>

      <Card title="Individual Meter Readings" size="small">
        <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
          The category totals above are the sum of these real individual points — not a single lump-sum meter.
          Mechanical Fans has no per-unit sub-metering in this demo, so it appears as one aggregate row; every
          other row is a real, individually tracked unit shown elsewhere on its own system page.
        </Paragraph>
        <Table<MeterRow>
          dataSource={meterRows}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ y: 420 }}
          columns={[
            { title: 'Meter', dataIndex: 'name', key: 'name', fixed: 'left', width: 150, render: (v) => <strong>{v}</strong> },
            { title: 'System', key: 'system', width: 130,
              filters: (['Chiller Plant', 'Airside', 'Lighting', 'Mech Fans'] as const).map(s => ({ text: s, value: s })),
              onFilter: (value, r: MeterRow) => r.system === value,
              render: (_, r: MeterRow) => <Tag color={SYSTEM_COLOR[r.system]}>{r.system}</Tag> },
            { title: 'Location', dataIndex: 'location', key: 'loc', width: 170 },
            { title: 'Power', key: 'kw', width: 110, sorter: (a: MeterRow, b: MeterRow) => a.kw - b.kw,
              render: (_, r: MeterRow) => `${r.kw.toFixed(1)} kW` },
            { title: 'Health', key: 'h', width: 100,
              filters: [{ text: 'Normal', value: 'ok' }, { text: 'Warning', value: 'warning' }, { text: 'Critical', value: 'critical' }],
              onFilter: (value, r: MeterRow) => r.health === value,
              render: (_, r: MeterRow) => r.health ? healthBadge(r.health) : <Text type="secondary" style={{ fontSize: 11 }}>N/A</Text> },
          ]}
        />
      </Card>
    </div>
  )

  // ── Demand Heatmap Tab ────────────────────────────────────────────────────
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

  const flatData: [number, number, number][] = []
  heatmapData.forEach((row, dayIdx) => row.forEach((val, hr) => flatData.push([hr, dayIdx, val])))
  const allVals = flatData.map(d => d[2])
  const minV = Math.min(...allVals)
  const maxV = Math.max(...allVals)

  const heatmapOpt = {
    tooltip: { formatter: (p: any) => `${DAYS[p.data[1]]} ${HOURS[p.data[0]]}: <b>${p.data[2]} kW</b>` },
    grid: { bottom: 60, top: 40, left: 60, right: 80 },
    xAxis: { type: 'category' as const, data: HOURS, splitArea: { show: true }, axisLabel: { interval: 1, fontSize: 10 } },
    yAxis: { type: 'category' as const, data: DAYS, splitArea: { show: true } },
    visualMap: {
      min: minV, max: maxV, calculable: true, orient: 'horizontal', left: 'center', bottom: 0,
      inRange: { color: ['#f0f2f5', 'rgba(90,0,87,0.3)', PURPLE] }, text: ['High', 'Low'], textStyle: { fontSize: 11 },
    },
    series: [{ name: 'Demand (kW)', type: 'heatmap' as const, data: flatData, label: { show: false } }],
  }

  const heatmapTab = (
    <Card title="Total Building Demand — Last 7 Days" extra={<span style={{ fontSize: 12, color: '#888' }}>Hour of day × Day of week</span>}>
      <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
        Airport demand shows two characteristic peaks: morning bank (07:00–10:00) and afternoon bank (14:00–18:00),
        with reduced weekend demand.
      </Paragraph>
      <ReactECharts option={heatmapOpt} theme={chartTheme} style={{ height: 360 }} />
    </Card>
  )

  const endUseBreakdownOpt = {
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c} kW ({d}%)' },
    legend: { show: false },
    series: [{
      type: 'pie' as const, radius: ['55%', '80%'], label: { show: false }, labelLine: { show: false },
      data: [
        { name: 'Chiller Plant', value: Math.round(chillerPlantKw), itemStyle: { color: PURPLE } },
        { name: 'Airside', value: Math.round(airsideKw), itemStyle: { color: '#9b59b6' } },
        { name: 'Lighting', value: Math.round(lightingKw), itemStyle: { color: '#65a30d' } },
        { name: 'Mech Fans', value: Math.round(mechFanKw), itemStyle: { color: '#3498db' } },
        { name: 'Other', value: Math.round(otherKw), itemStyle: { color: '#bbb' } },
      ],
    }],
  }

  const powerFlowTab = (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <PageHeroImage
            src="/assets/schematic_power_grid.webp"
            alt="Power grid distribution schematic"
            caption="Power distribution — grid incoming to end use"
            size="large"
          />
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Live End-Use Breakdown" size="small" style={{ height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <ReactECharts option={endUseBreakdownOpt} theme={chartTheme} style={{ width: 130, height: 130, flexShrink: 0 }} />
              <div style={{ marginLeft: 12 }}>
                <div style={{ fontSize: 11, color: undefined }}>Total Building Demand</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: undefined, marginBottom: 8 }}>{totalBuildingKw.toFixed(0)} kW</div>
                <div style={{ fontSize: 12 }}><span style={{ color: PURPLE }}>■</span> Chiller Plant {chillerPlantKw.toFixed(0)} kW</div>
                <div style={{ fontSize: 12 }}><span style={{ color: '#9b59b6' }}>■</span> Airside {airsideKw.toFixed(0)} kW</div>
                <div style={{ fontSize: 12 }}><span style={{ color: '#65a30d' }}>■</span> Lighting {lightingKw.toFixed(0)} kW</div>
                <div style={{ fontSize: 12 }}><span style={{ color: '#3498db' }}>■</span> Mech Fans {mechFanKw.toFixed(0)} kW</div>
                <div style={{ fontSize: 12 }}><span style={{ color: '#bbb' }}>■</span> Other {otherKw.toFixed(0)} kW</div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <Title level={3} style={{ color: undefined, marginBottom: 4 }}>Power &amp; Grid</Title>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        4 HV substations — demand, power factor, power quality (THD/harmonics) and sub-meter breakdown.
      </Paragraph>
      <Tabs
        defaultActiveKey="demand"
        items={[
          { key: 'demand',    label: 'Demand Profiles',        children: demandTab },
          { key: 'flow',      label: 'Power Flow',             children: powerFlowTab },
          { key: 'pf',        label: 'Power Factor',           children: pfTab },
          { key: 'pq',        label: 'Power Quality',          children: pqTab },
          { key: 'submeters', label: 'Sub-Meters',             children: subMetersTab },
          { key: 'heatmap',   label: 'Demand Heatmap',         children: heatmapTab },
          { key: 'alarms',    label: `Alarms (${allFindings.length})`, children: <FDDPanel findings={allFindings} systemLabel="Power & Grid" /> },
        ]}
      />
    </div>
  )
})

export default PowerGridPage
