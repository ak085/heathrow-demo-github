import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Row, Col, Typography, Tag } from 'antd'
import { observer } from 'mobx-react-lite'
import {
  ThunderboltOutlined, CloudOutlined, BankOutlined,
  SunOutlined, RiseOutlined, ShopOutlined, BulbOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons'
import { useStore } from '../stores'
import { overallHealth } from '../types/fdd'
import PageHeroImage from '../components/PageHeroImage'

const { Title, Paragraph, Text } = Typography
const PURPLE = '#5a0057'

function HealthPill({ health }: { health: 'ok' | 'warning' | 'critical' }) {
  if (health === 'critical')
    return <Tag color="error"   icon={<CloseCircleOutlined />}       style={{ marginBottom: 6 }}>Active Fault</Tag>
  if (health === 'warning')
    return <Tag color="warning" icon={<ExclamationCircleOutlined />} style={{ marginBottom: 6 }}>Warning</Tag>
  return   <Tag color="success" icon={<CheckCircleOutlined />}       style={{ marginBottom: 6 }}>All Clear</Tag>
}

const LandingPage: React.FC = observer(() => {
  const navigate = useNavigate()
  const { chiller, ahu, power, solar, savings, tenant, lighting } = useStore()

  const hChiller  = overallHealth(chiller.allFindings)
  const hAHU      = overallHealth(ahu.allFindings)
  const hPower    = overallHealth(power.allFindings)
  const hSolar    = overallHealth(solar.allFindings)
  const hSavings  = overallHealth(savings.allFindings)
  const hTenant   = overallHealth(tenant.allFindings)
  const hLighting = overallHealth(lighting.allFindings)

  // tagColor uses Ant Design's own preset Tag colors — these are already designed to
  // read correctly in both light and dark themes, so no custom background/text logic needed.
  const TILES = [
    {
      key: 'chiller', path: '/chiller', health: hChiller,
      icon: <ThunderboltOutlined style={{ fontSize: 36, color: PURPLE }} />,
      border: PURPLE, tagColor: 'purple',
      title: 'Chiller Plant',
      subtitle: '5 Water-Cooled Chillers — T2, T3 & T5 Plant Rooms',
      tag: '5 Chillers',
      stat: `${chiller.chillerPlantKw.toFixed(0)} kW`,
      statLabel: 'Plant Load',
      findings: chiller.allFindings,
      prominent: false,
    },
    {
      key: 'ahu', path: '/ahu', health: hAHU,
      icon: <CloudOutlined style={{ fontSize: 36, color: '#1677ff' }} />,
      border: '#1677ff', tagColor: 'blue',
      title: 'AHUs',
      subtitle: '10 Air Handling Units — T1 / T2 / T3 / T5',
      tag: '10 AHUs',
      stat: `${ahu.avgSAT.toFixed(1)}°C`,
      statLabel: 'Avg Supply Air Temp',
      findings: ahu.allFindings,
      prominent: false,
    },
    {
      key: 'power', path: '/power', health: hPower,
      icon: <BankOutlined style={{ fontSize: 42, color: PURPLE }} />,
      border: PURPLE, tagColor: 'purple',
      title: 'Power & Grid',
      subtitle: '4 Substations — Demand, Power Factor & Sub-Meters',
      tag: '4 Substations',
      stat: `${power.totalBuildingKw.toFixed(0)} kW`,
      statLabel: 'Total Site Demand',
      findings: power.allFindings,
      prominent: true,
    },
    {
      key: 'solar', path: '/solar', health: hSolar,
      icon: <SunOutlined style={{ fontSize: 36, color: '#f59e0b' }} />,
      border: '#f59e0b', tagColor: 'gold',
      title: 'Solar & Export',
      subtitle: 'Embedded Generation — Export Limit Management',
      tag: '800 kW Peak',
      stat: `${solar.generationKw.toFixed(0)} kW`,
      statLabel: 'Generating Now',
      findings: solar.allFindings,
      prominent: false,
    },
    {
      key: 'savings', path: '/savings', health: hSavings,
      icon: <RiseOutlined style={{ fontSize: 36, color: '#16a34a' }} />,
      border: '#16a34a', tagColor: 'green',
      title: 'Energy Savings',
      subtitle: 'AI Optimisation Impact — Baseline vs Actual',
      tag: 'AI Active',
      stat: `£${savings.savingsGbpToday.toFixed(0)}`,
      statLabel: 'Saved Today',
      findings: savings.allFindings,
      prominent: false,
    },
    {
      key: 'tenant', path: '/tenant', health: hTenant,
      icon: <ShopOutlined style={{ fontSize: 36, color: '#0891b2' }} />,
      border: '#0891b2', tagColor: 'cyan',
      title: 'Tenant Billing',
      subtitle: 'Commercial Loss — Meter Anomaly Detection',
      tag: '20-Meter Sample',
      stat: `£${(tenant.extrapolatedAnnualLossGbp / 1000).toFixed(0)}k`,
      statLabel: 'Est. Annual Loss',
      findings: tenant.allFindings,
      prominent: false,
    },
    {
      key: 'lighting', path: '/lighting', health: hLighting,
      icon: <BulbOutlined style={{ fontSize: 36, color: '#65a30d' }} />,
      border: '#65a30d', tagColor: 'lime',
      title: 'Lighting Monitoring',
      subtitle: 'DALI Dimming — 10 Zones, T1/T2/T3/T5 & Landside',
      tag: `${lighting.zones.length} Zones`,
      stat: `${lighting.totalPowerKw.toFixed(0)} kW`,
      statLabel: 'Power Now',
      findings: lighting.allFindings,
      prominent: false,
    },
  ]

  return (
    <div style={{ padding: '36px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <div style={{ width: '100%', maxWidth: 980 }}>
          <PageHeroImage
            src="/assets/heathrow_dashboard_landing_page.webp"
            alt="Airport Energy Intelligence dashboard"
            caption="Airport Energy Intelligence — Terminal overview"
            size="large"
          />
        </div>
      </div>
      {/* Header */}
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <Tag color="purple" style={{ fontSize: 11, letterSpacing: 1, marginBottom: 12 }}>
          Energy Intelligence Platform — Terminal Energy Management
        </Tag>
        <Title level={2} style={{ marginBottom: 6 }}>
          Airport Energy Intelligence
        </Title>
        <Paragraph type="secondary" style={{ fontSize: 15, maxWidth: 560, margin: '0 auto' }}>
          Live AI optimisation across chiller plant, AHUs, power substations, and solar generation.
          Select a system to review status and findings.
        </Paragraph>
      </div>

      {/* Tiles row 1: Chiller + AHU + Power (prominent) */}
      <Row gutter={[24, 24]} justify="center" style={{ marginBottom: 0 }}>
        {TILES.map(tile => (
          <Col
            key={tile.key}
            xs={24} sm={12}
            md={tile.prominent ? 10 : 7}
          >
            <Card
              hoverable
              onClick={() => navigate(tile.path)}
              style={{
                borderRadius: 12,
                border: tile.health === 'critical' ? `2px solid #cf1322`
                  : tile.health === 'warning'  ? `2px solid #d48806`
                  : `1px solid ${tile.border}`,
                cursor: 'pointer',
                height: '100%',
              }}
              styles={{ body: { padding: tile.prominent ? 28 : 22 } }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                {tile.icon}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: tile.prominent ? 22 : 18, fontWeight: 700 }}>{tile.stat}</div>
                  <Text type="secondary" style={{ fontSize: 11 }}>{tile.statLabel}</Text>
                </div>
              </div>

              <div style={{ margin: '10px 0 6px' }}>
                <HealthPill health={tile.health} />
                {tile.findings.filter(f => f.severity === 'critical').length > 0 && (
                  <Text style={{ fontSize: 11, color: '#cf1322', marginLeft: 4 }}>
                    {tile.findings.filter(f => f.severity === 'critical').length} critical
                  </Text>
                )}
                {tile.findings.filter(f => f.severity === 'warning').length > 0 && (
                  <Text style={{ fontSize: 11, color: '#d48806', marginLeft: 6 }}>
                    {tile.findings.filter(f => f.severity === 'warning').length} warning{tile.findings.filter(f => f.severity === 'warning').length > 1 ? 's' : ''}
                  </Text>
                )}
              </div>

              <Tag color={tile.tagColor} style={{ marginBottom: 8, fontSize: 11 }}>{tile.tag}</Tag>

              <Title level={tile.prominent ? 3 : 4} style={{ marginBottom: 3, marginTop: 0 }}>
                {tile.title}
              </Title>
              <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
                {tile.subtitle}
              </Paragraph>
            </Card>
          </Col>
        ))}
      </Row>

      <div style={{ textAlign: 'center', marginTop: 40 }}>
        <Paragraph type="secondary" style={{ fontSize: 12 }}>
          Demo — all data simulated. Live integration via BMS (Trend / Honeywell) available.
          Data refreshes every 5 s.
        </Paragraph>
      </div>
    </div>
  )
})

export default LandingPage
