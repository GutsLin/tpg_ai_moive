import { expect, test } from '@playwright/test'

import { mockNarrixApi, seedAdminSession } from './support/narrix-fixtures'

test.beforeEach(async ({ page }) => {
  await seedAdminSession(page)
  await mockNarrixApi(page)
})

test('视频提交前会弹出二次确认，取消后保留表单，确认后才真正发起创建请求', async ({ page }) => {
  let submitCount = 0
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (request.method() === 'POST' && url.pathname === '/api/videos') {
      submitCount += 1
    }
  })

  await page.goto('/videos')

  await page.getByRole('button', { name: '选择首帧' }).click()
  await page.getByRole('button', { name: '使用素材 已同步首帧' }).click()
  await page.getByLabel('首尾帧提示词').fill('镜头缓慢推进，角色在雨夜里回头。')

  await page.getByRole('button', { name: '开始生成' }).click()
  const dialog = page.getByRole('dialog', { name: '生成参数确认' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('首尾帧模式')).toBeVisible()
  await expect(dialog.getByText('镜头缓慢推进，角色在雨夜里回头。')).toBeVisible()
  expect(submitCount).toBe(0)

  await dialog.getByRole('button', { name: '返回编辑' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByLabel('首尾帧提示词')).toHaveValue('镜头缓慢推进，角色在雨夜里回头。')
  expect(submitCount).toBe(0)

  await page.getByRole('button', { name: '开始生成' }).click()
  await page.getByRole('button', { name: '确认提交' }).click()

  await expect(page.getByText('生成任务已提交')).toBeVisible()
  expect(submitCount).toBe(1)
  await expect(page.getByLabel('完整提示词').getByText('镜头缓慢推进，角色在雨夜里回头。')).toBeVisible()
})

test('数据统计页展示概览与分布模块，并支持切换到仅看我的统计', async ({ page }) => {
  await page.goto('/analytics')

  await expect(page.getByRole('heading', { name: '数据统计' })).toBeVisible()
  await expect(page.getByText('总请求次数')).toBeVisible()
  await expect(page.getByText('任务状态分布')).toBeVisible()
  await expect(page.getByText('模型使用分布')).toBeVisible()
  await expect(page.getByText('用户 Token 分布')).toBeVisible()
  await expect(page.getByRole('heading', { name: '3', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '1.6K', exact: true })).toBeVisible()

  await page.getByRole('button', { name: '仅看我的' }).click()
  await page.getByRole('button', { name: '更新统计' }).click()

  await expect(page.getByRole('heading', { name: '2', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '1.2K', exact: true }).first()).toBeVisible()
  await expect(page.getByText('admin · 2 次')).toBeVisible()
})
