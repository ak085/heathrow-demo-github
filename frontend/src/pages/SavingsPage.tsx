import React, { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { useNavigate } from 'react-router-dom'
import { Tabs, Card, Row, Col, Statistic, Button, Typography } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useStore } from '../stores'
import { Gauge } from '../components/Gauge'
import { RangeBar, buildZones } from '../components/RangeBar'
import { useEchartsTheme } from '../theme/echartsTheme'
import type { Finding } from '../types/fdd'

const { Title, Paragraph } = Typography
const PURPLE  = '#5a0057'
const BASELINE_COLOR = '#aaa'
const ACTUAL_COLOR   = '#52c41a'
const COP_ZONES = buildZones({ min: 3, max: 6.2, critLow: 3.5, warnLow: 4.0 })
const SAVINGS_PCT_ZONES = buildZones({ min: 0, max: 30, warnLow: 8, critLow: 3 })

const SavingsPage: React.FC = observer(() => {
  const { savings, chiller, ahu, power, solar } = useStore()
  const navigate = useNavigate()
  const chartTheme = useEchartsTheme()

  // Aggregate FDD findings across all systems
  const allFindings: Finding[] = [
    ...chiller.allFindings,
    ...ahu.allFindings,
    ...power.allFindings,
    ...solar.allFindings,
  ]
  const openCount    = allFindings.length
  const critCount    = allFindings.filter(f => f.severity === 'critical').length
  const warnCount    = allFindings.filter(f => f.severity === 'warning').length

  // Keep savings store FDD summary in sync
  useEffect(() => {
    savings.updateFDD(openCount, critCount)
  })

  const {
    baselineDailyKwh, actualDailyKwh, savingsPct, savingsKwhToday,
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

  const impactTab = (
    <div>
      {/* Headline */}
      <Card style={{
        textAlign: 'center', marginBottom: 24,
        background: `linear-gradient(135deg, rgba(90,0,87,0.06) 0%, rgba(22,163,74,0.06) 100%)`,
        border: `1px solid rgba(90,0,87,0.2)`,
      }}>
        <div style={{ fontSize: 14, color: '#888', marginBottom: 4 }}>Estimated Saving Today</div>
        <div style={{ fontSize: 52, fontWeight: 900, color: '#16a34a', lineHeight: 1 }}>
          £{savingsGbpToday.toFixed(0)}
        </div>
        <div style={{ fontSize: 14, color: '#888', marginTop: 4 }}>
          AI optimisation vs pre-AI baseline
        </div>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center' }}>
            <Statistic title="kWh Saved Today" value={Math.round(savingsKwhToday).toLocaleString()} suffix="kWh"
              valueStyle={{ color: '#16a34a', fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center' }}>
            <Statistic title="Saving %" value={savingsPct.toFixed(1)} suffix="%"
              valueStyle={{ color: '#16a34a', fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center' }}>
            <Statistic title="Actual Today" value={Math.round(actualDailyKwh).toLocaleString()} suffix="kWh"
              valueStyle={{ fontWeight: 700 }} />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              Baseline: {baselineDailyKwh.toLocaleString()} kWh
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center', background: '#fef3c7' }}>
            <Statistic title="Annualised Projection"
              value={`£${Math.round(annualisedGbp / 1000)}k`}
              valueStyle={{ color: '#d97706', fontWeight: 700 }} />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>at today's rate</div>
          </Card>
        </Col>
      </Row>

      {/* COP improvement + savings rate */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Card title="COP Improvement">
            <Row gutter={[16, 0]} align="middle">
              <Col span={10}>
                <Card size="small" style={{ textAlign: 'center', background: '#f5f5f5' }}>
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

  // ── FDD Summary Tab ───────────────────────────────────────────────────────
  const fddTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center', background: openCount > 0 ? '#fff1f0' : '#f6ffed',
            border: `1px solid ${openCount > 0 ? '#ffa39e' : '#b7eb8f'}` }}>
            <Statistic title="Open Faults" value={openCount}
              valueStyle={{ color: openCount > 0 ? '#cf1322' : '#52c41a', fontWeight: 700, fontSize: 28 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center' }}>
            <Statistic title="Critical" value={critCount}
              valueStyle={{ color: critCount > 0 ? '#cf1322' : '#52c41a', fontWeight: 700, fontSize: 28 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center' }}>
            <Statistic title="Warnings" value={warnCount}
              valueStyle={{ color: warnCount > 0 ? '#d48806' : '#52c41a', fontWeight: 700, fontSize: 28 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ textAlign: 'center', background: '#f0fdf4' }}>
            <Statistic title="Resolved This Week" value={fddSummary.resolvedThisWeek}
              valueStyle={{ color: '#16a34a', fontWeight: 700, fontSize: 28 }} />
          </Card>
        </Col>
      </Row>

      <Card style={{ textAlign: 'center' }}>
        <Paragraph style={{ marginBottom: 16 }}>
          Full findings detail, per-system filtering and notify-channel routing now live on the dedicated
          <strong> Alarms</strong> page, so it isn't duplicated here.
        </Paragraph>
        <Button type="primary" style={{ background: PURPLE, borderColor: PURPLE }} onClick={() => navigate('/alarms')}>
          Go to Alarms
        </Button>
      </Card>
    </div>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <Title level={3} style={{ color: PURPLE, marginBottom: 4 }}>Energy Savings</Title>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        AI optimisation impact — baseline vs actual energy use. COP improvement and FDD summary.
      </Paragraph>
      <Tabs
        defaultActiveKey="impact"
        items={[
          { key: 'impact', label: 'AI Impact',    children: impactTab },
          { key: 'fdd',    label: `FDD Summary (${openCount})`, children: fddTab },
        ]}
      />
    </div>
  )
})

export default SavingsPage
