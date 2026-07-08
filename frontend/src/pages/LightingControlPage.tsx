import React from 'react'
import { observer } from 'mobx-react-lite'
import { Card, Row, Col, Typography, Tag, Switch, Slider, Button, Badge, Statistic, message, Alert } from 'antd'
import ReactECharts from 'echarts-for-react'
import { UndoOutlined, WarningOutlined } from '@ant-design/icons'
import { useStore } from '../stores'
import { Gauge } from '../components/Gauge'
import { buildZones } from '../components/RangeBar'
import { useEchartsTheme } from '../theme/echartsTheme'
import PageHeroImage from '../components/PageHeroImage'
import type { LightingZone } from '../stores/LightingStore'

const DIMMING_ZONES = buildZones({ min: 0, max: 100 })

const { Title, Paragraph, Text } = Typography
const PURPLE = '#5a0057'

const TERMINAL_COLOR: Record<string, string> = {
  T1: '#5a0057', T2: '#9b59b6', T3: '#e74c3c', T5: '#1677ff', 'Cargo Village': '#faad14', Landside: '#13a8a8',
}

function healthBadge(h: 'ok' | 'warning' | 'critical') {
  return h === 'critical' ? <Badge status="error" text="Critical" />
       : h === 'warning'  ? <Badge status="warning" text="Warning" />
       :                    <Badge status="success" text="Normal" />
}

const LightingControlPage: React.FC = observer(() => {
  const store = useStore()
  const { lighting } = store
  const { zones } = lighting
  const chartTheme = useEchartsTheme()

  const zonesOnOpt = {
    series: [{
      type: 'pie' as const, radius: ['65%', '85%'], startAngle: 90,
      label: { show: true, position: 'center' as const, formatter: `${zones.filter(z => z.onOff).length}/${zones.length}`, fontSize: 16, fontWeight: 700 },
      data: [
        { value: zones.filter(z => z.onOff).length, itemStyle: { color: PURPLE } },
        { value: zones.filter(z => !z.onOff).length, itemStyle: { color: '#f0f0f0' } },
      ],
    }],
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <Title level={3} style={{ color: undefined, marginBottom: 4 }}>Lighting Control</Title>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        Direct DALI zone control — on/off and dimming setpoints, written straight to the same
        zones shown on the <strong>Lighting — Power Monitoring</strong> page.
      </Paragraph>

      <Alert
        type="info" showIcon style={{ marginBottom: 20 }}
        message="Demo mode"
        description="Commands here update the local simulation directly. In production, writes go to the DALI gateway (BACnet/Modbus integration), which then reports back the real fixture state — the same round trip the monitoring page displays."
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <PageHeroImage
            src="/assets/airport_led_lighting_control_3d.png"
            alt="Airport LED lighting control"
            caption="Terminal LED lighting — DALI zone control overview"
          />
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Control Summary" size="small" style={{ height: '100%' }}>
            <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
              <Col span={12}>
                <Card size="small" bodyStyle={{ padding: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <ReactECharts option={zonesOnOpt} theme={chartTheme} style={{ width: 64, height: 64, flexShrink: 0 }} />
                    <div style={{ marginLeft: 8 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Zones On</Text>
                      <div style={{ fontSize: 11 }}>{zones.filter(z => z.manualOverride).length} manual override{zones.filter(z => z.manualOverride).length === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" bodyStyle={{ padding: 8 }}>
                  <Gauge label="Avg Dimming" value={zones.reduce((s, z) => s + z.dimmingActual, 0) / zones.length}
                    min={0} max={100} zones={DIMMING_ZONES} unit="%" precision={0} height={90} />
                </Card>
              </Col>
            </Row>
            {zones.some(z => z.hardwareFaultLocked) && (
              <Card size="small" style={{ border: '1px solid #ffa39e' }} bodyStyle={{ padding: 8 }}>
                <Statistic title="Hardware Faults" value={zones.filter(z => z.hardwareFaultLocked).length}
                  valueStyle={{ fontSize: 20, color: '#cf1322' }} />
              </Card>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {zones.map(z => (
          <Col key={z.id} xs={24} sm={12} md={8}>
            <Card
              size="small"
              style={{ height: '100%' }}
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag color={TERMINAL_COLOR[z.zone]} style={{ marginRight: 0 }}>{z.zone}</Tag>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{z.name}</span>
                </div>
              }
              extra={
                <Switch
                  size="small"
                  checked={z.onOff}
                  disabled={z.hardwareFaultLocked}
                  checkedChildren="ON" unCheckedChildren="OFF"
                  onChange={() => {
                    lighting.toggleZone(z.id)
                    message.success(`${z.name} switched ${z.onOff ? 'ON' : 'OFF'}`)
                  }}
                />
              }
            >
              <div style={{ marginBottom: 6 }}>{healthBadge(z.health)}</div>

              {z.hardwareFaultLocked && (
                <div style={{
                  fontSize: 11, color: '#cf1322', border: '1px solid #ffa39e',
                  borderRadius: 4, padding: '4px 8px', marginBottom: 10,
                }}>
                  <WarningOutlined style={{ marginRight: 4 }} />
                  Hardware fault — commands aren't reaching the fixtures. Needs an on-site visit, not a setpoint change.
                </div>
              )}

              <div style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={{ fontSize: 12 }}>Dimming</Text>
                  <Text strong style={{ fontSize: 13, color: PURPLE }}>{z.dimmingActual.toFixed(0)}%</Text>
                </div>
                <Slider
                  min={0} max={100} step={5}
                  value={z.dimmingCommand}
                  onChange={(v) => lighting.setDimming(z.id, v)}
                  marks={{ 0: '0', 55: '55', 100: '100' }}
                  tooltip={{ formatter: (v) => `${v}%` }}
                  disabled={!z.onOff || z.hardwareFaultLocked}
                  trackStyle={{ backgroundColor: PURPLE }}
                  handleStyle={{ borderColor: PURPLE }}
                />
              </div>

              <div style={{ fontSize: 11, color: undefined, borderTop: '1px solid rgba(128,128,128,0.2)', paddingTop: 8, marginTop: 8 }}>
                Fixtures: <strong>{z.fixtureCount.toLocaleString()}</strong> &nbsp;|&nbsp;
                Power: <strong>{z.powerKw.toFixed(1)} kW</strong> &nbsp;|&nbsp;
                Footfall: <strong>{z.footfallPct.toFixed(0)}%</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                {z.manualOverride ? (
                  <>
                    <Tag color="processing" style={{ fontSize: 11 }}>Manual override active</Tag>
                    <Button
                      size="small" type="link" icon={<UndoOutlined />}
                      onClick={() => { lighting.releaseOverride(z.id); message.info(`${z.name} released back to AI schedule`) }}
                    >
                      Release to AI
                    </Button>
                  </>
                ) : (
                  <Text type="secondary" style={{ fontSize: 11 }}>Following AI/DALI schedule</Text>
                )}
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )
})

export default LightingControlPage
