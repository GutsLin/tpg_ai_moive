import type { Context } from 'koa'

import type { AssetCategoryService } from '../services/asset-category.service'
import type { OssServiceContract } from '../services/oss.service'
import { ok } from '../utils/http'

export class AssetCategoriesController {
  public constructor(
    private readonly assetCategoryService: AssetCategoryService,
    private readonly ossService: OssServiceContract
  ) {}

  public list = async (ctx: Context) => {
    ctx.body = ok(
      await this.assetCategoryService.listCategories(Number(ctx.state.projectId), {
        userId: Number(ctx.state.user?.sub),
        projectRole: ctx.state.projectRole ?? null,
      })
    )
  }

  public create = async (ctx: Context, payload: { name: string; sortOrder: number; syncEnabled?: boolean }) => {
    ctx.body = ok(await this.assetCategoryService.createCategory(Number(ctx.state.projectId), payload))
  }

  public update = async (
    ctx: Context,
    id: number,
    payload: { name?: string; sortOrder?: number; syncEnabled?: boolean }
  ) => {
    ctx.body = ok(await this.assetCategoryService.updateCategory(Number(ctx.state.projectId), id, payload))
  }

  public remove = async (ctx: Context, id: number, payload: { targetCategoryId?: number | null }) => {
    ctx.body = ok(await this.assetCategoryService.deleteCategory(Number(ctx.state.projectId), id, payload))
  }

  public getStsToken = async (ctx: Context) => {
    ctx.body = ok(await this.ossService.getStsCredentials())
  }
}
