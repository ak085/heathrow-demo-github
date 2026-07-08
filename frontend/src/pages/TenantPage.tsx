import React from 'react'
import { observer } from 'mobx-react-lite'
import { Card, Row, Col, Statistic, Table, Badge, Typography, Tabs, Tag } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useStore } from '../stores'
import { FDDPanel } from '../components/FDDPanel'
import { RangeBar, buildZones, zoneAt, ZONE_COLOR } from '../components/RangeBar'
import { Sparkline } from '../components/Sparkline'
import PageHeroImage from '../components/PageHeroImage'
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
  const store = useStore()
  const { tenant } = store
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

  // Anomaly % vs days since reading — do overdue manual meters carry the biggest anomalies?
  const anomalyVsDaysOpt = {
    tooltip: {
      trigger: 'item' as const,
      formatter: (p: any) => `${p.data[2]}<br/>${p.data[0]} days  |  ${p.data[1] >= 0 ? '+' : ''}${p.data[1].toFixed(0)}%`,
    },
    grid: { left: 55, right: 20, top: 16, bottom: 34 },
    xAxis: { type: 'value' as const, name: 'Days since reading', nameLocation: 'middle' as const, nameGap: 26 },
    yAxis: { type: 'value' as const, name: 'Anomaly %' },
    series: [{
      type: 'scatter' as const,
      symbolSize: 14,
      data: meters.filter(m => m.meteringType === 'manual').map(m => [m.daysSinceReading, Number(m.anomalyPct.toFixed(0)), m.name]),
      itemStyle: { color: (p: any) => ZONE_COLOR[zoneAt(ANOMALY_ZONES, p.data[1])] },
    }],
  }

  // Consumption by category — vertical column chart.
  const categoryConsumptionOpt = (() => {
    const cats = Array.from(new Set(meters.map(m => m.category)))
    const totals = cats.map(c => meters.filter(m => m.category === c).reduce((s, m) => s + m.consumptionKwh, 0))
    return {
      tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
      grid: { left: 60, right: 20, top: 34, bottom: 30 },
      xAxis: { type: 'category' as const, data: cats },
      yAxis: { type: 'value' as const, name: 'kWh/mo', nameGap: 14 },
      series: [{
        type: 'bar' as const,
        data: cats.map((c, i) => ({ value: Math.round(totals[i]), itemStyle: { color: CATEGORY_COLOR[c] } })),
        barWidth: '55%',
        label: { show: true, position: 'top' as const, fontSize: 10, formatter: (p: any) => p.value.toLocaleString() },
      }],
    }
  })()

  // Metering coverage — Category x Metering Type count matrix.
  const meteringTypesList: MeteringType[] = ['automated', 'manual', 'deemed']
  const categoriesList = Array.from(new Set(meters.map(m => m.category)))
  const coverageData: [number, number, number][] = []
  categoriesList.forEach((cat, ci) => {
    meteringTypesList.forEach((mt, mi) => {
      coverageData.push([mi, ci, meters.filter(m => m.category === cat && m.meteringType === mt).length])
    })
  })
  const coverageHeatmapOpt = {
    tooltip: {
      position: 'top' as const,
      formatter: (p: any) => `${categoriesList[p.data[1]]} — ${meteringTypesList[p.data[0]]}: ${p.data[2]} meter(s)`,
    },
    grid: { left: 80, right: 20, top: 10, bottom: 30 },
    xAxis: { type: 'category' as const, data: meteringTypesList, splitArea: { show: true } },
    yAxis: { type: 'category' as const, data: categoriesList, splitArea: { show: true } },
    visualMap: { min: 0, max: Math.max(...coverageData.map(d => d[2]), 1), show: false, inRange: { color: ['#f0f0f0', PURPLE] } },
    series: [{
      type: 'heatmap' as const,
      data: coverageData,
      label: { show: true, fontSize: 11, formatter: (p: any) => p.data[2] },
    }],
  }

  const overviewTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <PageHeroImage
            src="/assets/heathrow_tenant_billing_3d.png"
            alt="Tenant billing overview"
            caption="Tenant sub-metering & commercial billing overview"
          />
        </Col>
        <Col xs={24} lg={10}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%', textAlign: 'center', border: '1px solid rgba(90,0,87,0.35)' }}>
                <Statistic title="Sample Meters" value={meters.length} valueStyle={{ color: undefined, fontWeight: 700, fontSize: 24 }} />
                <div style={{ fontSize: 11, color: undefined, marginTop: 6 }}>of ~500 across the estate</div>
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%' }} bodyStyle={{ padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <ReactECharts option={meterTypeOpt} theme={chartTheme} style={{ width: 70, height: 70, flexShrink: 0 }} />
                  <div style={{ marginLeft: 8, fontSize: 11 }}>
                    <div><Badge status="success" /> Automated {automatedCount}</div>
                    <div><Badge color="#1677ff" /> Manual {manualCount}</div>
                    <div><Badge color="#bfbfbf" /> Deemed {deemedCount}</div>
                  </div>
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%', textAlign: 'center' }}>
                <Statistic title="Sample Anomaly Loss" value={`£${sampleAnnualLossGbp.toFixed(0)}`} suffix="/yr"
                  valueStyle={{ fontWeight: 700, fontSize: 20, color: '#cf1322' }} />
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%', textAlign: 'center' }}>
                <Statistic title="Extrapolated (Full Portfolio)" value={`£${(extrapolatedAnnualLossGbp / 1000).toFixed(0)}k`} suffix="/yr"
                  valueStyle={{ fontWeight: 700, fontSize: 20, color: '#cf1322' }} />
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          <strong>Scope, honestly stated:</strong> this platform doesn't do billing or settlement — the airport already has a
          supplier for that. What it can do is flag consumption anomalies against billed baselines, surface manual meters
          that are overdue for a reading, and identify deemed/unmetered areas as candidates for real sub-metering.
          The extrapolated figure above is this sample's detectable anomaly rate scaled to ~500 meters — a contributor
          to, not the whole of, the consultant's quoted £4-5m/year commercial loss (which also includes billing/
          settlement process inefficiencies outside this platform's scope).
        </Text>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Top Anomalies by Estimated Annual Loss" size="small" style={{ height: '100%' }}>
            <ReactECharts option={anomalyCompareOpt} theme={chartTheme} style={{ height: 40 + topAnomalies.length * 32 }} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Anomaly % vs Days Since Reading (Manual Meters)" size="small" style={{ height: '100%' }}>
            <ReactECharts option={anomalyVsDaysOpt} theme={chartTheme} style={{ height: 40 + topAnomalies.length * 32 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Consumption by Category" size="small" style={{ height: '100%' }}>
            <ReactECharts option={categoryConsumptionOpt} theme={chartTheme} style={{ height: 260 }} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Metering Coverage by Category" size="small" style={{ height: '100%' }}>
            <ReactECharts option={coverageHeatmapOpt} theme={chartTheme} style={{ height: 260 }} />
          </Card>
        </Col>
      </Row>

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
            { title: 'Category', key: 'cat', width: 100,
              filters: (Object.keys(CATEGORY_COLOR) as TenantCategory[]).map(c => ({ text: c, value: c })),
              onFilter: (value, m: TenantMeter) => m.category === value,
              render: (_, m: TenantMeter) => <Tag color={CATEGORY_COLOR[m.category]}>{m.category}</Tag> },
            { title: 'Metering', key: 'mt', width: 110,
              filters: (Object.keys(METER_TYPE_COLOR) as MeteringType[]).map(t => ({ text: t, value: t })),
              onFilter: (value, m: TenantMeter) => m.meteringType === value,
              render: (_, m: TenantMeter) => <Tag color={METER_TYPE_COLOR[m.meteringType]}>{m.meteringType}</Tag> },
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
            { title: 'Health', key: 'h', width: 100,
              filters: [{ text: 'Normal', value: 'ok' }, { text: 'Warning', value: 'warning' }, { text: 'Critical', value: 'critical' }],
              onFilter: (value, m: TenantMeter) => m.health === value,
              render: (_, m: TenantMeter) => healthTag(m.health) },
          ]}
        />
      </Card>
    </div>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <Title level={3} style={{ color: undefined, marginBottom: 4 }}>Tenant Billing &amp; Commercial Loss</Title>
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
