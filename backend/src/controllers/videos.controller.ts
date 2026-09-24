import type { Context } from 'koa'

import type { VideoService } from '../services/video.service'
import { ok } from '../utils/http'

export class VideosController {
  public constructor(private readonly videoService: VideoService) {}

  public create = async (
    ctx: Context,
    payload: {
      providerKey?: string
      mode: 'frames' | 'omni'
      model: string
      operation: 'generate' | 'edit' | 'extend'
      outputFormat: 'mp4' | 'mov'
      prompt: string
      promptRaw: string
      duration: number
      ratio: string
      resolution: string
      generateAudio: boolean
      content: any[]
    }
  ) => {
    ctx.body = ok(
      await this.videoService.createVideoTask({
        ...payload,
        userId: Number(ctx.state.user?.sub),
        userRole: ctx.state.user?.role ?? 'user',
        projectId: Number(ctx.state.projectId),
        projectRole: ctx.state.projectRole ?? null,
      })
    )
  }

  public provider = async (ctx: Context) => {
    ctx.body = ok(await this.videoService.getActiveProvider())
  }

  public list = async (
    ctx: Context,
    query: {
      mine?: boolean
      status?: 'pending' | 'processing' | 'succeeded' | 'failed'
      mode?: 'frames' | 'omni'
      q?: string
      dateFrom?: string
      dateTo?: string
      page?: number
      pageSize?: number
    }
  ) => {
    ctx.body = ok(
      await this.videoService.listVideoTasks(
        {
          userId: Number(ctx.state.user?.sub),
          projectId: Number(ctx.state.projectId),
          projectRole: ctx.state.projectRole ?? null,
        },
        query
      )
    )
  }

  public detail = async (ctx: Context, id: number) => {
    ctx.body = ok(
      await this.videoService.getVideoTask(id, {
        userId: Number(ctx.state.user?.sub),
        projectId: Number(ctx.state.projectId),
        projectRole: ctx.state.projectRole ?? null,
      })
    )
  }

  public sync = async (ctx: Context, id: number) => {
    ctx.body = ok(
      await this.videoService.syncVideoTaskStatus(id, {
        userId: Number(ctx.state.user?.sub),
        projectId: Number(ctx.state.projectId),
        projectRole: ctx.state.projectRole ?? null,
      })
    )
  }

  public analytics = async (
    ctx: Context,
    query: {
      mine?: boolean
      dateFrom?: string
      dateTo?: string
      model?: string
      status?: 'pending' | 'processing' | 'succeeded' | 'failed'
    }
  ) => {
    ctx.body = ok(
      await this.videoService.getVideoAnalytics(
        {
          userId: Number(ctx.state.user?.sub),
          userRole: ctx.state.user?.role ?? 'user',
          projectId: Number(ctx.state.projectId),
          projectRole: ctx.state.projectRole ?? null,
        },
        query
      )
    )
  }

  public exportAnalytics = async (
    ctx: Context,
    query: {
      mine?: boolean
      dateFrom?: string
      dateTo?: string
      model?: string
      status?: 'pending' | 'processing' | 'succeeded' | 'failed'
      scope?: 'current' | 'all'
    }
  ) => {
    const result = await this.videoService.exportVideoAnalytics(
      {
        userId: Number(ctx.state.user?.sub),
        userRole: ctx.state.user?.role ?? 'user',
        projectId: Number(ctx.state.projectId),
        projectRole: ctx.state.projectRole ?? null,
      },
      query
    )

    ctx.status = 200
    ctx.set('Content-Type', 'text/csv; charset=utf-8')
    ctx.set(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"; filename*=UTF-8''${encodeURIComponent(result.utf8FileName)}`
    )
    ctx.set('Cache-Control', 'no-store')
    ctx.body = result.csv
  }

  public exportTaskDetails = async (
    ctx: Context,
    query: {
      dateFrom: string
      dateTo: string
      mine?: boolean
      scope?: 'current' | 'all'
    }
  ) => {
    const result = await this.videoService.exportVideoTaskDetails(
      {
        userId: Number(ctx.state.user?.sub),
        userRole: ctx.state.user?.role ?? 'user',
        projectId: Number(ctx.state.projectId),
        projectRole: ctx.state.projectRole ?? null,
      },
      query
    )

    ctx.status = 200
    ctx.set('Content-Type', 'text/csv; charset=utf-8')
    ctx.set(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"; filename*=UTF-8''${encodeURIComponent(result.utf8FileName)}`
    )
    ctx.set('Cache-Control', 'no-store')
    ctx.body = result.csv
  }
}
