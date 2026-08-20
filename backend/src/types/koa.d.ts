import 'koa'
import type pino from 'pino'
import type { ProjectAccessRecord, ProjectRole } from '../services/project-access.service'

export interface AuthenticatedUser {
  sub: string
  role: 'admin' | 'user'
}

declare module 'koa' {
  interface DefaultState {
    logger?: pino.Logger
    user?: AuthenticatedUser
    projectId?: number | null
    projectRole?: ProjectRole | null
    project?: ProjectAccessRecord | null
    globalProjectView?: boolean
  }
}
