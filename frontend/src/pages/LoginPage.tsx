import React, { useState } from 'react'
import { Card, Form, Input, Button, Typography, Alert } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { apiLogin } from '../auth'
import type { AuthUser } from '../auth'

const { Title, Text } = Typography

interface Props {
  onLogin: (user: AuthUser) => void
}

const LoginPage: React.FC<Props> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false)
  const [error,   setError  ] = useState<string | null>(null)

  async function handleSubmit(values: { username: string; password: string }) {
    setLoading(true)
    setError(null)
    try {
      const user = await apiLogin(values.username, values.password)
      onLogin(user)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f0f2f5',
    }}>
      <div style={{ width: 360 }}>

        {/* Brand header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          10,
            background:   '#5a0057',
            borderRadius: 8,
            padding:      '10px 22px',
            marginBottom: 18,
          }}>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 22, letterSpacing: 1 }}>
              Airport
            </span>
            <span style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, lineHeight: 1.35 }}>
              Energy<br />Intelligence
            </span>
          </div>
          <div>
            <Title level={4} style={{ margin: 0, color: '#262626' }}>Sign in</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Terminal Energy Management Platform
            </Text>
          </div>
        </div>

        {/* Login card */}
        <Card styles={{ body: { padding: 28 } }}>
          {error && (
            <Alert
              type="error"
              message={error}
              style={{ marginBottom: 16 }}
              showIcon
              closable
              onClose={() => setError(null)}
            />
          )}
          <Form layout="vertical" onFinish={handleSubmit} size="large">
            <Form.Item name="username" rules={[{ required: true, message: 'Enter your username' }]}>
              <Input
                prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="Username"
                autoFocus
                autoComplete="username"
              />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: 'Enter your password' }]}>
              <Input.Password
                prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="Password"
                autoComplete="current-password"
              />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              style={{ background: '#5a0057', borderColor: '#5a0057', height: 40 }}
            >
              Sign In
            </Button>
          </Form>
        </Card>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Airport Energy Intelligence Platform &nbsp;·&nbsp; Demo
          </Text>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
