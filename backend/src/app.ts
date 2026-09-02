import 'dotenv/config'

import cors from '@koa/cors'
import Router from '@koa/router'
import Koa from 'koa'
import bodyParser from 'koa-bodyparser'

import { errorHandler } from './middleware/error-handler'
import { requestLoggerMiddleware } from './middleware/request-logger'
import { setupGuard } from './middleware/setup-guard'
import { createAssetCategoriesRouter } from './routes/asset-categories.routes'
import { createAssetsRouter } from './routes/assets.routes'
import { createAuthRouter } from './routes/auth.routes'
import { createConfigRouter } from './routes/config.routes'
import { createProjectsRouter } from './routes/projects.routes'
import { createSetupRouter } from './routes/setup.routes'
import { createUserApiKeysRouter } from './routes/user-api-keys.routes'
import { createUsersRouter } from './routes/users.routes'
import { createVideoGenerationLogsRouter } from './routes/video-generation-logs.routes'
import { createVideosRouter } from './routes/videos.routes'
import { createAtelierRouter } from './routes/atelier.routes'
import type { ArkAssetClient } from './lib/ark-aksk'
import { ProviderAssetClient } from './lib/toapis-avatar'
import { type AssetDispatcher, type AssetRepository } from './services/asset.service'
import { type AssetCategoryRepository } from './services/asset-category.service'
import { ConfigService, type ConfigStore } from './services/config.service'
import { OssService, type OssServiceContract } from './services/oss.service'
import type { ProjectAccessRepository } from './services/project-access.service'
import type { ProjectMemberRepository, ProjectRepository } from './services/project.service'
import { SetupService, type SetupServiceContract } from './services/setup.service'
import { UserApiKeyService } from './services/user-api-key.service'
import { UserService, type UserProjectRepository, type UserRepository } from './services/user.service'
import {
  KyselyVideoGenerationLogRepository,
  NoopVideoGenerationLogRepository,
  VideoGenerationLogger,
  type VideoGenerationLogRepository,
} from './services/video-generation-log.service'
import { type VideoDispatcher, type VideoRepository } from './services/video.service'
import type { VideoAssetReferenceResolver } from './services/video.service'
import { VideoProviderService } from './services/video-provider.service'
import { appLogger } from './utils/logger'
import { BullMqAssetDispatcher } from './workers/asset-sync.worker'
import { BullMqVideoDispatcher } from './workers/video.worker'
import { BullMqAtelierImageDispatcher } from './workers/atelier-image.worker'

export interface AppDependencies {
  userRepository?: UserRepository
  configStore?: ConfigStore
  projectRepository?: ProjectRepository
  projectMemberRepository?: ProjectMemberRepository
  projectAccessRepository?: ProjectAccessRepository
  userProjectRepository?: UserProjectRepository
  assetCategoryRepository?: AssetCategoryRepository
  assetCategoryArkClient?: ArkAssetClient
  assetRepository?: AssetRepository
  assetDispatcher?: AssetDispatcher
  videoRepository?: VideoRepository
  videoDispatcher?: VideoDispatcher
  videoAssetReferenceResolver?: VideoAssetReferenceResolver
  videoGenerationLogRepository?: VideoGenerationLogRepository
  ossService?: OssServiceContract
  setupService?: SetupServiceContract
  atelierImageDispatcher?: import('./services/atelier-image.service').AtelierImageDispatcher
}

export const createApp = (dependencies: AppDependencies = {}): Koa => {
  const app = new Koa()
  const router = new Router()
  const userService = new UserService({
    repository: dependencies.userRepository,
    projectAccessRepository: dependencies.projectAccessRepository,
    userProjectRepository: dependencies.userProjectRepository,
  })
  const configService = new ConfigService({
    store: dependencies.configStore,
  })
  const ossService = dependencies.ossService ?? new OssService(configService)
  const setupService =
    dependencies.setupService ?? (process.env.NODE_ENV === 'test' ? undefined : new SetupService())
  const assetDispatcher = dependencies.assetDispatcher ?? new BullMqAssetDispatcher()
  const videoDispatcher = dependencies.videoDispatcher ?? new BullMqVideoDispatcher()
  const atelierImageDispatcher = dependencies.atelierImageDispatcher ?? new BullMqAtelierImageDispatcher()
  const videoGenerationLogRepository =
    dependencies.videoGenerationLogRepository ??
    (process.env.NODE_ENV === 'test'
      ? new NoopVideoGenerationLogRepository()
      : new KyselyVideoGenerationLogRepository())
  const videoGenerationLogger = new VideoGenerationLogger(videoGenerationLogRepository)
  const authRouter = createAuthRouter(userService)
  const assetCategoriesRouter = createAssetCategoriesRouter(
    dependencies.assetCategoryRepository,
    assetDispatcher,
    ossService,
    dependencies.projectAccessRepository,
    dependencies.assetCategoryArkClient
  )
  const assetsRouter = createAssetsRouter(
    dependencies.assetRepository,
    assetDispatcher,
    ossService,
    dependencies.projectAccessRepository
  )
  const videosRouter = createVideosRouter(
    dependencies.videoRepository,
    videoDispatcher,
    ossService,
    dependencies.configStore,
    dependencies.projectAccessRepository,
    dependencies.videoAssetReferenceResolver,
    videoGenerationLogger
  )
  const videoGenerationLogsRouter = createVideoGenerationLogsRouter(
    videoGenerationLogRepository,
    dependencies.projectAccessRepository
  )
  const configRouter = createConfigRouter(configService, ossService)
  const projectsRouter = createProjectsRouter(dependencies.projectRepository, dependencies.projectMemberRepository)
  const atelierRouter = createAtelierRouter(assetDispatcher, dependencies.configStore, dependencies.projectAccessRepository, atelierImageDispatcher)
  const setupRouter = setupService ? createSetupRouter(setupService) : null
  const usersRouter = createUsersRouter(userService)
  const userApiKeysRouter = createUserApiKeysRouter(
    new UserApiKeyService(configService),
    configService,
    new VideoProviderService(configService)
  )

  app.use(errorHandler())
  app.use(requestLoggerMiddleware())
  app.use(cors())
  app.use(bodyParser())
  if (setupService) {
    app.use(setupGuard(setupService))
  }

  router.get('/health', (ctx) => {
    ctx.status = 200
    ctx.body = {
      code: 0,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
      },
      message: 'ok',
    }
  })

  if (setupRouter) {
    app.use(setupRouter.routes())
    app.use(setupRouter.allowedMethods())
  }
  app.use(authRouter.routes())
  app.use(authRouter.allowedMethods())
  app.use(assetCategoriesRouter.routes())
  app.use(assetCategoriesRouter.allowedMethods())
  app.use(assetsRouter.routes())
  app.use(assetsRouter.allowedMethods())
  app.use(videosRouter.routes())
  app.use(videosRouter.allowedMethods())
  app.use(videoGenerationLogsRouter.routes())
  app.use(videoGenerationLogsRouter.allowedMethods())
  app.use(configRouter.routes())
  app.use(configRouter.allowedMethods())
  app.use(usersRouter.routes())
  app.use(usersRouter.allowedMethods())
  app.use(userApiKeysRouter.routes())
  app.use(userApiKeysRouter.allowedMethods())
  app.use(projectsRouter.routes())
  app.use(projectsRouter.allowedMethods())
  app.use(atelierRouter.routes())
  app.use(atelierRouter.allowedMethods())
  app.use(router.routes())
  app.use(router.allowedMethods())

  return app
}

const app = createApp()

if (require.main === module) {
  const port = Number(process.env.PORT ?? '3000')
  app.listen(port, () => {
    appLogger.info({ port }, 'HTTP server started')
  })
}

export default app
