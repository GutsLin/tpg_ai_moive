import { sql } from 'kysely'

import { db, type Database } from '../db/kysely'
import { NotFoundError, ValidationAppError } from '../utils/errors'
import { isUniqueViolationError } from '../utils/db-errors'
import type { ProjectRole, ProjectStatus } from './project-access.service'

interface DbExecutor {
  selectFrom: typeof db.selectFrom
  updateTable: typeof db.updateTable
  insertInto: typeof db.insertInto
}

export interface ProjectRecord {
  id: number
  name: string
  code: string
  status: ProjectStatus
  description: string | null
  coverAssetId: number | null
  createdBy: number | null
  createdAt: Date
  updatedAt: Date
}

export interface ProjectSummary {
  memberCount: number
  assetCount: number
  taskCount: number
}

export interface ProjectMemberRecord {
  projectId: number
  userId: number
  username: string
  projectRole: ProjectRole
  status: 'active' | 'inactive'
}

export interface ProjectRepository {
  listWithSummary(): Promise<Array<ProjectRecord & ProjectSummary>>
  findWithSummaryById(id: number): Promise<(ProjectRecord & ProjectSummary) | null>
  findByCode(code: string): Promise<ProjectRecord | null>
  nextCodeSequence(): Promise<number>
  create(input: {
    name: string
    code: string
    description: string | null
    coverAssetId: number | null
    createdBy: number | null
  }): Promise<ProjectRecord>
  update(
    id: number,
    input: {
      name?: string
      description?: string | null
      coverAssetId?: number | null
      status?: ProjectStatus
    }
  ): Promise<ProjectRecord | null>
}

export interface ProjectMemberRepository {
  listActiveMembers(projectId: number): Promise<ProjectMemberRecord[]>
  listExistingUserIds(userIds: number[]): Promise<number[]>
  replaceAllMembers(
    projectId: number,
    members: Array<{ userId: number; projectRole: ProjectRole }>,
    operatorUserId: number | null
  ): Promise<ProjectMemberRecord[]>
}

const normalizeDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value))

class KyselyProjectRepository implements ProjectRepository {
  public async listWithSummary(): Promise<Array<ProjectRecord & ProjectSummary>> {
    const rows = await db
      .selectFrom('projects')
      .selectAll('projects')
      .select((eb) => [
        eb
          .selectFrom('project_members')
          .select((innerEb) => innerEb.fn.count<number>('id').as('count'))
          .whereRef('project_members.project_id', '=', 'projects.id')
          .where('project_members.status', '=', 'active')
          .as('memberCount'),
        eb
          .selectFrom('project_assets')
          .select((innerEb) => innerEb.fn.count<number>('id').as('count'))
          .whereRef('project_assets.project_id', '=', 'projects.id')
          .as('assetCount'),
        eb
          .selectFrom('video_tasks')
          .select((innerEb) => innerEb.fn.count<number>('id').as('count'))
          .whereRef('video_tasks.project_id', '=', 'projects.id')
          .as('taskCount'),
      ])
      .orderBy('projects.id', 'asc')
      .execute()

    return rows.map((row) => ({
      ...this.mapRow(row),
      memberCount: Number(row.memberCount),
      assetCount: Number(row.assetCount),
      taskCount: Number(row.taskCount),
    }))
  }

  public async findWithSummaryById(id: number): Promise<(ProjectRecord & ProjectSummary) | null> {
    const row = await db
      .selectFrom('projects')
      .selectAll('projects')
      .select((eb) => [
        eb
          .selectFrom('project_members')
          .select((innerEb) => innerEb.fn.count<number>('id').as('count'))
          .whereRef('project_members.project_id', '=', 'projects.id')
          .where('project_members.status', '=', 'active')
          .as('memberCount'),
        eb
          .selectFrom('project_assets')
          .select((innerEb) => innerEb.fn.count<number>('id').as('count'))
          .whereRef('project_assets.project_id', '=', 'projects.id')
          .as('assetCount'),
        eb
          .selectFrom('video_tasks')
          .select((innerEb) => innerEb.fn.count<number>('id').as('count'))
          .whereRef('video_tasks.project_id', '=', 'projects.id')
          .as('taskCount'),
      ])
      .where('projects.id', '=', id)
      .executeTakeFirst()

    if (!row) {
      return null
    }

    return {
      ...this.mapRow(row),
      memberCount: Number(row.memberCount),
      assetCount: Number(row.assetCount),
      taskCount: Number(row.taskCount),
    }
  }

  public async findByCode(code: string): Promise<ProjectRecord | null> {
    const row = await db.selectFrom('projects').selectAll().where('code', '=', code).executeTakeFirst()
    return row ? this.mapRow(row) : null
  }

  public async nextCodeSequence(): Promise<number> {
    const row = await sql<{ value: string | number }>`select nextval('project_code_global_seq') as value`.execute(db)
    return Number(row.rows[0]?.value ?? 0)
  }

  public async create(input: {
    name: string
    code: string
    description: string | null
    coverAssetId: number | null
    createdBy: number | null
  }): Promise<ProjectRecord> {
    const row = await db
      .insertInto('projects')
      .values({
        name: input.name,
        code: input.code,
        status: 'active',
        description: input.description,
        cover_asset_id: input.coverAssetId,
        created_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return this.mapRow(row)
  }

  public async update(
    id: number,
    input: {
      name?: string
      description?: string | null
      coverAssetId?: number | null
      status?: ProjectStatus
    }
  ): Promise<ProjectRecord | null> {
    const values: Record<string, unknown> = {
      updated_at: new Date(),
    }

    if (input.name !== undefined) {
      values.name = input.name
    }
    if (input.description !== undefined) {
      values.description = input.description
    }
    if (input.coverAssetId !== undefined) {
      values.cover_asset_id = input.coverAssetId
    }
    if (input.status !== undefined) {
      values.status = input.status
    }

    const row = await db.updateTable('projects').set(values).where('id', '=', id).returningAll().executeTakeFirst()
    return row ? this.mapRow(row) : null
  }

  private mapRow(row: {
    id: number
    name: string
    code: string
    status: ProjectStatus
    description: string | null
    cover_asset_id: number | null
    created_by: number | null
    created_at: Date | string
    updated_at: Date | string
  }): ProjectRecord {
    return {
      id: Number(row.id),
      name: row.name,
      code: row.code,
      status: row.status,
      description: row.description,
      coverAssetId: row.cover_asset_id,
      createdBy: row.created_by,
      createdAt: normalizeDate(row.created_at),
      updatedAt: normalizeDate(row.updated_at),
    }
  }
}

class KyselyProjectMemberRepository implements ProjectMemberRepository {
  public async listActiveMembers(projectId: number): Promise<ProjectMemberRecord[]> {
    return await this.listActiveMembersWithExecutor(db, projectId)
  }

  public async listExistingUserIds(userIds: number[]): Promise<number[]> {
    if (userIds.length === 0) {
      return []
    }

    const rows = await db
      .selectFrom('users')
      .select('id')
      .where('id', 'in', userIds)
      .where('status', '=', 1)
      .execute()

    return rows.map((row) => Number(row.id))
  }

  public async replaceAllMembers(
    projectId: number,
    members: Array<{ userId: number; projectRole: ProjectRole }>,
    operatorUserId: number | null
  ): Promise<ProjectMemberRecord[]> {
    return await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('project_members')
        .set({
          status: 'inactive',
          updated_at: new Date(),
        })
        .where('project_id', '=', projectId)
        .execute()

      if (members.length > 0) {
        await trx
          .insertInto('project_members')
          .values(
            members.map((member) => ({
              project_id: projectId,
              user_id: member.userId,
              project_role: member.projectRole,
              status: 'active',
              created_by: operatorUserId,
            }))
          )
          .onConflict((oc) =>
            oc.columns(['project_id', 'user_id']).doUpdateSet({
              project_role: (eb) => eb.ref('excluded.project_role'),
              status: 'active',
              updated_at: new Date(),
            })
          )
          .execute()
      }

      return await this.listActiveMembersWithExecutor(trx, projectId)
    })
  }

  private async listActiveMembersWithExecutor(executor: DbExecutor, projectId: number): Promise<ProjectMemberRecord[]> {
    const rows = await executor
      .selectFrom('project_members')
      .innerJoin('users', 'users.id', 'project_members.user_id')
      .select([
        'project_members.project_id as projectId',
        'project_members.user_id as userId',
        'project_members.project_role as projectRole',
        'project_members.status as status',
        'users.username as username',
      ])
      .where('project_members.project_id', '=', projectId)
      .where('project_members.status', '=', 'active')
      .orderBy('project_members.id', 'asc')
      .execute()

    return rows.map((row) => ({
      projectId: Number(row.projectId),
      userId: Number(row.userId),
      username: row.username,
      projectRole: row.projectRole,
      status: row.status,
    }))
  }
}

export interface ProjectServiceOptions {
  projectRepository?: ProjectRepository
  projectMemberRepository?: ProjectMemberRepository
}

export class ProjectService {
  private static readonly codePrefix = 'PRJ'
  private readonly projectRepository: ProjectRepository
  private readonly projectMemberRepository: ProjectMemberRepository

  public constructor(options: ProjectServiceOptions = {}) {
    this.projectRepository = options.projectRepository ?? new KyselyProjectRepository()
    this.projectMemberRepository = options.projectMemberRepository ?? new KyselyProjectMemberRepository()
  }

  public async listProjects() {
    const items = await this.projectRepository.listWithSummary()
    return {
      items: items.map((item) => this.toProjectSummary(item)),
    }
  }

  public async getProject(id: number) {
    const project = await this.projectRepository.findWithSummaryById(id)
    if (!project) {
      throw new NotFoundError('项目不存在')
    }
    return this.toProjectSummary(project)
  }

  public async createProject(input: {
    name: string
    description: string | null
    coverAssetId: number | null
    operatorUserId: number | null
  }) {
    const code = await this.generateProjectCode()

    let created
    try {
      created = await this.projectRepository.create({
        name: input.name,
        code,
        description: input.description,
        coverAssetId: input.coverAssetId,
        createdBy: input.operatorUserId,
      })
    } catch (error) {
      if (isUniqueViolationError(error, ['projects_code_key'])) {
        throw new ValidationAppError('项目编码已存在')
      }
      throw error
    }

    return await this.getProject(created.id)
  }

  public async updateProject(
    id: number,
    input: {
      name?: string
      description?: string | null
      coverAssetId?: number | null
    }
  ) {
    const current = await this.projectRepository.findWithSummaryById(id)
    if (!current) {
      throw new NotFoundError('项目不存在')
    }

    if (input.name === undefined && input.description === undefined && input.coverAssetId === undefined) {
      throw new ValidationAppError('至少提供一个更新字段')
    }

    await this.projectRepository.update(id, input)
    return await this.getProject(id)
  }

  public async archiveProject(id: number) {
    const updated = await this.projectRepository.update(id, {
      status: 'archived',
    })

    if (!updated) {
      throw new NotFoundError('项目不存在')
    }

    return await this.getProject(id)
  }

  public async listMembers(projectId: number) {
    await this.ensureProjectExists(projectId)
    return {
      items: await this.projectMemberRepository.listActiveMembers(projectId),
    }
  }

  public async replaceMembers(
    projectId: number,
    members: Array<{ userId: number; projectRole: ProjectRole }>,
    operatorUserId: number | null
  ) {
    await this.ensureProjectExists(projectId)

    const uniqueUserIds = [...new Set(members.map((member) => member.userId))]
    if (uniqueUserIds.length !== members.length) {
      throw new ValidationAppError('成员用户不能重复')
    }

    const existingUserIds = await this.projectMemberRepository.listExistingUserIds(uniqueUserIds)
    if (existingUserIds.length !== uniqueUserIds.length) {
      throw new ValidationAppError('存在无效或已禁用的用户')
    }

    return {
      items: await this.projectMemberRepository.replaceAllMembers(projectId, members, operatorUserId),
    }
  }

  private async ensureProjectExists(projectId: number): Promise<void> {
    const project = await this.projectRepository.findWithSummaryById(projectId)
    if (!project) {
      throw new NotFoundError('项目不存在')
    }
  }

  private toProjectSummary(project: ProjectRecord & ProjectSummary) {
    return {
      id: project.id,
      name: project.name,
      code: project.code,
      status: project.status,
      description: project.description,
      coverAssetId: project.coverAssetId,
      createdBy: project.createdBy,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      memberCount: project.memberCount,
      assetCount: project.assetCount,
      taskCount: project.taskCount,
    }
  }

  private async generateProjectCode(): Promise<string> {
    const sequence = await this.projectRepository.nextCodeSequence()
    const now = new Date()
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    return `${ProjectService.codePrefix}-${yearMonth}-${String(sequence).padStart(6, '0')}`
  }
}
