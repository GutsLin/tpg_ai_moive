import type { Page, Route } from '@playwright/test'

const svgDataUrl = (label: string, bg = '#dbeafe') =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160">
      <rect width="240" height="160" rx="24" fill="${bg}" />
      <text x="120" y="88" text-anchor="middle" font-size="20" font-family="Arial, sans-serif" fill="#0f172a">${label}</text>
    </svg>
  `)}`

const ok = <T,>(data: T) => ({
  code: 200,
  data,
  message: 'ok',
})

const failure = (status: number, message: string) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify({
    code: status,
    message,
  }),
})

export const seedAdminSession = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'admin-token')
    localStorage.setItem(
      'auth-user',
      JSON.stringify({
        id: 1,
        username: 'admin',
        role: 'admin',
        menuPerms: ['assets', 'videos', 'analytics', 'projects', 'users', 'config'],
        status: 1,
      })
    )
    localStorage.setItem(
      'auth-projects',
      JSON.stringify([
        { id: 101, name: '都市逆袭', code: 'urban-rise', status: 'active', projectRole: 'manager' },
        { id: 202, name: '星际探险', code: 'space-quest', status: 'active', projectRole: 'manager' },
      ])
    )
    localStorage.setItem('active-project-id', '101')
    localStorage.setItem('active-project-role', 'manager')
  })
}

export const mockNarrixApi = async (page: Page) => {
  const brand = {
    systemName: '银河漫剧',
    logoUrl: svgDataUrl('银河漫剧', '#fde68a'),
  }

  const projects = [
    {
      id: 101,
      name: '都市逆袭',
      code: 'urban-rise',
      status: 'active',
      description: '都市成长题材',
      coverAssetId: null,
      createdBy: 1,
      memberCount: 2,
      assetCount: 3,
      taskCount: 2,
      createdAt: '2026-04-07T09:00:00.000Z',
      updatedAt: '2026-04-07T09:00:00.000Z',
    },
    {
      id: 202,
      name: '星际探险',
      code: 'space-quest',
      status: 'active',
      description: '太空冒险题材',
      coverAssetId: null,
      createdBy: 1,
      memberCount: 1,
      assetCount: 2,
      taskCount: 1,
      createdAt: '2026-04-06T09:00:00.000Z',
      updatedAt: '2026-04-06T09:00:00.000Z',
    },
  ]

  const users = [
    {
      id: 1,
      username: 'admin',
      role: 'admin',
      menuPerms: ['assets', 'videos', 'analytics', 'projects', 'users', 'config'],
      status: 1,
      projects: [],
      createdAt: '2026-04-07T09:00:00.000Z',
      updatedAt: '2026-04-07T09:00:00.000Z',
    },
    {
      id: 2,
      username: 'operator',
      role: 'user',
      menuPerms: ['assets', 'videos'],
      status: 1,
      projects: [
        {
          id: 101,
          name: '都市逆袭',
          code: 'urban-rise',
          status: 'active',
          projectRole: 'member',
        },
      ],
      createdAt: '2026-04-07T09:00:00.000Z',
      updatedAt: '2026-04-07T09:00:00.000Z',
    },
  ]

  const categories = [
    { id: 1, name: '角色', sortOrder: 1, syncEnabled: false, arkGroupId: null, assetCount: 1 },
    { id: 2, name: '场景', sortOrder: 2, syncEnabled: true, arkGroupId: 'group-scene', assetCount: 2 },
  ]

  const assets = [
    {
      id: 11,
      name: '本地角色A',
      assetType: 'Image',
      categoryId: 1,
      groupSyncEnabled: false,
      syncMode: 'disabled',
      effectiveSync: false,
      projectIds: [101],
      projectNames: ['都市逆袭'],
      ossKey: 'assets/local-role-a.png',
      sourceUrl: svgDataUrl('本地角色A', '#d1fae5'),
      thumbnailUrl: svgDataUrl('本地角色A', '#d1fae5'),
      arkGroupId: null,
      arkAssetId: null,
      arkStatus: 'pending',
      arkError: null,
      tags: ['角色'],
      createdAt: '2026-04-07T09:00:00.000Z',
      updatedAt: '2026-04-07T09:00:00.000Z',
    },
    {
      id: 12,
      name: '已同步首帧',
      assetType: 'Image',
      categoryId: 2,
      groupSyncEnabled: true,
      syncMode: 'inherit',
      effectiveSync: true,
      projectIds: [101],
      projectNames: ['都市逆袭'],
      ossKey: 'assets/frame-start.png',
      sourceUrl: svgDataUrl('首帧', '#bfdbfe'),
      thumbnailUrl: svgDataUrl('首帧', '#bfdbfe'),
      arkGroupId: 'group-scene',
      arkAssetId: 'asset-frame-start',
      arkStatus: 'active',
      arkError: null,
      tags: ['首帧'],
      createdAt: '2026-04-07T09:00:00.000Z',
      updatedAt: '2026-04-07T09:00:00.000Z',
    },
    {
      id: 13,
      name: '尾帧参考',
      assetType: 'Image',
      categoryId: 2,
      groupSyncEnabled: true,
      syncMode: 'inherit',
      effectiveSync: true,
      projectIds: [101],
      projectNames: ['都市逆袭'],
      ossKey: 'assets/frame-end.png',
      sourceUrl: svgDataUrl('尾帧', '#fbcfe8'),
      thumbnailUrl: svgDataUrl('尾帧', '#fbcfe8'),
      arkGroupId: 'group-scene',
      arkAssetId: 'asset-frame-end',
      arkStatus: 'active',
      arkError: null,
      tags: ['尾帧'],
      createdAt: '2026-04-07T09:00:00.000Z',
      updatedAt: '2026-04-07T09:00:00.000Z',
    },
    {
      id: 14,
      name: '参考配乐',
      assetType: 'Audio',
      categoryId: 2,
      groupSyncEnabled: true,
      syncMode: 'inherit',
      effectiveSync: true,
      projectIds: [101],
      projectNames: ['都市逆袭'],
      ossKey: 'assets/reference-bgm.mp3',
      sourceUrl: 'https://signed.example.com/assets/reference-bgm.mp3',
      thumbnailUrl: svgDataUrl('配乐', '#ddd6fe'),
      arkGroupId: 'group-scene',
      arkAssetId: 'asset-ref-audio',
      arkStatus: 'active',
      arkError: null,
      tags: ['配乐'],
      createdAt: '2026-04-07T09:00:00.000Z',
      updatedAt: '2026-04-07T09:00:00.000Z',
    },
  ]

  const videos = [
    {
      id: 31,
      userId: 1,
      projectId: 101,
      status: 'processing',
      mode: 'omni',
      model: 'doubao-seedance-2-0-260128',
      prompt:
        '这是一个很长的提示词，用来验证视频生产列表中的文案会被限制为两行显示，并通过悬浮方式查看完整内容。',
      promptRaw:
        '这是一个很长的提示词，用来验证视频生产列表中的文案会被限制为两行显示，并通过悬浮方式查看完整内容。',
      duration: 5,
      ratio: '16:9',
      resolution: '720p',
      generateAudio: true,
      createdAt: '2026-04-07T09:00:00.000Z',
      updatedAt: '2026-04-07T09:00:00.000Z',
      errorMessage: null,
      videoUrl: null,
      completionTokens: null,
      totalTokens: null,
      elapsedSeconds: 18,
      estimatedTotalSeconds: 42,
      estimateSampleSize: 12,
    },
    {
      id: 32,
      userId: 1,
      projectId: 101,
      status: 'succeeded',
      mode: 'frames',
      model: 'doubao-seedance-2-0-fast-260128',
      prompt: '雨夜街头，人物转身望向镜头。',
      promptRaw: '雨夜街头，人物转身望向镜头。',
      duration: 5,
      ratio: '16:9',
      resolution: '720p',
      generateAudio: true,
      createdAt: '2026-04-07T08:40:00.000Z',
      updatedAt: '2026-04-07T08:41:00.000Z',
      errorMessage: null,
      videoUrl: 'https://signed.example.com/videos/task-32.mp4',
      completionTokens: 980,
      totalTokens: 1200,
      elapsedSeconds: null,
      estimatedTotalSeconds: null,
      estimateSampleSize: null,
    },
    {
      id: 33,
      userId: 2,
      projectId: 101,
      status: 'failed',
      mode: 'omni',
      model: 'doubao-seedance-2-0-260128',
      prompt: '失败任务也需要纳入 Token 统计。',
      promptRaw: '失败任务也需要纳入 Token 统计。',
      duration: 8,
      ratio: '9:16',
      resolution: '720p',
      generateAudio: false,
      createdAt: '2026-04-07T07:10:00.000Z',
      updatedAt: '2026-04-07T07:12:00.000Z',
      errorMessage: '火山任务执行失败',
      videoUrl: null,
      completionTokens: 220,
      totalTokens: 350,
      elapsedSeconds: null,
      estimatedTotalSeconds: null,
      estimateSampleSize: null,
    },
  ]

  const session = {
    user: {
      id: 1,
      username: 'admin',
      role: 'admin',
      menuPerms: ['assets', 'videos', 'analytics', 'projects', 'users', 'config'],
      status: 1,
    },
    projects: [
      { id: 101, name: '都市逆袭', code: 'urban-rise', status: 'active', projectRole: 'manager' },
      { id: 202, name: '星际探险', code: 'space-quest', status: 'active', projectRole: 'manager' },
    ],
    activeProjectId: 101,
  }

  const fulfillJson = async (route: Route, data: unknown) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok(data)),
    })

  await page.route(
    (url) => {
      try {
        return new URL(url).pathname.startsWith('/api/')
      } catch {
        return false
      }
    },
    async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    const method = request.method()
    const body = request.postDataJSON?.() ?? null

    if (pathname === '/api/setup/status' && method === 'GET') {
      return fulfillJson(route, {
        initialized: true,
        environment: 'development',
        version: '1.0.0',
        installMode: 'self_hosted',
        initializedAt: '2026-04-07T08:00:00.000Z',
        branding: { systemName: brand.systemName },
        health: {
          database: true,
          redis: true,
        },
      })
    }

    if (pathname === '/api/config/branding' && method === 'GET') {
      return fulfillJson(route, brand)
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      if (body?.username === 'admin' && body?.password === 'pass12345') {
        return fulfillJson(route, {
          token: 'admin-token',
          user: session.user,
          projects: session.projects,
          activeProjectId: session.activeProjectId,
        })
      }

      return route.fulfill(failure(401, '用户名或密码错误'))
    }

    if (pathname === '/api/auth/session' && method === 'GET') {
      return fulfillJson(route, session)
    }

    if (pathname === '/api/projects' && method === 'GET') {
      return fulfillJson(route, { items: projects })
    }

    if (pathname === '/api/projects' && method === 'POST') {
      const nextProject = {
        id: 300 + projects.length,
        name: body.name,
        code: `PRJ-202604-00030${projects.length}`,
        status: 'active',
        description: body.description ?? null,
        coverAssetId: null,
        createdBy: 1,
        memberCount: 0,
        assetCount: 0,
        taskCount: 0,
        createdAt: '2026-04-07T10:00:00.000Z',
        updatedAt: '2026-04-07T10:00:00.000Z',
      }
      projects.unshift(nextProject)
      return fulfillJson(route, nextProject)
    }

    if (/^\/api\/projects\/\d+$/.test(pathname) && method === 'PATCH') {
      const id = Number(pathname.split('/').pop())
      const target = projects.find((item) => item.id === id)
      if (!target) {
        return route.fulfill(failure(404, '项目不存在'))
      }
      Object.assign(target, {
        name: body.name ?? target.name,
        description: body.description ?? target.description,
        updatedAt: '2026-04-07T10:30:00.000Z',
      })
      return fulfillJson(route, target)
    }

    if (/^\/api\/projects\/\d+$/.test(pathname) && method === 'DELETE') {
      const id = Number(pathname.split('/').pop())
      const target = projects.find((item) => item.id === id)
      if (!target) {
        return route.fulfill(failure(404, '项目不存在'))
      }
      target.status = 'archived'
      target.updatedAt = '2026-04-07T10:40:00.000Z'
      return fulfillJson(route, target)
    }

    if (/^\/api\/projects\/\d+\/members$/.test(pathname) && method === 'GET') {
      return fulfillJson(route, {
        items: [
          {
            projectId: 101,
            userId: 2,
            username: 'operator',
            projectRole: 'member',
            status: 'active',
          },
        ],
      })
    }

    if (/^\/api\/projects\/\d+\/members$/.test(pathname) && method === 'PUT') {
      return fulfillJson(route, {
        items: (body.members ?? []).map((member: { userId: number; projectRole: string }) => ({
          projectId: 101,
          userId: member.userId,
          username: users.find((item) => item.id === member.userId)?.username ?? `user-${member.userId}`,
          projectRole: member.projectRole,
          status: 'active',
        })),
      })
    }

    if (pathname === '/api/users' && method === 'GET') {
      const status = url.searchParams.get('status')
      const filteredUsers = status === null ? users : users.filter((item) => String(item.status) === status)
      return fulfillJson(route, {
        items: filteredUsers,
        total: filteredUsers.length,
        page: Number(url.searchParams.get('page') ?? 1),
        pageSize: Number(url.searchParams.get('pageSize') ?? 20),
      })
    }

    if (pathname === '/api/users' && method === 'POST') {
      const nextUser = {
        id: 100 + users.length,
        username: body.username,
        role: body.role,
        menuPerms: body.menuPerms,
        status: 1,
        projects: (body.projects ?? []).map((project: { projectId: number; projectRole: string }) => {
          const targetProject = projects.find((item) => item.id === project.projectId)
          return {
            id: project.projectId,
            name: targetProject?.name ?? `项目${project.projectId}`,
            code: targetProject?.code ?? `project-${project.projectId}`,
            status: targetProject?.status ?? 'active',
            projectRole: project.projectRole,
          }
        }),
        createdAt: '2026-04-07T10:20:00.000Z',
        updatedAt: '2026-04-07T10:20:00.000Z',
      }
      users.push(nextUser)
      return fulfillJson(route, nextUser)
    }

    if (/^\/api\/users\/\d+$/.test(pathname) && method === 'PATCH') {
      const id = Number(pathname.split('/').pop())
      const target = users.find((item) => item.id === id)
      if (!target) {
        return route.fulfill(failure(404, '用户不存在'))
      }
      Object.assign(target, {
        role: body.role ?? target.role,
        menuPerms: body.menuPerms ?? target.menuPerms,
        status: body.status ?? target.status,
        projects: body.projects
          ? body.projects.map((project: { projectId: number; projectRole: string }) => {
              const targetProject = projects.find((item) => item.id === project.projectId)
              return {
                id: project.projectId,
                name: targetProject?.name ?? `项目${project.projectId}`,
                code: targetProject?.code ?? `project-${project.projectId}`,
                status: targetProject?.status ?? 'active',
                projectRole: project.projectRole,
              }
            })
          : target.projects,
        updatedAt: '2026-04-07T10:25:00.000Z',
      })
      return fulfillJson(route, target)
    }

    if (/^\/api\/users\/\d+$/.test(pathname) && method === 'DELETE') {
      const id = Number(pathname.split('/').pop())
      const target = users.find((item) => item.id === id)
      if (!target) {
        return route.fulfill(failure(404, '用户不存在'))
      }
      target.status = 0
      target.updatedAt = '2026-04-07T10:30:00.000Z'
      return fulfillJson(route, target)
    }

    if (pathname === '/api/asset-categories' && method === 'GET') {
      return fulfillJson(route, { items: categories })
    }

    if (pathname === '/api/assets' && method === 'GET') {
      let filtered = [...assets]
      const keyword = url.searchParams.get('keyword')
      const assetType = url.searchParams.get('assetType')

      if (keyword) {
        filtered = filtered.filter((item) => item.name.includes(keyword))
      }
      if (assetType) {
        filtered = filtered.filter((item) => item.assetType === assetType)
      }

      return fulfillJson(route, {
        items: filtered,
        total: filtered.length,
        scope: 'project',
      })
    }

    if (pathname === '/api/videos' && method === 'GET') {
      const mine = url.searchParams.get('mine') === 'true'
      const items = mine ? videos.filter((item) => item.userId === 1) : videos
      return fulfillJson(route, {
        items,
        total: items.length,
      })
    }

    if (pathname === '/api/videos/analytics' && method === 'GET') {
      const mine = url.searchParams.get('mine') === 'true'
      const status = url.searchParams.get('status')
      const model = url.searchParams.get('model')
      let items = mine ? videos.filter((item) => item.userId === 1) : [...videos]

      if (status) {
        items = items.filter((item) => item.status === status)
      }

      if (model) {
        items = items.filter((item) => item.model === model)
      }

      const totalRequests = items.length
      const succeededItems = items.filter((item) => item.status === 'succeeded')
      const totalTokensConsumed = items.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0)
      const totalTokensSucceeded = succeededItems.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0)
      const totalDuration = items.reduce((sum, item) => sum + (item.duration ?? 0), 0)
      const userMap = new Map<number, { userId: number; userName: string; requestCount: number; totalTokens: number }>()

      items.forEach((item) => {
        const current = userMap.get(item.userId) ?? {
          userId: item.userId,
          userName: item.userId === 1 ? 'admin' : 'operator',
          requestCount: 0,
          totalTokens: 0,
        }
        current.requestCount += 1
        current.totalTokens += item.totalTokens ?? 0
        userMap.set(item.userId, current)
      })

      return fulfillJson(route, {
        overview: {
          totalRequests,
          successRate: totalRequests > 0 ? succeededItems.length / totalRequests : 0,
          avgDurationSeconds: totalRequests > 0 ? totalDuration / totalRequests : 0,
          totalTokensConsumed,
          totalTokensSucceeded,
          avgTokensPerTask: totalRequests > 0 ? totalTokensConsumed / totalRequests : 0,
        },
        statusDistribution: ['pending', 'processing', 'succeeded', 'failed']
          .map((currentStatus) => ({
            status: currentStatus,
            count: items.filter((item) => item.status === currentStatus).length,
          }))
          .filter((item) => item.count > 0),
        modelDistribution: Array.from(
          items.reduce((map, item) => {
            map.set(item.model, (map.get(item.model) ?? 0) + 1)
            return map
          }, new Map<string, number>())
        ).map(([currentModel, count]) => ({
          model: currentModel,
          count,
        })),
        userTokenDistribution: Array.from(userMap.values()).map((item) => ({
          ...item,
          shareRatio: totalTokensConsumed > 0 ? item.totalTokens / totalTokensConsumed : 0,
        })),
      })
    }

    if (pathname === '/api/videos' && method === 'POST') {
      const nextTask = {
        id: 500 + videos.length,
        userId: 1,
        projectId: 101,
        status: 'pending',
        mode: body.mode,
        model: body.model,
        prompt: body.prompt,
        promptRaw: body.promptRaw,
        duration: body.duration,
        ratio: body.ratio,
        resolution: body.resolution,
        generateAudio: body.generateAudio,
        createdAt: '2026-04-07T10:35:00.000Z',
        updatedAt: '2026-04-07T10:35:00.000Z',
        errorMessage: null,
        videoUrl: null,
      }
      videos.unshift(nextTask)
      return fulfillJson(route, nextTask)
    }

    return route.fulfill(failure(404, `未处理的 mock 接口: ${method} ${pathname}`))
    }
  )

  return {
    brand,
    projects,
    users,
    categories,
    assets,
    videos,
  }
}
