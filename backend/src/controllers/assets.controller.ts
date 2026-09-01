import type { Context } from 'koa'

import type { AssetService } from '../services/asset.service'
import { ok } from '../utils/http'

export class AssetsController {
  public constructor(private readonly assetService: AssetService) {}

  public create = async (
    ctx: Context,
    payload: {
      projectId?: number
      name: string
      assetType: 'Image' | 'Video' | 'Audio'
      categoryId: number | null
      syncMode?: 'inherit' | 'enabled' | 'disabled'
      ossKey: string
      tags: string[]
      linkProjectIds: number[]
    }
  ) => {
    ctx.body = ok(
      await this.assetService.createAsset({
        ...payload,
        userId: Number(ctx.state.user?.sub),
        userRole: ctx.state.user?.role ?? 'user',
        projectId: Number(ctx.state.projectId),
        projectRole: ctx.state.projectRole ?? null,
      })
    )
  }

  public checkNameAvailable = async (
    ctx: Context,
    query: {
      name: string
      linkProjectIds?: number[]
    }
  ) => {
    ctx.body = ok(
      await this.assetService.checkAssetNameAvailable({
        projectId: Number(ctx.state.projectId),
        name: query.name,
        linkProjectIds: query.linkProjectIds,
      })
    )
  }

  public update = async (
    ctx: Context,
    id: number,
    payload: {
      name?: string
      categoryId?: number | null
      syncMode?: 'inherit' | 'enabled' | 'disabled'
    }
  ) => {
    ctx.body = ok(
      await this.assetService.updateAsset({
        assetId: id,
        userId: Number(ctx.state.user?.sub),
        projectId: Number(ctx.state.projectId),
        projectRole: ctx.state.projectRole ?? null,
        userRole: ctx.state.user?.role ?? 'user',
        ...payload,
      })
    )
  }

  public list = async (ctx: Context, query: any) => {
    ctx.body = ok(
      await this.assetService.listAssets(query, {
        userId: Number(ctx.state.user?.sub),
        userRole: ctx.state.user?.role ?? 'user',
        projectId: Number(ctx.state.projectId),
        projectRole: ctx.state.projectRole ?? null,
      })
    )
  }

  public detail = async (ctx: Context, id: number) => {
    ctx.body = ok(
      await this.assetService.getAsset(id, {
        userId: Number(ctx.state.user?.sub),
        projectId: Number(ctx.state.projectId),
        projectRole: ctx.state.projectRole ?? null,
        scope: 'project',
      })
    )
  }

  public remove = async (ctx: Context, id: number) => {
    ctx.body = ok(
      await this.assetService.deleteAsset({
        assetId: id,
        projectId: Number(ctx.state.projectId),
        projectRole: ctx.state.projectRole ?? null,
        userRole: ctx.state.user?.role ?? 'user',
      })
    )
  }

  public sync = async (ctx: Context) => {
    ctx.body = ok(await this.assetService.syncPendingAssets(Number(ctx.state.projectId)))
  }

  public batchSync = async (ctx: Context, payload: { assetIds: number[] }) => {
    ctx.body = ok(await this.assetService.syncAssetsByIds(payload.assetIds))
  }

  public batchUnsync = async (ctx: Context, payload: { assetIds: number[] }) => {
    ctx.body = ok(await this.assetService.unsyncAssetsByIds(payload.assetIds))
  }

  public linkProjects = async (ctx: Context, id: number, payload: { projectIds: number[] }) => {
    ctx.body = ok(
      await this.assetService.linkAssetProjects({
        assetId: id,
        userId: Number(ctx.state.user?.sub),
        userRole: ctx.state.user?.role ?? 'user',
        currentProjectId: Number(ctx.state.projectId),
        projectIds: payload.projectIds,
      })
    )
  }

  public detachProject = async (ctx: Context, id: number, projectId: number) => {
    ctx.body = ok(
      await this.assetService.detachProjectLink({
        assetId: id,
        userRole: ctx.state.user?.role ?? 'user',
        currentProjectId: Number(ctx.state.projectId),
        projectId,
      })
    )
  }
}
