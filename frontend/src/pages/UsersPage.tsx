import React, { useState, useEffect } from 'react'
import {
  Card, Row, Col, Table, Tag, Button, Form, Input, Select, message,
  Space, Typography, Popconfirm, Modal, Switch, DatePicker, Upload,
} from 'antd'
import {
  TeamOutlined, PlusOutlined, KeyOutlined, DeleteOutlined, ClockCircleOutlined,
  UploadOutlined, DownloadOutlined,
} from '@ant-design/icons'
import dayjs, { Dayjs } from 'dayjs'
import { authHeaders, getStoredUser } from '../auth'
import { expiryTag } from '../utils/expiry'

const { Title, Text } = Typography

interface User {
  id:                   number
  username:             string
  display_name:         string
  role:                 string
  enabled:              boolean
  created_at:           string
  password_expires_at:  string | null
}

interface AddFormValues {
  username:             string
  password:             string
  display_name:         string
  role:                 string
  password_expires_at?: Dayjs
}

const UsersPage: React.FC = () => {
  const currentUser = getStoredUser()
  const [users,    setUsers   ] = useState<User[]>([])
  const [loading,  setLoading ] = useState(false)
  const [addForm]               = Form.useForm<AddFormValues>()
  const [resetModal, setResetModal] = useState<{ open: boolean; userId: number | null; name: string }>({
    open: false, userId: null, name: '',
  })
  const [newPw, setNewPw] = useState('')
  const [expiryModal, setExpiryModal] = useState<{ open: boolean; userId: number | null; name: string }>({
    open: false, userId: null, name: '',
  })
  const [expiryDate, setExpiryDate] = useState<Dayjs | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<null | {
    summary: { total: number; created: number; updated: number; errors: number }
    default_password: string
    results: { row: number; username: string; action: string; detail: string }[]
  }>(null)

  async function fetchUsers() {
    setLoading(true)
    try {
      const res = await fetch('/api/users', { headers: authHeaders() })
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
      const res = await fetch('/api/users', {
        method:  'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...values,
          password_expires_at: values.password_expires_at
            ? values.password_expires_at.format('YYYY-MM-DD')
            : undefined,
        }),
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
      const res = await fetch(`/api/users/${id}`, {
        method:  'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
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
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE', headers: authHeaders() })
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
      const res = await fetch(`/api/users/${resetModal.userId}/reset-password`, {
        method:  'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
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

  async function saveExpiry(clear: boolean) {
    if (!expiryModal.userId) return
    if (!clear && !expiryDate) {
      message.warning('Pick a date, or use "Clear expiry"')
      return
    }
    try {
      const res = await fetch(`/api/users/${expiryModal.userId}`, {
        method:  'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify(
          clear
            ? { clear_password_expiry: true }
            : { password_expires_at: expiryDate!.format('YYYY-MM-DD') }
        ),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error((err as { detail?: string }).detail || 'Failed')
      }
      message.success(clear ? `Expiry cleared for ${expiryModal.name}` : `Expiry updated for ${expiryModal.name}`)
      setExpiryModal({ open: false, userId: null, name: '' })
      setExpiryDate(null)
      fetchUsers()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Failed to update expiry')
    }
  }

  async function doImport() {
    if (!importFile) { message.warning('Choose a file first'); return }
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', importFile)
      // Don't set Content-Type — the browser adds the multipart boundary itself.
      const res = await fetch('/api/users/import', { method: 'POST', headers: authHeaders(), body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { detail?: string }).detail || 'Import failed')
      setImportResult(data)
      const { created, updated, errors } = data.summary
      message.success(`Import complete — ${created} created, ${updated} updated, ${errors} error(s)`)
      fetchUsers()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  function downloadTemplate() {
    const sample = 'username,display_name,role,password,password_expires_at\n'
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'users-template.csv'
    a.click()
    URL.revokeObjectURL(url)
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
          disabled={u.username === currentUser?.username}
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
      title: 'Password Expiry', dataIndex: 'password_expires_at', key: 'expiry', width: 150,
      render: (v: string | null, u: User) => {
        const tag = expiryTag(v)
        return (
          <Space size={4}>
            {tag
              ? <Tag color={tag.color} style={{ fontSize: 11 }}>{tag.text}</Tag>
              : <Text type="secondary" style={{ fontSize: 12 }}>No expiry</Text>}
            <Button
              size="small" type="text" icon={<ClockCircleOutlined />}
              onClick={() => {
                setExpiryModal({ open: true, userId: u.id, name: u.display_name })
                setExpiryDate(v ? dayjs(v) : null)
              }}
            />
          </Space>
        )
      },
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
            disabled={u.username === currentUser?.username}
          >
            <Button
              size="small" danger icon={<DeleteOutlined />}
              disabled={u.username === currentUser?.username}
            >
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <TeamOutlined style={{ fontSize: 20, color: '#096dd9' }} />
        <Title level={3} style={{ margin: 0 }}>User Management</Title>
        <Tag color="red" style={{ marginLeft: 8, fontSize: 11 }}>Admin only</Tag>
      </div>

      {/* Users table */}
      <Card
        title={`Users (${users.length})`}
        size="small"
        extra={
          <Space>
            <Button size="small" icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
              Import
            </Button>
            <Button size="small" onClick={fetchUsers} loading={loading}>
              Refresh
            </Button>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <Table<User>
          dataSource={users}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={false}
          loading={loading}
          scroll={{ x: 880 }}
        />
        <Text type="secondary" style={{ fontSize: 11, marginTop: 10, display: 'block' }}>
          You cannot delete or disable your own account.
          Viewer accounts can access all equipment pages but not this Users page.
        </Text>
      </Card>

      {/* Add user form */}
      <Card
        title={<><PlusOutlined style={{ marginRight: 6 }} />Add User</>}
        size="small"
      >
        <Form form={addForm} layout="vertical" size="small" onFinish={addUser}>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={5}>
              <Form.Item
                name="username" label="Username"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="john.doe" autoComplete="off" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Form.Item
                name="display_name" label="Display Name"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="John Doe" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Form.Item name="role" label="Role" initialValue="viewer">
                <Select options={[
                  { value: 'viewer', label: 'Viewer' },
                  { value: 'admin',  label: 'Admin' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Form.Item
                name="password" label="Initial Password"
                rules={[
                  { required: true, message: 'Required' },
                  { min: 6, message: 'Min 6 characters' },
                ]}
              >
                <Input.Password placeholder="Min 6 characters" autoComplete="new-password" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Form.Item
                name="password_expires_at" label="Password Expires On (optional)"
              >
                <DatePicker
                  style={{ width: '100%' }}
                  format="DD-MM-YYYY"
                  disabledDate={(d) => d.isBefore(dayjs().startOf('day'))}
                  placeholder="No expiry"
                />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" size="small" icon={<PlusOutlined />}>
            Create User
          </Button>
        </Form>
      </Card>

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

      {/* Password expiry modal */}
      <Modal
        title={<><ClockCircleOutlined style={{ marginRight: 8 }} />Password Expiry — {expiryModal.name}</>}
        open={expiryModal.open}
        onCancel={() => { setExpiryModal({ open: false, userId: null, name: '' }); setExpiryDate(null) }}
        footer={[
          <Button key="clear" onClick={() => saveExpiry(true)}>Clear expiry</Button>,
          <Button key="save" type="primary" onClick={() => saveExpiry(false)}>Set expiry</Button>,
        ]}
      >
        <Text style={{ display: 'block', marginBottom: 12, color: '#595959' }}>
          Password stops working at midnight (UK time) at the start of the chosen day:
        </Text>
        <DatePicker
          style={{ width: '100%' }}
          format="DD-MM-YYYY"
          value={expiryDate}
          onChange={setExpiryDate}
          disabledDate={(d) => d.isBefore(dayjs().startOf('day'))}
          placeholder="No expiry"
        />
      </Modal>

      {/* Bulk CSV import modal */}
      <Modal
        title={<><UploadOutlined style={{ marginRight: 8 }} />Import Users — CSV</>}
        open={importOpen}
        width={700}
        onCancel={() => { setImportOpen(false); setImportFile(null); setImportResult(null) }}
        footer={[
          <Button key="close" onClick={() => { setImportOpen(false); setImportFile(null); setImportResult(null) }}>
            Close
          </Button>,
          <Button key="go" type="primary" loading={importing} disabled={!importFile} onClick={doImport}>
            Import
          </Button>,
        ]}
      >
        <Text style={{ display: 'block', marginBottom: 10, color: '#595959' }}>
          Columns: <Text code>username</Text> (required), <Text code>display_name</Text>, <Text code>role</Text> (viewer/admin),{' '}
          <Text code>password</Text>, <Text code>password_expires_at</Text> (DD-MM-YYYY). Existing usernames are <b>updated</b> (a
          blank password keeps the current one); new users with a blank password get the default password.
        </Text>
        <Space style={{ marginBottom: 12 }} wrap>
          <Text type="secondary" style={{ fontSize: 12 }}>Template:</Text>
          <Button size="small" icon={<DownloadOutlined />} onClick={downloadTemplate}>
            Download CSV template
          </Button>
        </Space>
        <Upload.Dragger
          accept=".csv"
          maxCount={1}
          multiple={false}
          beforeUpload={(f) => { setImportFile(f); setImportResult(null); return false }}
          onRemove={() => setImportFile(null)}
          fileList={importFile ? [{ uid: '1', name: importFile.name, status: 'done' }] : []}
        >
          <p className="ant-upload-drag-icon" style={{ marginBottom: 4 }}><UploadOutlined /></p>
          <p className="ant-upload-text">Click or drag a .csv file here</p>
        </Upload.Dragger>

        {importResult && (
          <div style={{ marginTop: 16 }}>
            <Space size={8} wrap>
              <Tag color="blue">Total {importResult.summary.total}</Tag>
              <Tag color="green">Created {importResult.summary.created}</Tag>
              <Tag color="gold">Updated {importResult.summary.updated}</Tag>
              <Tag color={importResult.summary.errors ? 'red' : 'default'}>Errors {importResult.summary.errors}</Tag>
            </Space>
            <Text type="secondary" style={{ display: 'block', margin: '8px 0', fontSize: 12 }}>
              New users imported without a password use the default: <Text code>{importResult.default_password}</Text>
            </Text>
            <Table
              size="small"
              pagination={false}
              rowKey="row"
              dataSource={importResult.results}
              scroll={{ y: 220 }}
              columns={[
                { title: 'Row', dataIndex: 'row', width: 55 },
                { title: 'Username', dataIndex: 'username', render: (v: string) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text> },
                {
                  title: 'Action', dataIndex: 'action', width: 90,
                  render: (a: string) => <Tag color={a === 'created' ? 'green' : a === 'updated' ? 'gold' : a === 'error' ? 'red' : 'default'}>{a}</Tag>,
                },
                { title: 'Detail', dataIndex: 'detail', render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}

export default UsersPage
