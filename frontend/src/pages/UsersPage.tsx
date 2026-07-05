import React, { useState, useEffect } from 'react'
import {
  Card, Row, Col, Table, Tag, Button, Form, Input, Select, message,
  Space, Typography, Popconfirm, Modal, Switch,
} from 'antd'
import {
  TeamOutlined, PlusOutlined, KeyOutlined, DeleteOutlined,
} from '@ant-design/icons'
import { authorizedFetch } from '../auth'

const { Title, Text } = Typography

interface User {
  id:           number
  username:     string
  display_name: string
  role:         string
  enabled:      boolean
  created_at:   string
}

interface AddFormValues {
  username:     string
  password:     string
  display_name: string
  role:         string
}

const UsersPage: React.FC = () => {
  const [users,    setUsers   ] = useState<User[]>([])
  const [loading,  setLoading ] = useState(false)
  const [addForm]               = Form.useForm<AddFormValues>()
  const [resetModal, setResetModal] = useState<{ open: boolean; userId: number | null; name: string }>({
    open: false, userId: null, name: '',
  })
  const [newPw, setNewPw] = useState('')

  async function fetchUsers() {
    setLoading(true)
    try {
      const res = await authorizedFetch('/api/users')
      if (!res.ok) throw new Error('Failed to load')
      setUsers(await res.json())
    } catch {
      message.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  async function addUser(values: AddFormValues) {
    try {
      const res = await authorizedFetch('/api/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(values),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error((err as { detail?: string }).detail || 'Failed')
      }
      message.success(`User "${values.username}" created`)
      addForm.resetFields()
      fetchUsers()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Failed to create user')
    }
  }

  async function toggleEnabled(id: number, enabled: boolean) {
    try {
      const res = await authorizedFetch(`/api/users/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error('Failed')
      message.success(enabled ? 'User enabled' : 'User disabled')
      fetchUsers()
    } catch {
      message.error('Failed to update user')
    }
  }

  async function deleteUser(id: number, username: string) {
    try {
      const res = await authorizedFetch(`/api/users/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error((err as { detail?: string }).detail || 'Failed')
      }
      message.success(`User "${username}" deleted`)
      fetchUsers()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Failed to delete user')
    }
  }

  async function doResetPassword() {
    if (!resetModal.userId || newPw.trim().length < 6) {
      message.warning('Password must be at least 6 characters')
      return
    }
    try {
      const res = await authorizedFetch(`/api/users/${resetModal.userId}/reset-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ new_password: newPw }),
      })
      if (!res.ok) throw new Error('Failed')
      message.success(`Password reset for ${resetModal.name}`)
      setResetModal({ open: false, userId: null, name: '' })
      setNewPw('')
    } catch {
      message.error('Failed to reset password')
    }
  }

  // Disable disable/delete only for whichever admin account is currently the sole
  // active admin — otherwise a user could lock every admin out of the Users page.
  const activeAdminCount = users.filter(u => u.role === 'admin' && u.enabled).length
  function isLastActiveAdmin(u: User): boolean {
    return u.role === 'admin' && u.enabled && activeAdminCount <= 1
  }

  const columns = [
    {
      title: 'Username', dataIndex: 'username', key: 'username', width: 140,
      render: (v: string) => <Text strong style={{ fontFamily: 'monospace' }}>{v}</Text>,
    },
    { title: 'Display Name', dataIndex: 'display_name', key: 'name' },
    {
      title: 'Role', dataIndex: 'role', key: 'role', width: 90,
      render: (v: string) => (
        <Tag color={v === 'admin' ? 'red' : 'blue'} style={{ fontSize: 11 }}>
          {v}
        </Tag>
      ),
    },
    {
      title: 'Active', dataIndex: 'enabled', key: 'enabled', width: 75,
      render: (v: boolean, u: User) => (
        <Switch
          size="small"
          checked={v}
          disabled={isLastActiveAdmin(u)}
          onChange={(en) => toggleEnabled(u.id, en)}
        />
      ),
    },
    {
      title: 'Created', dataIndex: 'created_at', key: 'created', width: 105,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>{v.slice(0, 10)}</Text>
      ),
    },
    {
      title: 'Actions', key: 'actions', width: 220,
      render: (_: unknown, u: User) => (
        <Space>
          <Button
            size="small" icon={<KeyOutlined />}
            onClick={() => { setResetModal({ open: true, userId: u.id, name: u.display_name }); setNewPw('') }}
          >
            Reset PW
          </Button>
          <Popconfirm
            title={`Delete "${u.username}"?`}
            description="This action cannot be undone."
            onConfirm={() => deleteUser(u.id, u.username)}
            okText="Delete" cancelText="Cancel" okType="danger"
            disabled={isLastActiveAdmin(u)}
          >
            <Button
              size="small" danger icon={<DeleteOutlined />}
              disabled={isLastActiveAdmin(u)}
            >
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <TeamOutlined style={{ fontSize: 20, color: '#096dd9' }} />
        <Title level={3} style={{ margin: 0 }}>User Management</Title>
        <Tag color="red" style={{ marginLeft: 8, fontSize: 11 }}>Admin only</Tag>
      </div>

      <Row gutter={[24, 24]}>

        {/* Users table */}
        <Col span={16}>
          <Card
            title={`Users (${users.length})`}
            size="small"
            extra={
              <Button size="small" onClick={fetchUsers} loading={loading}>
                Refresh
              </Button>
            }
          >
            <Table<User>
              dataSource={users}
              columns={columns}
              rowKey="id"
              size="small"
              pagination={false}
              loading={loading}
            />
            <Text type="secondary" style={{ fontSize: 11, marginTop: 10, display: 'block' }}>
              The last remaining active admin account cannot be deleted or disabled.
              Viewer accounts can access all equipment pages but not this Users page.
            </Text>
          </Card>
        </Col>

        {/* Add user form */}
        <Col span={8}>
          <Card
            title={<><PlusOutlined style={{ marginRight: 6 }} />Add User</>}
            size="small"
          >
            <Form form={addForm} layout="vertical" size="small" onFinish={addUser}>
              <Form.Item
                name="username" label="Username"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="john.doe" autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="display_name" label="Display Name"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="John Doe" />
              </Form.Item>
              <Form.Item name="role" label="Role" initialValue="viewer">
                <Select options={[
                  { value: 'viewer', label: 'Viewer — equipment pages only' },
                  { value: 'admin',  label: 'Admin — can manage users' },
                ]} />
              </Form.Item>
              <Form.Item
                name="password" label="Initial Password"
                rules={[
                  { required: true, message: 'Required' },
                  { min: 6, message: 'Min 6 characters' },
                ]}
              >
                <Input.Password placeholder="Min 6 characters" autoComplete="new-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" size="small" block icon={<PlusOutlined />}>
                Create User
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>

      {/* Reset password modal */}
      <Modal
        title={<><KeyOutlined style={{ marginRight: 8 }} />Reset Password — {resetModal.name}</>}
        open={resetModal.open}
        onOk={doResetPassword}
        onCancel={() => { setResetModal({ open: false, userId: null, name: '' }); setNewPw('') }}
        okText="Set New Password"
      >
        <Text style={{ display: 'block', marginBottom: 12, color: '#595959' }}>
          Enter a new password for this user (minimum 6 characters):
        </Text>
        <Input.Password
          value={newPw}
          onChange={e => setNewPw(e.target.value)}
          placeholder="New password"
          autoComplete="new-password"
          onPressEnter={doResetPassword}
        />
      </Modal>
    </div>
  )
}

export default UsersPage
