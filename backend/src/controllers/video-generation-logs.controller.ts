import type { Context } from 'koa'

import type { VideoGenerationLogService, VideoGenerationLogStatus } from '../services/video-generation-log.service'
import { ok } from '../utils/http'

export class VideoGenerationLogsController {
  public constructor(private readonly service: VideoGenerationLogService) {}

  public list = async (
    ctx: Context,
    query: {
      taskId?: number
      stage?: string
      status?: VideoGenerationLogStatus
      dateFrom?: string
      dateTo?: string
      page?: number
      pageSize?: number
    }
  ) => {
    ctx.body = ok(await this.service.list(Number(ctx.state.projectId), query))
  }

  public deleteRange = async (ctx: Context, input: { dateFrom: string; dateTo: string }) => {
    ctx.body = ok(await this.service.deleteRange(Number(ctx.state.projectId), input))
  }
}
