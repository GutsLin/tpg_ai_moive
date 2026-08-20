import { expect, test } from '@playwright/test'

import { mockNarrixApi } from './support/narrix-fixtures'

test('登录页品牌展示正确，登录后侧栏固定且底部区块可见', async ({ page }) => {
  const { brand } = await mockNarrixApi(page)

  await page.goto('/login')

  await expect(page.getByRole('heading', { name: brand.systemName })).toBeVisible()
  await expect(page.getByAltText(`${brand.systemName} Logo`)).toBeVisible()
  await expect(page).toHaveTitle(`${brand.systemName} 登录`)

  const faviconHref = await page.locator('link[rel="icon"]').getAttribute('href')
  expect(faviconHref).toBe(brand.logoUrl)

  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill('pass12345')
  await page.locator('button[type="submit"]').click()

  await expect(page).toHaveURL(/\/assets$/)
  await expect(page.getByRole('button', { name: '当前项目' })).toContainText('都市逆袭')
  await expect(page.getByLabel('admin 账号菜单')).toBeVisible()

  const siderInfo = await page.locator('.app-shell-sider').evaluate((element) => {
    const style = window.getComputedStyle(element)
    const footer = document.querySelector('.app-shell-footer') as HTMLElement | null

    return {
      position: style.position,
      height: element.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
      footerVisible: footer !== null && footer.getBoundingClientRect().height > 0,
    }
  })

  expect(siderInfo.position).toBe('sticky')
  expect(siderInfo.height).toBeGreaterThan(siderInfo.viewportHeight * 0.8)
  expect(siderInfo.footerVisible).toBeTruthy()
})
