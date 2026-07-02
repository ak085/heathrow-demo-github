import React from 'react'
import { observer } from 'mobx-react-lite'
import { Card, Row, Col, Statistic, Table, Badge, Typography, Tabs, Tag } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useStore } from '../stores'
import { FDDPanel } from '../components/FDDPanel'
import { RangeBar, buildZones, zoneAt, ZONE_COLOR } from '../components/RangeBar'
import { Sparkline } from '../components/Sparkline'
import { useEchartsTheme } from '../theme/echartsTheme'
import type { TenantMeter, TenantCategory, MeteringType } from '../stores/TenantStore'

const { Title, Paragraph, Text } = Typography
const PURPLE = '#5a0057'
const CATEGORY_COLOR: Record<TenantCategory, string> = {
  Retail: '#1677ff', 'F&B': '#e74c3c', Cargo: '#faad14', Office: '#13a8a8',
}
const METER_TYPE_COLOR: Record<MeteringType, string> = {
  automated: 'success', manual: 'blue', deemed: 'default',
}

const ANOMALY_ZONES = buildZones({ min: -50, max: 50, critLow: -40, warnLow: -20, warnHigh: 20, critHigh: 40 })
const DAYS_ZONES = buildZones({ min: 0, max: 120, warnHigh: 60, critHigh: 90 })

function healthTag(h: 'ok' | 'warning' | 'critical') {
  return h === 'critical' ? <Badge status="error" text="Critical" />
       : h === 'warning'  ? <Badge status="warning" text="Warning" />
       :                    <Badge status="success" text="Normal" />
}

const TenantPage: React.FC = observer(() => {
  const { tenant } = useStore()
  const { meters, automatedCount, manualCount, deemedCount, sampleAnnualLossGbp, extrapolatedAnnualLossGbp, allFindings } = tenant
  const chartTheme = useEchartsTheme()

  const meterTypeOpt = {
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie' as const, radius: ['55%', '80%'],
      label: { show: false }, labelLine: { show: false },
      data: [
        { name: 'Automated', value: automatedCount, itemStyle: { color: '#52c41a' } },
        { name: 'Manual', value: manualCount, itemStyle: { color: '#1677ff' } },
        { name: 'Deemed', value: deemedCount, itemStyle: { color: '#bfbfbf' } },
      ],
    }],
  }

  const topAnomalies = [...meters]
    .map(m => ({ ...m, lossGbp: Math.max(0, m.consumptionKwh - m.baselineKwh) * 12 * 0.25 }))
    .sort((a, b) => b.lossGbp - a.lossGbp)
    .slice(0, 8)

  const anomalyCompareOpt = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 160, right: 60, top: 10, bottom: 20 },
    xAxis: { type: 'value' as const, name: '£/year' },
    yAxis: { type: 'category' as const, data: topAnomalies.map(m => m.name), inverse: true },
    series: [{
      type: 'bar' as const, data: topAnomalies.map(m => ({
        value: Math.round(m.lossGbp), itemStyle: { color: ZONE_COLOR[zoneAt(ANOMALY_ZONES, m.anomalyPct)] },
      })),
      barWidth: 14, label: { show: true, position: 'right' as const, formatter: '£{c}' },
    }],
  }

  const overviewTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={5}>
          <Card style={{ height: '100%', textAlign: 'center', background: 'rgba(90,0,87,0.05)', border: '1px solid rgba(90,0,87,0.2)' }}>
            <Statistic title="Sample Meters" value={meters.length} valueStyle={{ color: PURPLE, fontWeight: 700, fontSize: 26 }} />
            <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 8 }}>of ~500 across the estate</div>
          </Card>
        </Col>
        <Col xs={24} md={7}>
          <Card style={{ height: '100%' }} bodyStyle={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <ReactECharts option={meterTypeOpt} theme={chartTheme} style={{ width: 100, height: 100, flexShrink: 0 }} />
              <div style={{ marginLeft: 8, fontSize: 11 }}>
                <div><Badge status="success" /> Automated {automatedCount}</div>
                <div><Badge color="#1677ff" /> Manual {manualCount}</div>
                <div><Badge color="#bfbfbf" /> Deemed {deemedCount}</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card style={{ height: '100%', textAlign: 'center' }}>
            <Statistic title="Sample Anomaly Loss" value={`£${sampleAnnualLossGbp.toFixed(0)}`} suffix="/yr"
              valueStyle={{ fontWeight: 700, fontSize: 22, color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card style={{ height: '100%', textAlign: 'center', background: '#fff1f0' }}>
            <Statistic title="Extrapolated — Full Portfolio" value={`£${(extrapolatedAnnualLossGbp / 1000).toFixed(0)}k`} suffix="/yr"
              valueStyle={{ fontWeight: 700, fontSize: 22, color: '#cf1322' }} />
            <div style={{ fontSize: 10, color: '#8c8c8c', marginTop: 4 }}>illustrative — see note below</div>
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          <strong>Scope, honestly stated:</strong> this platform doesn't do billing or settlement — Heathrow already has a
          supplier for that. What it can do is flag consumption anomalies against billed baselines, surface manual meters
          that are overdue for a reading, and identify deemed/unmetered areas as candidates for real sub-metering.
          The extrapolated figure above is this sample's detectable anomaly rate scaled to ~500 meters — a contributor
          to, not the whole of, the consultant's quoted £4-5m/year commercial loss (which also includes billing/
          settlement process inefficiencies outside this platform's scope).
        </Text>
      </Card>

      <Card title="Top Anomalies by Estimated Annual Loss" size="small" style={{ marginBottom: 16 }}>
        <ReactECharts option={anomalyCompareOpt} theme={chartTheme} style={{ height: 40 + topAnomalies.length * 32 }} />
      </Card>

      <Card title="Tenant Meters" size="small">
        <Table
          dataSource={meters}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 1150 }}
          columns={[
            { title: 'Tenant', dataIndex: 'name', key: 'name', fixed: 'left', width: 190, render: (v) => <strong>{v}</strong> },
            { title: 'Zone', dataIndex: 'zone', key: 'zone', width: 150 },
            { title: 'Category', key: 'cat', width: 100, render: (_, m: TenantMeter) =>
              <Tag color={CATEGORY_COLOR[m.category]}>{m.category}</Tag> },
            { title: 'Metering', key: 'mt', width: 110, render: (_, m: TenantMeter) =>
              <Tag color={METER_TYPE_COLOR[m.meteringType]}>{m.meteringType}</Tag> },
            { title: 'Consumption', key: 'kwh', width: 170, render: (_, m: TenantMeter) =>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{m.consumptionKwh.toFixed(0)} kWh/mo</span><Sparkline data={m.history} color={PURPLE} width={60} height={22} />
              </div> },
            { title: 'vs Baseline', key: 'anomaly', width: 150, render: (_, m: TenantMeter) =>
              <RangeBar label="" value={m.anomalyPct} unit="%" min={-50} max={50} zones={ANOMALY_ZONES} precision={0} bare barWidth={70} /> },
            { title: 'Days Since Reading', key: 'dsr', width: 160, render: (_, m: TenantMeter) =>
              m.meteringType === 'manual'
                ? <RangeBar label="" value={m.daysSinceReading} min={0} max={120} zones={DAYS_ZONES} precision={0} bare barWidth={70} />
                : <Text type="secondary" style={{ fontSize: 11 }}>{m.meteringType === 'automated' ? 'Live' : 'N/A (deemed)'}</Text> },
            { title: 'Health', key: 'h', width: 100, render: (_, m: TenantMeter) => healthTag(m.health) },
          ]}
        />
      </Card>
    </div>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <Title level={3} style={{ color: PURPLE, marginBottom: 4 }}>Tenant Billing &amp; Commercial Loss</Title>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        20-meter representative sample — anomaly detection against billed baselines, not a billing system.
      </Paragraph>
      <Tabs
        defaultActiveKey="overview"
        items={[
          { key: 'overview', label: 'Overview', children: overviewTab },
          { key: 'alarms', label: `Alarms (${allFindings.length})`, children: <FDDPanel findings={allFindings} systemLabel="Tenant Billing" /> },
        ]}
      />
    </div>
  )
})

export default TenantPage
