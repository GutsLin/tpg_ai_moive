import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'

import { getProjects, type ProjectItem, type ProjectRole } from '../../api/projects'
import {
  createUser,
  deleteUser,
  getUsers,
  updateUser,
  type CreateUserPayload,
  type UpdateUserPayload,
  type UserItem,
} from '../../api/users'
import { PageHeader } from '../../components/PageHeader'
import { useAuth } from '../../stores/auth'

const panelStyle = {
  borderRadius: 24,
  border: '1px solid #dbe4ea',
  boxShadow: '0 20px 48px rgba(15, 23, 42, 0.05)',
}

const projectRoleOptions: Array<{ label: string; value: ProjectRole }> = [
  { label: '管理员', value: 'manager' },
  { label: '成员', value: 'member' },
  { label: '只读', value: 'viewer' },
]

const menuPermOptions = [
  { label: '素材管理', value: 'assets' },
  { label: '视频生成', value: 'videos' },
  { label: '数据统计', value: 'analytics' },
  { label: '项目管理', value: 'projects' },
  { label: '用户管理', value: 'users' },
  { label: '生成日志', value: 'logs' },
  { label: '系统配置', value: 'config' },
]

const defaultUserMenuPerms = ['assets', 'videos']
const adminOnlyMenuPerms = new Set(['projects', 'users', 'logs', 'config'])

const projectRoleColorMap: Record<ProjectRole, string> = {
  manager: 'blue',
  member: 'green',
  viewer: 'default',
}

type UserModalMode = 'create' | 'edit'
type UserStatusFilterValue = number | 'all'

export const UsersPage = () => {
  const { state, refreshSession } = useAuth()
  const [users, setUsers] = useState<UserItem[]>([])
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<number | undefined>(1)
  const [submitting, setSubmitting] = useState(false)
  const [userModalOpen, setUserModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)
  const [messageApi, contextHolder] = message.useMessage()
  const [userForm] = Form.useForm<
    CreateUserPayload &
      UpdateUserPayload & {
        username?: string
        role?: 'admin' | 'user'
      }
  >()

  const userModalMode: UserModalMode = editingUser ? 'edit' : 'create'
  const watchedRole = Form.useWatch('role', userForm) ?? editingUser?.role ?? 'user'

  const loadData = async () => {
    setLoading(true)
    try {
      const [userResult, projectResult] = await Promise.all([
        getUsers({ page: 1, pageSize: 50, status: statusFilter }),
        getProjects(),
      ])
      setUsers(userResult.items)
      setProjects(projectResult.items)
    } catch {
      void messageApi.error('加载用户授权数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [statusFilter])

  const projectOptions = useMemo(
    () =>
      projects.map((project) => ({
        label: `${project.name} (${project.code})`,
        value: project.id,
      })),
    [projects]
  )

  const visibleMenuPermOptions = useMemo(
    () =>
      watchedRole === 'admin'
        ? menuPermOptions
        : menuPermOptions.filter((option) => !adminOnlyMenuPerms.has(option.value)),
    [watchedRole]
  )

  const applyRoleDefaults = (role: 'admin' | 'user') => {
    if (role === 'user') {
      const currentMenuPerms = (userForm.getFieldValue('menuPerms') ?? []) as string[]
      const nextMenuPerms = Array.from(new Set([...defaultUserMenuPerms, ...currentMenuPerms.filter((item) => item === 'analytics')]))
      userForm.setFieldValue('menuPerms', nextMenuPerms)
      return
    }

    userForm.setFieldValue(
      'menuPerms',
      menuPermOptions.map((item) => item.value)
    )
  }

  const openCreateUserModal = () => {
    setEditingUser(null)
    userForm.resetFields()
    userForm.setFieldsValue({
      role: 'user',
      menuPerms: defaultUserMenuPerms,
      projects: [],
      status: 1,
    })
    setUserModalOpen(true)
  }

  const openEditUserModal = (user: UserItem) => {
    setEditingUser(user)
    userForm.resetFields()
    userForm.setFieldsValue({
      role: user.role,
      menuPerms: user.menuPerms,
      status: user.status,
      password: '',
      projects: user.projects.map((project) => ({
        projectId: project.id,
        projectRole: project.projectRole,
      })),
    })
    setUserModalOpen(true)
  }

  const closeUserModal = () => {
    setUserModalOpen(false)
    setEditingUser(null)
    userForm.resetFields()
  }

  const handleSubmitUser = async (
    values: CreateUserPayload &
      UpdateUserPayload & {
        username?: string
        role?: 'admin' | 'user'
      }
  ) => {
    const platformRole = values.role ?? editingUser?.role ?? 'user'
    const normalizedProjects = (values.projects ?? [])
      .filter((project): project is NonNullable<typeof values.projects>[number] => Boolean(project?.projectId && project?.projectRole))
      .map((project) => ({
        projectId: project.projectId,
        projectRole: project.projectRole,
      }))
    const menuPerms =
      platformRole === 'admin'
        ? (values.menuPerms ?? menuPermOptions.map((item) => item.value))
        : Array.from(
            new Set([
              ...defaultUserMenuPerms,
              ...((values.menuPerms ?? []).filter((item) => item === 'analytics')),
            ])
          )

    if (platformRole === 'user' && normalizedProjects.length === 0) {
      void messageApi.error('普通用户至少授权一个项目')
      return
    }

    setSubmitting(true)
    try {
      if (userModalMode === 'create') {
        await createUser({
          username: values.username?.trim() ?? '',
          password: values.password ?? '',
          role: platformRole,
          menuPerms,
          projects: normalizedProjects,
        })
        await loadData()
        void messageApi.success('用户已创建')
      } else if (editingUser) {
        await updateUser(editingUser.id, {
          role: platformRole,
          menuPerms,
          status: values.status,
          password: values.password?.trim() ? values.password : undefined,
          projects: normalizedProjects,
        })
        await loadData()
        if (editingUser.id === state.user?.id) {
          await refreshSession()
        }
        void messageApi.success('用户已更新')
      }

      closeUserModal()
    } catch (error: any) {
      void messageApi.error(error?.response?.data?.message ?? '保存用户失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteUser = async (user: UserItem) => {
    try {
      await deleteUser(user.id)
      setUsers((current) => current.filter((item) => item.id !== user.id))
      void messageApi.success('用户已删除')
    } catch (error: any) {
      void messageApi.error(error?.response?.data?.message ?? '删除用户失败')
    }
  }

  return (
    <>
      {contextHolder}
      <Space orientation="vertical" size={20} style={{ width: '100%' }}>
        <PageHeader
          title="用户授权"
          description="这里维护平台角色、菜单权限和项目授权。项目台账与成员设置已整合到主菜单里的项目管理。"
          actions={
            <Button type="primary" onClick={openCreateUserModal}>
              新建用户
            </Button>
          }
        />

        <Card style={panelStyle}>
          <Space orientation="vertical" size={18} style={{ width: '100%' }}>
            <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }} wrap>
              <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                普通用户默认保留“素材管理 + 视频生成”，如需开放看板可额外勾选“数据统计”。
              </Typography.Paragraph>
              <Select
                value={statusFilter ?? 'all'}
                aria-label="用户状态筛选"
                style={{ width: 180 }}
                options={[
                  { label: '仅看启用用户', value: 1 },
                  { label: '仅看禁用用户', value: 0 },
                  { label: '查看全部', value: 'all' },
                ]}
                onChange={(value: UserStatusFilterValue) => setStatusFilter(value === 'all' ? undefined : value)}
              />
            </Space>

            <Table<UserItem>
              rowKey="id"
              loading={loading}
              pagination={false}
              dataSource={users}
              columns={[
                { title: '用户名', dataIndex: 'username' },
                {
                  title: '角色',
                  dataIndex: 'role',
                  render: (value: UserItem['role']) => (
                    <Tag color={value === 'admin' ? 'gold' : 'blue'}>{value === 'admin' ? '管理员' : '普通用户'}</Tag>
                  ),
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  render: (value: number) => (
                    <Tag color={value === 1 ? 'green' : 'default'}>{value === 1 ? '启用' : '禁用'}</Tag>
                  ),
                },
                {
                  title: '菜单权限',
                  dataIndex: 'menuPerms',
                  render: (value: string[]) =>
                    value
                      .map((item) => menuPermOptions.find((option) => option.value === item)?.label ?? item)
                      .join(' / ') || '全部隐藏',
                },
                {
                  title: '项目授权',
                  dataIndex: 'projects',
                  render: (value: UserItem['projects']) =>
                    value.length > 0 ? (
                      <Space size={[8, 8]} wrap>
                        {value.map((project) => (
                          <Tag key={`${project.id}-${project.projectRole}`} color={projectRoleColorMap[project.projectRole]}>
                            {project.name} / {project.projectRole}
                          </Tag>
                        ))}
                      </Space>
                    ) : (
                      <Typography.Text type="secondary">未授权项目</Typography.Text>
                    ),
                },
                {
                  title: '操作',
                  key: 'actions',
                  render: (_value: unknown, record) => (
                    <Space>
                      <Button onClick={() => openEditUserModal(record)}>编辑</Button>
                      <Popconfirm
                        title="删除用户"
                        description={`确认删除「${record.username}」？该操作会做软删除。`}
                        okText="确认"
                        cancelText="取消"
                        onConfirm={() => void handleDeleteUser(record)}
                      >
                        <Button danger>删除</Button>
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
            />
          </Space>
        </Card>
      </Space>

      <Modal
        width={760}
        open={userModalOpen}
        title={userModalMode === 'create' ? '新建用户' : `编辑用户 · ${editingUser?.username ?? ''}`}
        okText={userModalMode === 'create' ? '创建用户' : '保存修改'}
        cancelText="取消"
        confirmLoading={submitting}
        onCancel={closeUserModal}
        onOk={() => void userForm.submit()}
      >
        <Form form={userForm} layout="vertical" onFinish={handleSubmitUser}>
          <Space size={12} style={{ width: '100%' }} wrap>
            {userModalMode === 'create' ? (
              <Form.Item
                name="username"
                label="用户名"
                rules={[{ required: true, message: '请输入用户名' }]}
                style={{ minWidth: 220 }}
              >
                <Input aria-label="用户名" placeholder="例如：producer" />
              </Form.Item>
            ) : (
              <Form.Item label="用户名" style={{ minWidth: 220 }}>
                <Input value={editingUser?.username} aria-label="用户名" disabled />
              </Form.Item>
            )}

            <Form.Item
              name="role"
              label="平台角色"
              rules={[{ required: true, message: '请选择平台角色' }]}
              style={{ width: 180 }}
            >
              <Select
                aria-label="平台角色"
                options={[
                  { label: '管理员', value: 'admin' },
                  { label: '普通用户', value: 'user' },
                ]}
                onChange={(value) => applyRoleDefaults(value)}
              />
            </Form.Item>
          </Space>

          <Form.Item name="menuPerms" label="菜单权限">
            <Select
              aria-label="菜单权限"
              mode="multiple"
              disabled={watchedRole === 'user'}
              options={visibleMenuPermOptions}
              placeholder="选择可访问模块"
            />
          </Form.Item>

          {userModalMode === 'edit' ? (
            <Form.Item name="status" label="账号状态">
              <Select
                aria-label="账号状态"
                options={[
                  { label: '启用', value: 1 },
                  { label: '禁用', value: 0 },
                ]}
              />
            </Form.Item>
          ) : null}

          <Form.Item
            name="password"
            label={userModalMode === 'create' ? '初始密码' : '重置密码'}
            rules={userModalMode === 'create' ? [{ required: true, message: '请输入密码' }] : undefined}
          >
            <Input.Password
              aria-label={userModalMode === 'create' ? '初始密码' : '重置密码'}
              placeholder={userModalMode === 'create' ? '至少 8 位' : '留空表示不修改'}
            />
          </Form.Item>

          <Card size="small" title="项目授权">
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              {watchedRole === 'user' ? (
                <Typography.Text type="secondary">普通用户至少需要授权一个项目。</Typography.Text>
              ) : (
                <Typography.Text type="secondary">管理员也只会看到被授权项目下的数据。</Typography.Text>
              )}
              <Form.List name="projects">
                {(fields, { add, remove }) => (
                  <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                    {fields.map((field, index) => {
                      const { key, ...fieldProps } = field

                      return (
                        <Space key={key} align="start" style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Form.Item
                          {...fieldProps}
                          name={[field.name, 'projectId']}
                          label="项目"
                          rules={[{ required: true, message: '请选择项目' }]}
                          style={{ minWidth: 260, marginBottom: 0 }}
                        >
                          <Select
                            aria-label={`项目-${index + 1}`}
                            showSearch
                            optionFilterProp="label"
                            options={projectOptions}
                            placeholder="选择项目"
                          />
                        </Form.Item>
                        <Form.Item
                          {...fieldProps}
                          name={[field.name, 'projectRole']}
                          label="项目角色"
                          rules={[{ required: true, message: '请选择项目角色' }]}
                          style={{ width: 180, marginBottom: 0 }}
                        >
                          <Select aria-label={`项目角色-${index + 1}`} options={projectRoleOptions} />
                        </Form.Item>
                        <Button danger onClick={() => remove(field.name)}>
                          移除
                        </Button>
                      </Space>
                      )
                    })}
                    <Button onClick={() => add({ projectRole: 'member' })}>新增项目授权</Button>
                  </Space>
                )}
              </Form.List>
            </Space>
          </Card>
        </Form>
      </Modal>
    </>
  )
}
