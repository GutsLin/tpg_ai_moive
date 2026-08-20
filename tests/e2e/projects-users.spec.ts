import { expect, test } from '@playwright/test'

import { mockNarrixApi, seedAdminSession } from './support/narrix-fixtures'

test.beforeEach(async ({ page }) => {
  await seedAdminSession(page)
  await mockNarrixApi(page)
})

test('项目创建后无需重新登录即可在列表中看到', async ({ page }) => {
  await page.goto('/projects')

  await expect(page.getByRole('heading', { name: '项目管理' })).toBeVisible()
  await page.getByRole('button', { name: '新建项目' }).click()
  await page.getByLabel('项目名称').fill('广告企划')
  await page.getByRole('button', { name: '保存项目' }).click()

  await expect(page.getByText('广告企划')).toBeVisible()
})

test('新建项目不会自动进入当前项目切换范围，仍需手动授权', async ({ page }) => {
  await page.goto('/projects')

  await page.getByRole('button', { name: '新建项目' }).click()
  await page.getByLabel('项目名称').fill('新建未授权项目')
  await page.getByRole('button', { name: '保存项目' }).click()

  await expect(page.getByText('新建未授权项目')).toBeVisible()

  await page.getByRole('button', { name: '当前项目' }).click()
  await expect(page.locator('.app-shell-project-menu').getByText('新建未授权项目')).toHaveCount(0)
})

test('普通用户创建时必须授权项目，授权后可正常保存', async ({ page }) => {
  await page.goto('/users')

  await page.getByRole('button', { name: '新建用户' }).click()
  await page.getByLabel('用户名').fill('producer')
  await page.getByLabel('初始密码').fill('pass12345')
  await page.getByRole('button', { name: '创建用户' }).click()

  await expect(page.getByText('普通用户至少授权一个项目')).toBeVisible()

  await page.getByRole('button', { name: '新增项目授权' }).click()
  await page.getByLabel('项目-1').click()
  await page.getByText('都市逆袭 (urban-rise)').click()
  await page.getByRole('button', { name: '创建用户' }).click()

  await expect(page.getByText('producer')).toBeVisible()
})

test('编辑用户切换为普通用户后菜单权限自动联动，删除后默认列表不再显示', async ({ page }) => {
  await page.goto('/users')

  await page.getByRole('button', { name: /编\s*辑/ }).nth(1).click()
  const dialog = page.getByRole('dialog', { name: '编辑用户 · operator' })
  await page.getByLabel('平台角色').click()
  await page.locator('.ant-select-item-option').filter({ hasText: /^普通用户$/ }).click()

  await expect(dialog.getByLabel('菜单权限')).toBeDisabled()
  await expect(dialog.getByText('素材管理')).toBeVisible()
  await expect(dialog.getByText('视频生成')).toBeVisible()

  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(page.getByText('用户已更新')).toBeVisible()

  await page.getByRole('row', { name: /operator/ }).getByRole('button', { name: '删 除' }).click()
  await page.getByRole('button', { name: '确 认' }).click()

  await expect(page.getByText('用户已删除')).toBeVisible()
  await expect(page.getByRole('row', { name: /operator/ })).toHaveCount(0)
})

test('项目成员设置中展示用户名，并可修改项目角色', async ({ page }) => {
  await page.goto('/projects')

  await page.getByRole('button', { name: '成员设置' }).first().click()
  await expect(page.getByText('operator')).toBeVisible()

  await page.getByLabel('成员角色-1').click()
  await page.locator('.ant-select-item-option').filter({ hasText: /^管理员$/ }).click()
  await page.getByRole('button', { name: '保存成员' }).click()

  await expect(page.getByText('项目成员已更新')).toBeVisible()
})
