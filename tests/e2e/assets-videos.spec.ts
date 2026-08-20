import { expect, test } from '@playwright/test'

import { mockNarrixApi, seedAdminSession } from './support/narrix-fixtures'

test.beforeEach(async ({ page }) => {
  await seedAdminSession(page)
  await mockNarrixApi(page)
})

test('素材页本地素材不显示审核状态，上传弹窗保留必填校验', async ({ page }) => {
  await page.goto('/assets')

  const localAssetCard = page.locator('.ant-card').filter({ has: page.getByText('本地角色A') }).first()
  await expect(localAssetCard.getByText('未同步火山')).toBeVisible()
  await expect(localAssetCard.getByText('待审核')).toHaveCount(0)
  await expect(localAssetCard.getByText('审核中')).toHaveCount(0)
  await expect(localAssetCard.getByText('已通过')).toHaveCount(0)

  await page.getByRole('button', { name: '上传素材' }).click()
  await page.getByRole('button', { name: '开始上传' }).click()

  await expect(page.getByText('请输入素材名称')).toBeVisible()
  await expect(page.getByText('请选择素材组')).toBeVisible()
})

test('视频页可预览首尾帧，任务提示词保持两行折叠样式', async ({ page }) => {
  await page.goto('/videos')

  await expect(page.getByText('全能参考', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '选择首帧' }).click()
  await page.getByRole('button', { name: '使用素材 已同步首帧' }).click()
  const firstFramePreview = page.getByAltText('首帧预览')
  await expect(firstFramePreview).toBeVisible()
  await expect(page.getByText('已选画面预览')).toBeVisible()
  await expect(firstFramePreview).toHaveCSS('object-fit', 'contain')

  await page.getByRole('button', { name: '选择尾帧' }).click()
  await page.getByRole('button', { name: '使用素材 尾帧参考' }).click()
  await expect(page.getByAltText('尾帧预览')).toBeVisible()

  const promptTitle = page.getByLabel('完整提示词')
  const promptStyle = (await promptTitle.getAttribute('style')) ?? ''
  const promptMetrics = await promptTitle.evaluate((element) => {
    const target = element as HTMLElement
    const computedStyle = window.getComputedStyle(target)
    return {
      clientHeight: target.clientHeight,
      scrollHeight: target.scrollHeight,
      lineHeight: Number.parseFloat(computedStyle.lineHeight),
    }
  })

  expect(promptStyle).toContain('display: -webkit-box')
  expect(promptStyle).toContain('overflow: hidden')
  expect(promptStyle).toContain('max-height: 2.9em')
  expect(promptMetrics.clientHeight).toBeLessThanOrEqual(promptMetrics.lineHeight * 2 + 4)
  expect(promptMetrics.scrollHeight).toBeGreaterThan(promptMetrics.clientHeight)

  await promptTitle.hover()
  await expect(
    page.getByText('这是一个很长的提示词，用来验证视频生产列表中的文案会被限制为两行显示，并通过悬浮方式查看完整内容。')
  ).toHaveCount(2)
})

test('视频页全能参考模式会展示已选参考素材预览卡片', async ({ page }) => {
  await page.goto('/videos')

  await page.getByRole('radio', { name: '全能参考模式' }).click()
  await page.getByRole('button', { name: '添加参考素材' }).click()
  await page.getByRole('button', { name: '使用素材 已同步首帧' }).click()
  await page.getByRole('button', { name: '添加参考素材' }).click()
  await page.getByRole('button', { name: '使用素材 尾帧参考' }).click()

  await expect(page.getByText('已选参考素材')).toBeVisible()
  await expect(page.getByAltText('已同步首帧 预览')).toBeVisible()
  await expect(page.getByAltText('尾帧参考 预览')).toBeVisible()
})
