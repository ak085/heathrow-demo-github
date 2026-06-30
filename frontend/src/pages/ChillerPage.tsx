import React from 'react'
import { observer } from 'mobx-react-lite'
import { Tabs, Card, Row, Col, Statistic, Table, Tag, Badge, Typography } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useStore } from '../stores'
import { FDDPanel } from '../components/FDDPanel'
import type { Chiller } from '../stores/ChillerStore'

const { Title, Paragraph } = Typography
const PURPLE = '#5a0057'
const COLORS  = [PURPLE, '#9b59b6', '#e74c3c']

function healthTag(h: 'ok' | 'warning' | 'critical') {
  return h === 'critical' ? <Badge status="error"   text="Critical" />
       : h === 'warning'  ? <Badge status="warning" text="Warning" />
       :                    <Badge status="success" text="Normal" />
}

const TIMES = Array.from({ length: 288 }, (_, i) => {
  const h = Math.floor(i * 24 / 288)
  const m = Math.round((i * 24 / 288 - h) * 60)
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
})

const ChillerPage: React.FC = observer(() => {
  const { chiller } = useStore()
  const { chillers, chillerPlantKw, avgCOP, avgCHWST, avgCWST, airsideKw, mechFanKw, allFindings } = chiller

  // ── Overview Tab ────────────────────────────────────────────────────────
  const overviewTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center', background: 'rgba(90,0,87,0.05)', border: `1px solid rgba(90,0,87,0.2)` }}>
            <Statistic title="Total Plant kW" value={chillerPlantKw.toFixed(0)} suffix="kW"
              valueStyle={{ color: PURPLE, fontWeight: 700, fontSize: 26 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center' }}>
            <Statistic title="Average COP" value={avgCOP.toFixed(2)}
              valueStyle={{ color: avgCOP < 3.8 ? '#cf1322' : '#52c41a', fontWeight: 700, fontSize: 26 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center' }}>
            <Statistic title="CHW Supply Temp" value={avgCHWST.toFixed(1)} suffix="°C"
              valueStyle={{ fontWeight: 700, fontSize: 26 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center' }}>
            <Statistic title="CW Supply Temp" value={avgCWST.toFixed(1)} suffix="°C"
              valueStyle={{ fontWeight: 700, fontSize: 26 }} />
          </Card>
        </Col>
      </Row>

      <Card title="Chiller Status" style={{ marginBottom: 16 }}>
        <Table
          dataSource={chillers}
          rowKey="id"
          pagination={false}
          size="small"
          columns={[
            { title: 'Chiller', dataIndex: 'name', key: 'name', render: (v, r) => <strong>{v}</strong> },
            { title: 'Location', dataIndex: 'location', key: 'loc' },
            { title: 'kW', key: 'kw', render: (_, r: Chiller) => r.kw.toFixed(0) },
            { title: 'COP', key: 'cop', render: (_, r: Chiller) =>
              <span style={{ color: r.cop < 3.8 ? '#cf1322' : '#389e0d', fontWeight: 600 }}>{r.cop.toFixed(2)}</span> },
            { title: 'Load %', key: 'load', render: (_, r: Chiller) => `${r.load.toFixed(0)}%` },
            { title: 'CHW ΔT', key: 'chwdt', render: (_, r: Chiller) => `${(r.chwRT - r.chwST).toFixed(1)}°C` },
            { title: 'CW Supply', key: 'cwst', render: (_, r: Chiller) => `${r.cwST.toFixed(1)}°C` },
            { title: 'Run Hours', key: 'rh', render: (_, r: Chiller) => r.runHours.toLocaleString() },
            { title: 'Health', key: 'h', render: (_, r: Chiller) => healthTag(r.health) },
          ]}
        />
      </Card>

      <Card title="Cooling Tower Fan Speeds">
        <Row gutter={[16, 16]}>
          {chillers.map(c => (
            <Col key={c.id} xs={24} sm={8}>
              <Card size="small" style={{ textAlign: 'center', background: '#fafafa' }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{c.name}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: PURPLE }}>{c.fanSpeed.toFixed(0)}%</div>
                <div style={{ fontSize: 11, color: '#aaa' }}>CT Fan Speed</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Pump: <strong>{c.pumpSpeed.toFixed(0)}%</strong></div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  )

  // ── Details Tab ─────────────────────────────────────────────────────────
  const copChartOpt = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: chillers.map(c => c.name), bottom: 0 },
    grid: { bottom: 40 },
    xAxis: { type: 'category' as const, data: TIMES, axisLabel: {
      interval: 47,
      formatter: (v: string) => v,
    }},
    yAxis: { type: 'value' as const, name: 'COP', min: 3, max: 6.5 },
    series: chillers.map((c, i) => ({
      name: c.name, type: 'line' as const, smooth: true,
      data: c.copHistory, lineStyle: { color: COLORS[i] }, itemStyle: { color: COLORS[i] },
      showSymbol: false,
    })),
  }

  const kwChartOpt = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: chillers.map(c => c.name), bottom: 0 },
    grid: { bottom: 40 },
    xAxis: { type: 'category' as const, data: TIMES, axisLabel: { interval: 47 } },
    yAxis: { type: 'value' as const, name: 'kW' },
    series: chillers.map((c, i) => ({
      name: c.name, type: 'line' as const, smooth: true,
      data: c.kwHistory, lineStyle: { color: COLORS[i] }, itemStyle: { color: COLORS[i] },
      showSymbol: false,
    })),
  }

  const detailsTab = (
    <div>
      <Card title="24h COP History" style={{ marginBottom: 16 }}>
        <ReactECharts option={copChartOpt} style={{ height: 300 }} />
      </Card>
      <Card title="24h Plant kW History">
        <ReactECharts option={kwChartOpt} style={{ height: 300 }} />
      </Card>
    </div>
  )

  // ── AI Setpoints Tab ─────────────────────────────────────────────────────
  const setpointsTab = (
    <div>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        The AI adjusts CHW and CW setpoints every 5 min based on load, outdoor conditions and historical efficiency data.
        Setpoints shown in <Tag color="blue">blue</Tag>.
      </Paragraph>
      <Row gutter={[16, 16]}>
        {chillers.map(c => (
          <Col key={c.id} xs={24} md={8}>
            <Card title={`${c.name} — ${c.location}`} style={{ background: '#fafafa' }}>
              <Row gutter={[12, 12]}>
                <Col span={12}>
                  <Card size="small" style={{ textAlign: 'center', background: '#e6f4ff', border: '1px solid #91caff' }}>
                    <div style={{ fontSize: 11, color: '#1677ff', marginBottom: 4 }}>CHW Setpoint (AI)</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#1677ff' }}>{c.chwSP.toFixed(1)}°C</div>
                  </Card>
                </Col>
                <Col span={12}>
                  <Card size="small" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>CHW Actual</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{c.chwST.toFixed(1)}°C</div>
                  </Card>
                </Col>
                <Col span={12}>
                  <Card size="small" style={{ textAlign: 'center', background: '#e6f4ff', border: '1px solid #91caff' }}>
                    <div style={{ fontSize: 11, color: '#1677ff', marginBottom: 4 }}>CW Setpoint (AI)</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#1677ff' }}>{c.cwSP.toFixed(1)}°C</div>
                  </Card>
                </Col>
                <Col span={12}>
                  <Card size="small" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>CW Actual</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{c.cwST.toFixed(1)}°C</div>
                  </Card>
                </Col>
              </Row>
              <div style={{ marginTop: 10, fontSize: 12, color: '#888' }}>
                COP: <strong>{c.cop.toFixed(2)}</strong> &nbsp;|&nbsp;
                Load: <strong>{c.load.toFixed(0)}%</strong>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )

  // ── Sub-meters quick cards ───────────────────────────────────────────────
  const subMeterCards = (
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
      <Col xs={8}><Card size="small" style={{ textAlign: 'center', background: 'rgba(90,0,87,0.05)' }}>
        <div style={{ fontSize: 11, color: '#888' }}>Chiller Plant</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: PURPLE }}>{chillerPlantKw.toFixed(0)} kW</div>
      </Card></Col>
      <Col xs={8}><Card size="small" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#888' }}>Airside (AHU)</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{airsideKw.toFixed(0)} kW</div>
      </Card></Col>
      <Col xs={8}><Card size="small" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#888' }}>Mech Fans</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{mechFanKw.toFixed(0)} kW</div>
      </Card></Col>
    </Row>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <Title level={3} style={{ color: PURPLE, marginBottom: 4 }}>Chiller Plant</Title>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        3 water-cooled chillers — T2 &amp; T3 plant rooms. AI setpoints every 5 min.
      </Paragraph>
      {subMeterCards}
      <Tabs
        defaultActiveKey="overview"
        items={[
          { key: 'overview',   label: 'Overview',      children: overviewTab },
          { key: 'details',    label: 'Details',        children: detailsTab },
          { key: 'setpoints',  label: 'AI Setpoints',   children: setpointsTab },
          { key: 'alarms',     label: `Alarms (${allFindings.length})`, children: <FDDPanel findings={allFindings} systemLabel="Chiller Plant" /> },
        ]}
      />
    </div>
  )
})

export default ChillerPage
