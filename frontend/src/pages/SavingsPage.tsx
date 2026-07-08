import React, { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { useNavigate } from 'react-router-dom'
import { Tabs, Card, Row, Col, Statistic, Button, Typography } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useStore } from '../stores'
import { Gauge } from '../components/Gauge'
import { Sparkline } from '../components/Sparkline'
import { RangeBar, buildZones } from '../components/RangeBar'
import { useEchartsTheme } from '../theme/echartsTheme'
import PageHeroImage from '../components/PageHeroImage'
import { FlashValue } from '../components/FlashValue'
import type { Finding } from '../types/fdd'

const { Title, Paragraph } = Typography
const PURPLE  = '#5a0057'
const BASELINE_COLOR = '#aaa'
const ACTUAL_COLOR   = '#52c41a'
const COP_ZONES = buildZones({ min: 3, max: 6.2, critLow: 3.5, warnLow: 4.0 })
const SAVINGS_PCT_ZONES = buildZones({ min: 0, max: 30, warnLow: 8, critLow: 3 })

const SavingsPage: React.FC = observer(() => {
  const store = useStore()
  const { savings, chiller, ahu, power, solar, tenant, lighting } = store
  const navigate = useNavigate()
  const chartTheme = useEchartsTheme()

  // Aggregate FDD findings across all systems
  const allFindings: Finding[] = [
    ...chiller.allFindings,
    ...ahu.allFindings,
    ...power.allFindings,
    ...solar.allFindings,
    ...tenant.allFindings,
    ...lighting.allFindings,
  ]
  const openCount    = allFindings.length
  const critCount    = allFindings.filter(f => f.severity === 'critical').length
  const warnCount    = allFindings.filter(f => f.severity === 'warning').length

  // Keep savings store FDD summary in sync
  useEffect(() => {
    savings.updateFDD(openCount, critCount)
  })

  const {
    savingsPct, savingsKwhToday,
    savingsGbpToday, copBaseline, copActual, copImprovement,
    annualisedGbp, weeklyBarData, fddSummary,
  } = savings

  // ── AI Impact Tab ─────────────────────────────────────────────────────────
  const weeklyOpt = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['Baseline kWh', 'Actual kWh'], bottom: 0 },
    grid: { bottom: 50, top: 20 },
    xAxis: { type: 'category' as const, data: weeklyBarData.map(d => d.day) },
    yAxis: { type: 'value' as const, name: 'kWh', min: 10000 },
    series: [
      {
        name: 'Baseline kWh', type: 'bar' as const, barGap: '10%', barCategoryGap: '30%',
        data: weeklyBarData.map(d => ({ value: Math.round(d.baseline), itemStyle: { color: BASELINE_COLOR } })),
        label: { show: false },
      },
      {
        name: 'Actual kWh', type: 'bar' as const,
        data: weeklyBarData.map(d => ({ value: Math.round(d.actual), itemStyle: { color: ACTUAL_COLOR } })),
        label: { show: true, position: 'top' as const, fontSize: 10,
          formatter: (p: any) => `${p.value.toLocaleString()}` },
      },
    ],
  }

  // Savings by system — real figures from two different stores, not a fabricated split.
  const savingsBySystemOpt = {
    tooltip: { trigger: 'item' as const, formatter: '{b}: £{c} ({d}%)' },
    legend: { show: false },
    series: [{
      type: 'pie' as const, radius: ['55%', '80%'], label: { show: false }, labelLine: { show: false },
      data: [
        { name: 'HVAC / Plant', value: Math.round(savingsGbpToday), itemStyle: { color: PURPLE } },
        { name: 'Lighting', value: Math.round(lighting.totalSavingsGbpToday), itemStyle: { color: '#faad14' } },
      ],
    }],
  }

  // Daily savings % across the week — derived from the same baseline/actual data as the bar chart.
  const dailySavingsPctOpt = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category' as const, data: weeklyBarData.map(d => d.day) },
    yAxis: { type: 'value' as const, name: '%' },
    series: [{
      type: 'bar' as const,
      data: weeklyBarData.map(d => ({
        value: Number((((d.baseline - d.actual) / d.baseline) * 100).toFixed(1)),
        itemStyle: { color: '#52c41a' },
      })),
      barWidth: '55%',
      label: { show: true, position: 'top' as const, fontSize: 10, formatter: '{c}%' },
    }],
  }

  const impactTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <PageHeroImage
            src="/assets/airport_energy_saving_page.png"
            alt="Energy savings overview"
            caption="AI-driven energy savings — terminal overview"
          />
        </Col>
        <Col xs={24} lg={10}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%' }} bodyStyle={{ padding: 8 }}>
                <Gauge label="Saving %" value={savingsPct} min={0} max={30} zones={SAVINGS_PCT_ZONES} unit="%" precision={1} height={140} />
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%', textAlign: 'center', border: '1px solid rgba(22,163,74,0.35)' }} bodyStyle={{ padding: 12 }}>
                <div style={{ fontSize: 12, color: '#8c8c8c' }}>Estimated Saving Today</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}><FlashValue value={savingsGbpToday}>£{savingsGbpToday.toFixed(0)}</FlashValue></div>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                  <Sparkline data={weeklyBarData.map(d => d.baseline - d.actual)} color="#16a34a" />
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%', textAlign: 'center' }}>
                <Statistic title="kWh Saved Today" value={Math.round(savingsKwhToday).toLocaleString()} suffix="kWh"
                  valueStyle={{ color: '#16a34a', fontWeight: 700, fontSize: 22 }} />
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card style={{ height: '100%', textAlign: 'center' }}>
                <Statistic title="Annualised Projection" value={`£${Math.round(annualisedGbp / 1000)}k`}
                  valueStyle={{ color: '#d97706', fontWeight: 700, fontSize: 22 }} />
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Savings by System" size="small" style={{ height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ReactECharts option={savingsBySystemOpt} theme={chartTheme} style={{ width: 140, height: 140, flexShrink: 0 }} />
              <div style={{ marginLeft: 16, fontSize: 13 }}>
                <div style={{ marginBottom: 6 }}><span style={{ color: PURPLE }}>■</span> HVAC / Plant £{savingsGbpToday.toFixed(0)}</div>
                <div><span style={{ color: '#faad14' }}>■</span> Lighting £{lighting.totalSavingsGbpToday.toFixed(0)}</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Daily Savings % (This Week)" size="small" style={{ height: '100%' }}>
            <ReactECharts option={dailySavingsPctOpt} theme={chartTheme} style={{ height: 260 }} />
          </Card>
        </Col>
      </Row>

      {/* COP improvement + savings rate */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Card title="COP Improvement">
            <Row gutter={[16, 0]} align="middle">
              <Col span={10}>
                <Card size="small" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Before AI</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#888' }}>
                    {copBaseline.toFixed(1)}
                  </div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>COP baseline</div>
                </Card>
              </Col>
              <Col span={14}>
                <Gauge label="Live Plant COP" value={copActual} min={3} max={6.2} zones={COP_ZONES} height={150} />
                <div style={{ textAlign: 'center', fontSize: 12, color: '#389e0d', fontWeight: 600 }}>
                  +{copImprovement.toFixed(1)}% vs baseline
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card title="7-Day Energy — Baseline vs Actual" style={{ height: '100%' }}>
            <ReactECharts option={weeklyOpt} theme={chartTheme} style={{ height: 150 }} />
            <RangeBar label="Today's Saving Rate" value={savingsPct} unit="%" min={0} max={30} zones={SAVINGS_PCT_ZONES} precision={1} compact />
          </Card>
        </Col>
      </Row>
    </div>
  )

  const schematicTab = (
    <div>
      <PageHeroImage
        src="/assets/schematic_energy_savings.png"
        alt="Energy savings schematic"
        caption="Energy savings — baseline vs. AI-optimised schematic"
        size="large"
      />
    </div>
  )

  // ── FDD Summary Tab ───────────────────────────────────────────────────────
  const fddSeverityOpt = {
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c}' },
    series: [{
      type: 'pie' as const, radius: ['62%', '85%'],
      label: { show: true, position: 'center' as const, formatter: `${openCount}`, fontSize: 24, fontWeight: 700 },
      labelLine: { show: false },
      data: [
        { name: 'Critical', value: critCount, itemStyle: { color: '#ff4d4f' } },
        { name: 'Warning', value: warnCount, itemStyle: { color: '#faad14' } },
        { name: 'Info', value: Math.max(0, openCount - critCount - warnCount), itemStyle: { color: '#1677ff' } },
      ],
    }],
  }

  function fddGroupFor(ruleId: string): string {
    if (ruleId.startsWith('CHI') || ruleId.startsWith('PLANT')) return 'Chiller Plant'
    if (ruleId.startsWith('AHU')) return 'AHUs'
    if (ruleId.startsWith('PWR')) return 'Power & Grid'
    if (ruleId.startsWith('TEN')) return 'Tenant Billing'
    if (ruleId.startsWith('DALI')) return 'Lighting'
    return 'Solar & Export'
  }
  const FDD_GROUPS = ['Chiller Plant', 'AHUs', 'Power & Grid', 'Solar & Export', 'Tenant Billing', 'Lighting']
  const FDD_GROUP_COLOR: Record<string, string> = {
    'Chiller Plant': PURPLE, 'AHUs': '#1677ff', 'Power & Grid': '#fa541c',
    'Solar & Export': '#faad14', 'Tenant Billing': '#13c2c2', 'Lighting': '#a0d911',
  }
  const bySystemCounts = FDD_GROUPS.map(g => ({ group: g, count: allFindings.filter(f => fddGroupFor(f.ruleId) === g).length }))
  const fddBySystemOpt = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 100, right: 30, top: 10, bottom: 20 },
    xAxis: { type: 'value' as const, minInterval: 1 },
    yAxis: { type: 'category' as const, data: FDD_GROUPS, inverse: true },
    series: [{
      type: 'bar' as const,
      data: bySystemCounts.map(g => ({ value: g.count, itemStyle: { color: FDD_GROUP_COLOR[g.group] } })),
      barWidth: 16, label: { show: true, position: 'right' as const },
    }],
  }

  const resolutionRatePct = (fddSummary.resolvedThisWeek / (fddSummary.resolvedThisWeek + openCount || 1)) * 100
  const RESOLUTION_ZONES = buildZones({ min: 0, max: 100, critLow: 20, warnLow: 40 })

  const fddTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card title="Open Findings by Severity" size="small" style={{ height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <ReactECharts option={fddSeverityOpt} theme={chartTheme} style={{ width: 130, height: 130, flexShrink: 0 }} />
              <div style={{ marginLeft: 12 }}>
                <div style={{ fontSize: 12 }}><span style={{ color: '#ff4d4f' }}>■</span> Critical {critCount}</div>
                <div style={{ fontSize: 12 }}><span style={{ color: '#faad14' }}>■</span> Warning {warnCount}</div>
                <div style={{ fontSize: 12 }}><span style={{ color: '#1677ff' }}>■</span> Info {Math.max(0, openCount - critCount - warnCount)}</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={16}>
          <Card title="Open Findings by System" size="small" style={{ height: '100%' }}>
            <ReactECharts option={fddBySystemOpt} theme={chartTheme} style={{ height: 30 + FDD_GROUPS.length * 34 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card size="small" bodyStyle={{ padding: 8 }}>
            <Gauge label="Resolution Rate (7d)" value={resolutionRatePct} min={0} max={100}
              zones={RESOLUTION_ZONES} unit="%" precision={0} height={140} />
          </Card>
        </Col>
        <Col xs={24} sm={16}>
          <Card size="small" style={{ height: '100%' }}>
            <Paragraph style={{ marginBottom: 16 }}>
              <strong>{fddSummary.resolvedThisWeek}</strong> finding{fddSummary.resolvedThisWeek === 1 ? '' : 's'} resolved this week
              across all systems. Full findings detail, per-system filtering and notify-channel routing now live on the
              dedicated <strong>Alarms</strong> page, so it isn't duplicated here.
            </Paragraph>
            <Button type="primary" style={{ background: PURPLE, borderColor: PURPLE }} onClick={() => navigate('/alarms')}>
              Go to Alarms
            </Button>
          </Card>
        </Col>
      </Row>
    </div>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <Title level={3} style={{ color: undefined, marginBottom: 4 }}>Energy Savings</Title>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        AI optimisation impact — baseline vs actual energy use. COP improvement and FDD summary.
      </Paragraph>
      <Tabs
        defaultActiveKey="impact"
        items={[
          { key: 'impact', label: 'AI Impact',    children: impactTab },
          { key: 'schematic', label: 'System Schematic', children: schematicTab },
          { key: 'fdd',    label: `FDD Summary (${openCount})`, children: fddTab },
        ]}
      />
    </div>
  )
})

export default SavingsPage
