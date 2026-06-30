import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Row, Col, Typography, Tag } from 'antd'
import { observer } from 'mobx-react-lite'
import {
  ThunderboltOutlined, CloudOutlined, BankOutlined,
  SunOutlined, RiseOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons'
import { useStore } from '../stores'
import { overallHealth } from '../types/fdd'

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
  const { chiller, ahu, power, solar, savings } = useStore()

  const hChiller = overallHealth(chiller.allFindings)
  const hAHU     = overallHealth(ahu.allFindings)
  const hPower   = overallHealth(power.allFindings)
  const hSolar   = overallHealth(solar.allFindings)
  const hSavings = overallHealth(savings.allFindings)

  const TILES = [
    {
      key: 'chiller', path: '/chiller', health: hChiller,
      icon: <ThunderboltOutlined style={{ fontSize: 36, color: PURPLE }} />,
      iconBg: 'rgba(90,0,87,0.12)', cardBg: 'rgba(90,0,87,0.04)',
      border: PURPLE,
      title: 'Chiller Plant',
      subtitle: '3 Water-Cooled Chillers — T2 & T3 Plant Rooms',
      tag: '3 Chillers',
      stat: `${chiller.chillerPlantKw.toFixed(0)} kW`,
      statLabel: 'Plant Load',
      findings: chiller.allFindings,
      prominent: false,
    },
    {
      key: 'ahu', path: '/ahu', health: hAHU,
      icon: <CloudOutlined style={{ fontSize: 36, color: '#1677ff' }} />,
      iconBg: '#e6f4ff', cardBg: '#f0f8ff',
      border: '#1677ff',
      title: 'AHUs',
      subtitle: '6 Air Handling Units — T1 / T2 / T3 / T5',
      tag: '6 AHUs',
      stat: `${ahu.avgSAT.toFixed(1)}°C`,
      statLabel: 'Avg Supply Air Temp',
      findings: ahu.allFindings,
      prominent: false,
    },
    {
      key: 'power', path: '/power', health: hPower,
      icon: <BankOutlined style={{ fontSize: 42, color: PURPLE }} />,
      iconBg: 'rgba(90,0,87,0.15)', cardBg: 'rgba(90,0,87,0.06)',
      border: PURPLE,
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
      iconBg: '#fef3c7', cardBg: '#fffbeb',
      border: '#f59e0b',
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
      iconBg: '#dcfce7', cardBg: '#f0fdf4',
      border: '#16a34a',
      title: 'Energy Savings',
      subtitle: 'AI Optimisation Impact — Baseline vs Actual',
      tag: 'AI Active',
      stat: `£${savings.savingsGbpToday.toFixed(0)}`,
      statLabel: 'Saved Today',
      findings: savings.allFindings,
      prominent: false,
    },
  ]

  return (
    <div style={{ padding: '36px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <Tag style={{
          fontSize: 11, letterSpacing: 1, marginBottom: 12,
          background: 'rgba(90,0,87,0.1)', color: PURPLE,
          border: `1px solid rgba(90,0,87,0.3)`,
        }}>
          AiHVAC Platform — Terminal Energy Management
        </Tag>
        <Title level={2} style={{ marginBottom: 6, color: PURPLE }}>
          Heathrow Energy Intelligence
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
                background: tile.cardBg,
                border: tile.health === 'critical' ? `2px solid #cf1322`
                  : tile.health === 'warning'  ? `2px solid #d48806`
                  : tile.prominent             ? `2px solid ${tile.border}`
                  : `1px solid rgba(0,0,0,0.10)`,
                cursor: 'pointer',
                height: '100%',
                boxShadow: tile.prominent ? '0 4px 20px rgba(90,0,87,0.15)' : undefined,
              }}
              styles={{ body: { padding: tile.prominent ? 28 : 22 } }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{
                  width: tile.prominent ? 68 : 56,
                  height: tile.prominent ? 68 : 56,
                  borderRadius: 14, background: tile.iconBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 14, flexShrink: 0,
                }}>
                  {tile.icon}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: tile.prominent ? 22 : 18,
                    fontWeight: 700,
                    color: tile.prominent ? PURPLE : '#1a1a1a',
                  }}>{tile.stat}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{tile.statLabel}</div>
                </div>
              </div>

              <div style={{ marginBottom: 6 }}>
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

              <Tag style={{
                marginBottom: 8, fontSize: 11,
                background: tile.prominent ? PURPLE : 'rgba(0,0,0,0.06)',
                color: tile.prominent ? '#fff' : '#333',
                border: 'none',
              }}>{tile.tag}</Tag>

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
