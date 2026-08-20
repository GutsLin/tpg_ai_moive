import { Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'

import {
  archiveProject,
  createProject,
  getProjectMembers,
  getProjects,
  replaceProjectMembers,
  updateProject,
  type ProjectItem,
  type ProjectRole,
} from '../../api/projects'
import { getUsers } from '../../api/users'
import { PageHeader } from '../../components/PageHeader'
import { useAuth } from '../../stores/auth'

const projectRoleOptions: Array<{ label: string; value: ProjectRole }> = [
  { label: '管理员', value: 'manager' },
  { label: '成员', value: 'member' },
  { label: '只读', value: 'viewer' },
]

const roleGuideItems: Array<{ key: ProjectRole; title: string; visible: string; actions: string }> = [
  {
    key: 'manager',
    title: '管理员',
    visible: '可看当前项目全部素材与全部视频',
    actions: '可上传素材、编辑素材、删除素材、创建视频任务',
  },
  {
    key: 'member',
    title: '成员',
    visible: '仅可看自己上传的素材与自己创建的视频',
    actions: '可上传素材、编辑自己可见素材、创建自己的视频任务，不可删除素材',
  },
  {
    key: 'viewer',
    title: '只读',
    visible: '可看当前项目全部素材与全部视频',
    actions: '不可上传素材、编辑素材、删除素材、创建任务',
  },
]

type ProjectModalMode = 'create' | 'edit'

export const ProjectsPage = () => {
  const { refreshSession } = useAuth()
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [projectMemberOptions, setProjectMemberOptions] = useState<Array<{ label: string; value: number }>>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [membersLoading, setMembersLoading] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()
  const [modalOpen, setModalOpen] = useState(false)
  const [membersModalOpen, setMembersModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null)
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null)
  const [form] = Form.useForm<{
    name: string
    description?: string
  }>()
  const [membersForm] = Form.useForm<{ members: Array<{ userId: number; projectRole: ProjectRole }> }>()

  const projectModalMode: ProjectModalMode = editingProject ? 'edit' : 'create'

  const loadProjects = async () => {
    setLoading(true)
    try {
      const result = await getProjects()
      setProjects(result.items ?? [])
    } catch {
      void messageApi.error('加载项目列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProjects()
  }, [])

  const closeModal = () => {
    setModalOpen(false)
    setEditingProject(null)
    form.resetFields()
  }

  const closeMembersModal = () => {
    setMembersModalOpen(false)
    setSelectedProject(null)
    membersForm.resetFields()
  }

  const openCreateModal = () => {
    setEditingProject(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEditModal = (project: ProjectItem) => {
    setEditingProject(project)
    form.setFieldsValue({
      name: project.name,
      description: project.description ?? undefined,
    })
    setModalOpen(true)
  }

  const openMembersModal = async (project: ProjectItem) => {
    setSelectedProject(project)
    setMembersModalOpen(true)
    setMembersLoading(true)

    try {
      const [membersResult, usersResult] = await Promise.all([
        getProjectMembers(project.id),
        getUsers({ page: 1, pageSize: 100, status: 1 }),
      ])

      const memberOptionMap = new Map<number, { label: string; value: number }>()

      for (const user of usersResult.items) {
        memberOptionMap.set(user.id, {
          label: user.username,
          value: user.id,
        })
      }

      for (const member of membersResult.items) {
        memberOptionMap.set(member.userId, {
          label: member.username,
          value: member.userId,
        })
      }

      setProjectMemberOptions(Array.from(memberOptionMap.values()))
      membersForm.setFieldsValue({
        members: membersResult.items.map((member) => ({
          userId: member.userId,
          projectRole: member.projectRole,
        })),
      })
    } catch {
      void messageApi.error('加载项目成员失败')
    } finally {
      setMembersLoading(false)
    }
  }

  const handleSubmit = async (values: { name: string; description?: string }) => {
    setSaving(true)
    try {
      if (projectModalMode === 'create') {
        await createProject({
          name: values.name.trim(),
          description: values.description?.trim() || null,
        })
        void messageApi.success('项目创建成功')
      } else if (editingProject) {
        await updateProject(editingProject.id, {
          name: values.name.trim(),
          description: values.description?.trim() || null,
        })
        void messageApi.success('项目更新成功')
      }

      closeModal()
      await loadProjects()
    } catch (error: any) {
      void messageApi.error(error?.response?.data?.message ?? '保存项目失败')
    } finally {
      setSaving(false)
    }
  }

  const handleArchive = (project: ProjectItem) => {
    Modal.confirm({
      title: '归档项目',
      content: `确认归档「${project.name}」？归档后项目不会物理删除，但默认不再参与生产。`,
      okText: '确认归档',
      cancelText: '取消',
      onOk: async () => {
        setSaving(true)
        try {
          await archiveProject(project.id)
          void messageApi.success('项目已归档')
          await loadProjects()
        } catch (error: any) {
          void messageApi.error(error?.response?.data?.message ?? '归档项目失败')
        } finally {
          setSaving(false)
        }
      },
    })
  }

  const handleReplaceMembers = async (values: { members: Array<{ userId: number; projectRole: ProjectRole }> }) => {
    if (!selectedProject) {
      return
    }

    setSaving(true)
    try {
      await replaceProjectMembers(selectedProject.id, {
        members: values.members ?? [],
      })
      await refreshSession()
      void messageApi.success('项目成员已更新')
      closeMembersModal()
      await loadProjects()
    } catch (error: any) {
      void messageApi.error(error?.response?.data?.message ?? '更新项目成员失败')
    } finally {
      setSaving(false)
    }
  }

  const projectStats = useMemo(
    () =>
      projects.reduce(
        (accumulator, project) => ({
          total: accumulator.total + 1,
          active: accumulator.active + (project.status === 'active' ? 1 : 0),
          archived: accumulator.archived + (project.status === 'archived' ? 1 : 0),
        }),
        { total: 0, active: 0, archived: 0 }
      ),
    [projects]
  )

  return (
    <>
      {contextHolder}
      <Space orientation="vertical" size={20} style={{ width: '100%' }}>
        <PageHeader
          title="项目管理"
          description="这里统一维护项目台账、归档状态和项目成员。创建项目后不再自动授权，成员设置需要手动完成。"
          actions={
            <Button type="primary" onClick={openCreateModal}>
              新建项目
            </Button>
          }
        />

        <Card
          style={{
            borderRadius: 28,
            border: '1px solid rgba(15, 23, 42, 0.08)',
            background: 'rgba(255, 250, 243, 0.78)',
            boxShadow: '0 24px 64px rgba(15, 23, 42, 0.06)',
          }}
        >
          <Space orientation="vertical" size={20} style={{ width: '100%' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12,
              }}
            >
              {[
                { label: '项目总数', value: projectStats.total },
                { label: '活跃项目', value: projectStats.active },
                { label: '已归档', value: projectStats.archived },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    borderRadius: 22,
                    padding: '16px 18px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <Typography.Text type="secondary">{item.label}</Typography.Text>
                  <Typography.Title level={4} style={{ margin: '10px 0 0' }}>
                    {item.value}
                  </Typography.Title>
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              {roleGuideItems.map((item) => (
                <div
                  key={item.key}
                  style={{
                    borderRadius: 22,
                    padding: '16px 18px',
                    background: 'rgba(255,255,255,0.88)',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <Typography.Text strong>{item.title}</Typography.Text>
                  <Typography.Paragraph style={{ margin: '8px 0 6px' }}>{item.visible}</Typography.Paragraph>
                  <Typography.Text type="secondary">{item.actions}</Typography.Text>
                </div>
              ))}
            </div>

            <Table<ProjectItem>
              rowKey="id"
              loading={loading}
              dataSource={projects}
              pagination={false}
              columns={[
                {
                  title: '项目',
                  key: 'project',
                  render: (_value: unknown, record) => (
                    <Space orientation="vertical" size={2}>
                      <Typography.Text strong>{record.name}</Typography.Text>
                      <Typography.Text type="secondary">{record.code}</Typography.Text>
                      {record.description ? (
                        <Typography.Text type="secondary">{record.description}</Typography.Text>
                      ) : null}
                    </Space>
                  ),
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  render: (value: ProjectItem['status']) => (
                    <Tag color={value === 'active' ? 'green' : 'default'}>{value === 'active' ? '启用' : '归档'}</Tag>
                  ),
                },
                {
                  title: '统计',
                  key: 'summary',
                  render: (_value: unknown, record) => (
                    <Space size={[8, 8]} wrap>
                      <Tag>成员 {record.memberCount}</Tag>
                      <Tag>素材 {record.assetCount}</Tag>
                      <Tag>任务 {record.taskCount}</Tag>
                    </Space>
                  ),
                },
                {
                  title: '更新时间',
                  dataIndex: 'updatedAt',
                  render: (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false }),
                },
                {
                  title: '操作',
                  key: 'actions',
                  render: (_value: unknown, record) => (
                    <Space wrap>
                      <Button onClick={() => openEditModal(record)}>编辑项目</Button>
                      <Button onClick={() => void openMembersModal(record)}>成员设置</Button>
                      <Button danger disabled={record.status === 'archived'} onClick={() => handleArchive(record)}>
                        归档项目
                      </Button>
                    </Space>
                  ),
                },
              ]}
            />
          </Space>
        </Card>
      </Space>

      <Modal
        open={modalOpen}
        title={projectModalMode === 'create' ? '新建项目' : `编辑项目 · ${editingProject?.name ?? ''}`}
        okText="保存项目"
        cancelText="取消"
        confirmLoading={saving}
        destroyOnHidden
        forceRender
        onCancel={closeModal}
        onOk={() => {
          void form.submit()
        }}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label="项目名称"
            name="name"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input id="project-name" aria-label="项目名称" placeholder="请输入项目名称" />
          </Form.Item>

          <Form.Item label="项目编码">
            <Input value="系统自动生成，例如 PRJ-202604-000123" disabled />
          </Form.Item>

          <Form.Item label="项目描述" name="description">
            <Input.TextArea id="project-description" aria-label="项目描述" rows={4} placeholder="可选，补充项目背景和边界" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        width={720}
        open={membersModalOpen}
        title={selectedProject ? `项目成员设置 · ${selectedProject.name}` : '项目成员设置'}
        okText="保存成员"
        cancelText="取消"
        confirmLoading={saving}
        onCancel={closeMembersModal}
        onOk={() => void membersForm.submit()}
      >
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            当前项目变更会实时影响左下角项目切换范围和视频、素材的可见范围。
          </Typography.Text>
          <Form form={membersForm} layout="vertical" onFinish={handleReplaceMembers}>
            <Form.List name="members">
              {(fields, { add, remove }) => (
                <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                  {fields.map((field, index) => {
                    const { key, ...fieldProps } = field

                    return (
                    <Card key={key} size="small" loading={membersLoading}>
                      <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Form.Item
                          {...fieldProps}
                          name={[field.name, 'userId']}
                          label="用户"
                          rules={[{ required: true, message: '请选择用户' }]}
                          style={{ minWidth: 260, marginBottom: 0 }}
                        >
                          <Select
                            aria-label={`成员用户-${index + 1}`}
                            showSearch
                            optionFilterProp="label"
                            options={projectMemberOptions}
                            placeholder="选择用户"
                          />
                        </Form.Item>
                        <Form.Item
                          {...fieldProps}
                          name={[field.name, 'projectRole']}
                          label="项目角色"
                          rules={[{ required: true, message: '请选择项目角色' }]}
                          style={{ width: 180, marginBottom: 0 }}
                        >
                          <Select aria-label={`成员角色-${index + 1}`} options={projectRoleOptions} />
                        </Form.Item>
                        <Button danger onClick={() => remove(field.name)}>
                          移除
                        </Button>
                      </Space>
                    </Card>
                    )
                  })}
                  <Button onClick={() => add({ projectRole: 'member' })}>添加成员</Button>
                </Space>
              )}
            </Form.List>
          </Form>
        </Space>
      </Modal>
    </>
  )
}
