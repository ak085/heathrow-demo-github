import React, { useMemo, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { Typography, Card, Row, Col, Table, Tag, Alert, Segmented, Statistic } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useStore } from '../stores'
import { useEchartsTheme } from '../theme/echartsTheme'
import { SEVERITY_ORDER, SEVERITY_STYLE, type Finding, type Severity } from '../types/fdd'
import PageHeroImage from '../components/PageHeroImage'
import { FlashValue } from '../components/FlashValue'

const { Title, Paragraph, Text } = Typography
const PURPLE = '#5a0057'

type Group = 'Chiller Plant' | 'AHUs' | 'Power & Grid' | 'Solar & Export' | 'Tenant Billing' | 'Lighting'
type NotifyChannel = 'Email + SMS' | 'Email' | 'None'

interface TaggedFinding extends Finding {
  group: Group
}

function groupFor(ruleId: string): Group {
  if (ruleId.startsWith('CHI') || ruleId.startsWith('PLANT')) return 'Chiller Plant'
  if (ruleId.startsWith('AHU')) return 'AHUs'
  if (ruleId.startsWith('PWR')) return 'Power & Grid'
  if (ruleId.startsWith('TEN')) return 'Tenant Billing'
  if (ruleId.startsWith('DALI')) return 'Lighting'
  return 'Solar & Export'
}

/** Severity → notify channel policy. Mocked, matches the wording already used
 *  elsewhere in this demo family ("trigger SMS/email notifications based on severity"). */
function channelFor(severity: Severity): NotifyChannel {
  if (severity === 'critical') return 'Email + SMS'
  if (severity === 'warning') return 'Email'
  return 'None'
}

const GROUP_COLOR: Record<Group, string> = {
  'Chiller Plant': 'purple',
  'AHUs': 'blue',
  'Power & Grid': 'volcano',
  'Solar & Export': 'gold',
  'Tenant Billing': 'cyan',
  'Lighting': 'lime',
}

const CHANNEL_COLOR: Record<NotifyChannel, string> = {
  'Email + SMS': 'red',
  'Email': 'blue',
  'None': 'default',
}

const AlarmsPage: React.FC = observer(() => {
  const store = useStore()
  const { chiller, ahu, power, solar, tenant, lighting } = store
  const chartTheme = useEchartsTheme()
  const [groupFilter, setGroupFilter] = useState<Group | 'All'>('All')
  const [severityFilter, setSeverityFilter] = useState<Severity | 'All'>('All')

  const allFindings: TaggedFinding[] = useMemo(() => [
    ...chiller.allFindings.map(f => ({ ...f, group: groupFor(f.ruleId) })),
    ...ahu.allFindings.map(f => ({ ...f, group: groupFor(f.ruleId) })),
    ...power.allFindings.map(f => ({ ...f, group: groupFor(f.ruleId) })),
    ...solar.allFindings.map(f => ({ ...f, group: groupFor(f.ruleId) })),
    ...tenant.allFindings.map(f => ({ ...f, group: groupFor(f.ruleId) })),
    ...lighting.allFindings.map(f => ({ ...f, group: groupFor(f.ruleId) })),
  ].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
  [chiller.allFindings, ahu.allFindings, power.allFindings, solar.allFindings, tenant.allFindings, lighting.allFindings])

  const critCount = allFindings.filter(f => f.severity === 'critical').length
  const warnCount = allFindings.filter(f => f.severity === 'warning').length
  const mostSevere = allFindings[0]

  const byGroup: Group[] = ['Chiller Plant', 'AHUs', 'Power & Grid', 'Solar & Export', 'Tenant Billing', 'Lighting']
  const groupCounts = byGroup.map(g => ({
    group: g,
    crit: allFindings.filter(f => f.group === g && f.severity === 'critical').length,
    warn: allFindings.filter(f => f.group === g && f.severity === 'warning').length,
  }))

  const groupChartOpt = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    legend: { data: ['Critical', 'Warning'], bottom: 0 },
    grid: { left: 100, right: 30, top: 10, bottom: 40 },
    xAxis: { type: 'value' as const, minInterval: 1 },
    yAxis: { type: 'category' as const, data: byGroup, inverse: true },
    series: [
      { name: 'Critical', type: 'bar' as const, stack: 'total', data: groupCounts.map(g => g.crit), itemStyle: { color: '#ff4d4f' } },
      { name: 'Warning', type: 'bar' as const, stack: 'total', data: groupCounts.map(g => g.warn), itemStyle: { color: '#faad14' } },
    ],
  }

  const filtered = allFindings.filter(f =>
    (groupFilter === 'All' || f.group === groupFilter) &&
    (severityFilter === 'All' || f.severity === severityFilter)
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <Title level={3} style={{ color: undefined, marginBottom: 4 }}>Alarms</Title>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        Every active finding across Chiller Plant, AHUs, Power &amp; Grid, Solar &amp; Export, Tenant Billing and Lighting in one place.
      </Paragraph>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <PageHeroImage
            src="/assets/airport_alarms_page.png"
            alt="Alarms overview"
            caption="Terminal-wide alarms & fault detection overview"
          />
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" style={{ height: '100%' }}>
            <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
              <Col span={12}>
                <Card size="small" style={{ textAlign: 'center' }}>
                  <Statistic title="Critical" value={critCount}
                    formatter={() => <FlashValue value={critCount}>{critCount}</FlashValue>}
                    valueStyle={{ color: critCount > 0 ? '#cf1322' : '#52c41a', fontWeight: 700, fontSize: 26 }} />
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" style={{ textAlign: 'center' }}>
                  <Statistic title="Warnings" value={warnCount}
                    formatter={() => <FlashValue value={warnCount}>{warnCount}</FlashValue>}
                    valueStyle={{ color: warnCount > 0 ? '#d48806' : '#52c41a', fontWeight: 700, fontSize: 26 }} />
                </Card>
              </Col>
            </Row>
            <Text type="secondary" style={{ fontSize: 12 }}>Findings by System</Text>
            <ReactECharts option={groupChartOpt} theme={chartTheme} style={{ height: 220 }} />
          </Card>
        </Col>
      </Row>

      {/* Alert ticker — single most severe active alarm */}
      {mostSevere ? (
        <Alert
          style={{ marginBottom: 16 }}
          type={mostSevere.severity === 'critical' ? 'error' : 'warning'}
          showIcon
          message={`${mostSevere.group} — ${mostSevere.title} (${mostSevere.unit})`}
          description={mostSevere.detail}
        />
      ) : (
        <Alert style={{ marginBottom: 16 }} type="success" showIcon message="All Clear — no active findings across any system" />
      )}

      <Card size="small" style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          <strong>Notify policy (demo default):</strong> Critical → <Tag color={CHANNEL_COLOR['Email + SMS']} style={{ marginBottom: 0 }}>Email + SMS</Tag>
          {' '}Warning → <Tag color={CHANNEL_COLOR['Email']} style={{ marginBottom: 0 }}>Email</Tag>
          {' '}Info → <Tag color={CHANNEL_COLOR['None']} style={{ marginBottom: 0 }}>None</Tag>.
          Thresholds shown throughout this demo are illustrative defaults — confirm against site commissioning data before go-live.
        </Text>
      </Card>

      <Card
        title="All Active Findings"
        size="small"
        extra={
          <div style={{ display: 'flex', gap: 12 }}>
            <Segmented
              size="small"
              value={groupFilter}
              onChange={(v) => setGroupFilter(v as Group | 'All')}
              options={['All', ...byGroup]}
            />
            <Segmented
              size="small"
              value={severityFilter}
              onChange={(v) => setSeverityFilter(v as Severity | 'All')}
              options={['All', 'critical', 'warning', 'info']}
            />
          </div>
        }
      >
        <Table
          dataSource={filtered}
          rowKey={r => `${r.ruleId}-${r.unit}`}
          pagination={false}
          size="small"
          expandable={{
            expandedRowRender: (f: TaggedFinding) => (
              <div style={{ fontSize: 12, color: '#595959' }}>
                <div style={{ marginBottom: 6 }}>{f.detail}</div>
                <div><span style={{ color: '#096dd9', fontWeight: 500 }}>Action: </span>{f.recommendation}</div>
              </div>
            ),
          }}
          columns={[
            { title: 'Severity', dataIndex: 'severity', key: 'sev', width: 100, render: (v: Severity) =>
              <Tag color={SEVERITY_STYLE[v].tagColor}>{v.toUpperCase()}</Tag> },
            { title: 'System', dataIndex: 'group', key: 'group', width: 130, render: (v: Group) =>
              <Tag color={GROUP_COLOR[v]}>{v}</Tag> },
            { title: 'Unit', dataIndex: 'unit', key: 'unit', width: 110 },
            { title: 'Finding', dataIndex: 'title', key: 'title', render: (v) => <strong>{v}</strong> },
            { title: 'Trigger Value', dataIndex: 'triggerValue', key: 'tv', width: 180 },
            { title: 'Notify', key: 'notify', width: 120, render: (_, f: TaggedFinding) =>
              <Tag color={CHANNEL_COLOR[channelFor(f.severity)]}>{channelFor(f.severity)}</Tag> },
          ]}
          locale={{ emptyText: 'No findings match this filter' }}
        />
      </Card>
    </div>
  )
})

export default AlarmsPage
