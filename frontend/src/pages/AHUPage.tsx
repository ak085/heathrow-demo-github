import React from 'react'
import { observer } from 'mobx-react-lite'
import { Tabs, Card, Row, Col, Statistic, Table, Badge, Tag, Typography } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useStore } from '../stores'
import { FDDPanel } from '../components/FDDPanel'
import type { AHU } from '../stores/AHUStore'

const { Title, Paragraph } = Typography
const PURPLE = '#5a0057'
const COLORS = [PURPLE, '#9b59b6', '#e74c3c', '#e67e22', '#2ecc71', '#3498db']

function healthBadge(h: 'ok' | 'warning' | 'critical') {
  return h === 'critical' ? <Badge status="error"   text="Critical" />
       : h === 'warning'  ? <Badge status="warning" text="Warning" />
       :                    <Badge status="success" text="Normal" />
}

const TIMES = Array.from({ length: 288 }, (_, i) => {
  const h = Math.floor(i * 24 / 288)
  const m = Math.round((i * 24 / 288 - h) * 60)
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
})

const AHUPage: React.FC = observer(() => {
  const { ahu } = useStore()
  const { ahus, avgSAT, avgZoneT, normalCount, filterAlerts, allFindings } = ahu

  // ── Overview ─────────────────────────────────────────────────────────────
  const overviewTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center', background: 'rgba(90,0,87,0.05)', border: `1px solid rgba(90,0,87,0.2)` }}>
            <Statistic title="Normal Operation" value={normalCount} suffix={`/ ${ahus.length}`}
              valueStyle={{ color: PURPLE, fontWeight: 700, fontSize: 26 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center' }}>
            <Statistic title="Avg Supply Air Temp" value={avgSAT.toFixed(1)} suffix="°C"
              valueStyle={{ fontWeight: 700, fontSize: 26 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center' }}>
            <Statistic title="Avg Zone Temp" value={avgZoneT.toFixed(1)} suffix="°C"
              valueStyle={{ fontWeight: 700, fontSize: 26 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center' }}>
            <Statistic title="Filter DP Alerts" value={filterAlerts}
              valueStyle={{ color: filterAlerts > 0 ? '#d48806' : '#52c41a', fontWeight: 700, fontSize: 26 }} />
          </Card>
        </Col>
      </Row>

      <Card title="AHU Status Table">
        <Table
          dataSource={ahus}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: true }}
          columns={[
            { title: 'AHU', dataIndex: 'name', key: 'name', render: v => <strong>{v}</strong>, fixed: 'left' },
            { title: 'Zone', dataIndex: 'zone', key: 'zone' },
            { title: 'SAT (Actual)', key: 'sat', render: (_, r: AHU) =>
              <span style={{ color: Math.abs(r.sat - r.satSP) > 2 ? '#cf1322' : undefined }}>
                {r.sat.toFixed(1)}°C
              </span> },
            { title: 'SAT SP', key: 'satsp', render: (_, r: AHU) =>
              <Tag color="blue" style={{ fontSize: 11 }}>{r.satSP.toFixed(1)}°C</Tag> },
            { title: 'Fan %', key: 'fan', render: (_, r: AHU) => `${r.fanSpeed.toFixed(0)}%` },
            { title: 'CHW Valve', key: 'chw', render: (_, r: AHU) => `${r.chwValve.toFixed(0)}%` },
            { title: 'Zone °C', key: 'zone', render: (_, r: AHU) => `${r.zoneTemp.toFixed(1)}°C` },
            { title: 'CO₂', key: 'co2', render: (_, r: AHU) =>
              <span style={{ color: r.co2 > 1000 ? '#cf1322' : r.co2 > 800 ? '#d48806' : undefined }}>
                {r.co2.toFixed(0)} ppm
              </span> },
            { title: 'Filter DP', key: 'dp', render: (_, r: AHU) =>
              <span style={{ color: r.filterDP > 200 ? '#d48806' : undefined }}>
                {r.filterDP.toFixed(0)} Pa
              </span> },
            { title: 'HVLS', key: 'hvls', render: (_, r: AHU) =>
              <Tag color={r.hlvsOn ? 'success' : 'default'}>{r.hlvsOn ? 'On' : 'Off'}</Tag> },
            { title: 'Health', key: 'h', render: (_, r: AHU) => healthBadge(r.health) },
          ]}
        />
      </Card>
    </div>
  )

  // ── CO2 Tab ───────────────────────────────────────────────────────────────
  const co2Opt = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ahus.map(a => a.name), bottom: 0 },
    grid: { bottom: 50 },
    xAxis: { type: 'category' as const, data: TIMES, axisLabel: { interval: 47 } },
    yAxis: { type: 'value' as const, name: 'CO₂ (ppm)', min: 350,
      markLine: { data: [{ yAxis: 1000, name: '1000 ppm', lineStyle: { color: '#cf1322', type: 'dashed' } }] },
    },
    series: ahus.map((a, i) => ({
      name: a.name, type: 'line' as const, smooth: true,
      data: a.co2History, lineStyle: { color: COLORS[i] }, itemStyle: { color: COLORS[i] },
      showSymbol: false,
    })),
  }

  const freshAirOpt = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ahus.map(a => a.name), bottom: 0 },
    grid: { bottom: 50 },
    xAxis: { type: 'category' as const, data: TIMES, axisLabel: { interval: 47 } },
    yAxis: { type: 'value' as const, name: 'Fresh Air Fan %', min: 0, max: 110 },
    series: ahus.map((a, i) => ({
      name: a.name, type: 'line' as const, smooth: true,
      data: a.freshAirHistory, lineStyle: { color: COLORS[i] }, itemStyle: { color: COLORS[i] },
      showSymbol: false,
    })),
  }

  const co2Tab = (
    <div>
      <Card title="CO₂ ppm — All AHUs (24h)" style={{ marginBottom: 16 }}>
        <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
          Fresh air damper ramps up as CO₂ rises. 1000 ppm threshold shown in red.
        </Paragraph>
        <ReactECharts option={co2Opt} style={{ height: 300 }} />
      </Card>
      <Card title="Fresh Air Fan Speed % — All AHUs (24h)">
        <ReactECharts option={freshAirOpt} style={{ height: 280 }} />
      </Card>
    </div>
  )

  // ── AI Setpoints Tab ──────────────────────────────────────────────────────
  const setpointsTab = (
    <div>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        SAT setpoint is adjusted to balance cooling load vs zone comfort.
        Fan setpoint tracks CO₂ to minimise fresh air energy while maintaining IAQ.
        Setpoints shown in <Tag color="blue">blue</Tag>.
      </Paragraph>
      <Row gutter={[12, 12]}>
        {ahus.map(a => (
          <Col key={a.id} xs={24} sm={12} md={8}>
            <Card size="small" title={<span style={{ fontSize: 13 }}>{a.name}</span>}
              extra={<span style={{ fontSize: 11, color: '#888' }}>{a.zone}</span>}
              style={{ background: '#fafafa' }}>
              <Row gutter={[8, 8]}>
                <Col span={12}>
                  <div style={{ padding: '8px 10px', background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 6, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#1677ff' }}>SAT SP (AI)</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#1677ff' }}>{a.satSP.toFixed(1)}°C</div>
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ padding: '8px 10px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: 6, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#888' }}>SAT Actual</div>
                    <div style={{ fontSize: 18, fontWeight: 700,
                      color: Math.abs(a.sat - a.satSP) > 2 ? '#cf1322' : undefined }}>
                      {a.sat.toFixed(1)}°C
                    </div>
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ padding: '8px 10px', background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 6, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#1677ff' }}>Fan SP (AI)</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#1677ff' }}>{a.fanSP.toFixed(0)}%</div>
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ padding: '8px 10px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: 6, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#888' }}>Fan Actual</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{a.fanSpeed.toFixed(0)}%</div>
                  </div>
                </Col>
              </Row>
              <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
                CO₂: <strong style={{ color: a.co2 > 1000 ? '#cf1322' : a.co2 > 800 ? '#d48806' : '#389e0d' }}>
                  {a.co2.toFixed(0)} ppm
                </strong> &nbsp;|&nbsp; Zone: <strong>{a.zoneTemp.toFixed(1)}°C</strong>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <Title level={3} style={{ color: PURPLE, marginBottom: 4 }}>Air Handling Units</Title>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        6 AHUs across T1 / T2 / T3 / T5. AI-controlled supply air temp and ventilation rates.
      </Paragraph>
      <Tabs
        defaultActiveKey="overview"
        items={[
          { key: 'overview',   label: 'Overview',              children: overviewTab },
          { key: 'co2',        label: 'CO₂ & Ventilation',     children: co2Tab },
          { key: 'setpoints',  label: 'AI Setpoints',          children: setpointsTab },
          { key: 'alarms',     label: `Alarms (${allFindings.length})`, children: <FDDPanel findings={allFindings} systemLabel="AHUs" /> },
        ]}
      />
    </div>
  )
})

export default AHUPage
