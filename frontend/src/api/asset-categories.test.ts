import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestDelete } = vi.hoisted(() => ({
  requestDelete: vi.fn(),
}))

vi.mock('../utils/request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: requestDelete,
  },
}))

import { deleteAssetCategory } from './asset-categories'

describe('deleteAssetCategory', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('删除非空素材组时同时通过 query 和 body 传递迁移目标', async () => {
    requestDelete.mockResolvedValue({
      data: {
        affectedAssets: 2,
        deleted: true,
        targetCategoryId: 2,
      },
    })

    await deleteAssetCategory(1, { targetCategoryId: 2 })

    expect(requestDelete).toHaveBeenCalledWith('/api/asset-categories/1?targetCategoryId=2', {
      data: { targetCategoryId: 2 },
    })
  })

  it('迁移到未分类时保留 body 中的 null 语义', async () => {
    requestDelete.mockResolvedValue({
      data: {
        affectedAssets: 2,
        deleted: true,
        targetCategoryId: null,
      },
    })

    await deleteAssetCategory(1, { targetCategoryId: null })

    expect(requestDelete).toHaveBeenCalledWith('/api/asset-categories/1', {
      data: { targetCategoryId: null },
    })
  })
})
