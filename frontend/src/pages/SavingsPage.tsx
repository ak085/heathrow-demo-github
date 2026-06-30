import React, { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { Tabs, Card, Row, Col, Statistic, Table, Tag, Typography } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useStore } from '../stores'
import { FDDPanel } from '../components/FDDPanel'
import type { Finding } from '../types/fdd'

const { Title, Paragraph } = Typography
const PURPLE  = '#5a0057'
const BASELINE_COLOR = '#aaa'
const ACTUAL_COLOR   = '#52c41a'

const SavingsPage: React.FC = observer(() => {
  const { savings, chiller, ahu, power } = useStore()

  // Aggregate FDD findings across all systems
  const allFindings: Finding[] = [
    ...chiller.allFindings,
    ...ahu.allFindings,
    ...power.allFindings,
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

      {/* COP improvement */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Card title="COP Improvement">
            <Row gutter={[16, 0]}>
              <Col span={12}>
                <Card size="small" style={{ textAlign: 'center', background: '#f5f5f5' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Before AI</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#888' }}>
                    {copBaseline.toFixed(1)}
                  </div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>COP baseline</div>
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" style={{ textAlign: 'center', background: '#f6ffed', border: '1px solid #b7eb8f' }}>
                  <div style={{ fontSize: 11, color: '#389e0d', marginBottom: 4 }}>With AI</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#389e0d' }}>
                    {copActual.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 11, color: '#389e0d' }}>
                    +{copImprovement.toFixed(1)}% improvement
                  </div>
                </Card>
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card title="7-Day Energy — Baseline vs Actual" style={{ height: '100%' }}>
            <ReactECharts option={weeklyOpt} style={{ height: 200 }} />
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

      {/* All findings across systems */}
      <Card title="All Active Findings — Cross-System">
        {allFindings.length === 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#f6ffed', border: '1px solid #b7eb8f',
            borderRadius: 6, padding: '10px 14px',
          }}>
            <span style={{ color: '#52c41a', fontSize: 16 }}>✓</span>
            <span style={{ fontWeight: 600, color: '#389e0d' }}>All Clear — No active faults across all systems</span>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 12 }}>
              {critCount > 0 && <Tag color="error">{critCount} Critical</Tag>}
              {warnCount > 0 && <Tag color="warning">{warnCount} Warning{warnCount > 1 ? 's' : ''}</Tag>}
            </div>
            <Table
              dataSource={allFindings}
              rowKey={r => `${r.ruleId}-${r.unit}`}
              pagination={false}
              size="small"
              columns={[
                { title: 'System', key: 'sys', render: (_, r) =>
                  r.ruleId.startsWith('CHI') ? <Tag color="purple">Chiller</Tag>
                : r.ruleId.startsWith('AHU') ? <Tag color="blue">AHU</Tag>
                :                               <Tag color="volcano">Power</Tag> },
                { title: 'Severity', dataIndex: 'severity', key: 'sev', render: v =>
                  <Tag color={v === 'critical' ? 'error' : 'warning'}>{v.toUpperCase()}</Tag> },
                { title: 'Unit', dataIndex: 'unit', key: 'unit' },
                { title: 'Finding', dataIndex: 'title', key: 'title', render: v => <strong>{v}</strong> },
                { title: 'Trigger', dataIndex: 'triggerValue', key: 'tv' },
              ]}
            />
          </div>
        )}
      </Card>

      <div style={{ marginTop: 20 }}>
        <FDDPanel findings={allFindings} systemLabel="all systems" />
      </div>
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
