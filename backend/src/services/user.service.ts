import bcrypt from 'bcryptjs'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { type Kysely } from 'kysely'

import { db, type Database } from '../db/kysely'
import { toJsonbString } from '../db/json'
import type {
  ProjectAccessRecord,
  ProjectAccessRepository,
  ProjectRole,
  ProjectStatus,
} from './project-access.service'
import { ProjectAccessService } from './project-access.service'
import { NotFoundError, UnauthorizedError, ValidationAppError } from '../utils/errors'

export interface UserRecord {
  id: number
  username: string
  passwordHash: string
  role: 'admin' | 'user'
  menuPerms: string[]
  status: number
  createdAt: Date
  updatedAt: Date
}

export interface ListUsersParams {
  page: number
  pageSize: number
  status?: number
}

export interface CreateUserInput {
  username: string
  passwordHash: string
  role: 'admin' | 'user'
  menuPerms: string[]
  status: number
}

export interface UpdateUserInput {
  role?: 'admin' | 'user'
  passwordHash?: string
  menuPerms?: string[]
  status?: number
}

export interface UserRepository {
  findByUsername(username: string): Promise<UserRecord | null>
  findById(id: number): Promise<UserRecord | null>
  list(params: ListUsersParams): Promise<{ items: UserRecord[]; total: number }>
  create(input: CreateUserInput): Promise<UserRecord>
  update(id: number, input: UpdateUserInput): Promise<UserRecord | null>
  softDelete(id: number): Promise<UserRecord | null>
}

export interface UserProjectAccessRecord {
  userId: number
  projectId: number
  projectName: string
  projectCode: string
  projectStatus: ProjectStatus
  projectRole: ProjectRole
}

export interface UserProjectRepository {
  listProjectsByUserIds(userIds: number[]): Promise<UserProjectAccessRecord[]>
  listExistingProjectIds(projectIds: number[]): Promise<number[]>
  replaceUserProjects(
    userId: number,
    projects: Array<{ projectId: number; projectRole: ProjectRole }>,
    operatorUserId: number | null
  ): Promise<void>
}

class NoopProjectAccessRepository implements ProjectAccessRepository {
  public async listAccessibleProjectsForUser(): Promise<ProjectAccessRecord[]> {
    return []
  }

  public async findAccessibleProjectForUser(): Promise<ProjectAccessRecord | null> {
    return null
  }
}

class NoopUserProjectRepository implements UserProjectRepository {
  public async listProjectsByUserIds(): Promise<UserProjectAccessRecord[]> {
    return []
  }

  public async listExistingProjectIds(): Promise<number[]> {
    return []
  }

  public async replaceUserProjects(): Promise<void> {
    return
  }
}

const normalizeDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value))
const normalizeNumericValue = (value: number | string): number => Number(value)

export class KyselyUserRepository implements UserRepository {
  public constructor(private readonly database: Kysely<Database> = db) {}

  public async findByUsername(username: string): Promise<UserRecord | null> {
    const row = await this.database
      .selectFrom('users')
      .selectAll()
      .where('username', '=', username)
      .executeTakeFirst()

    return row ? this.mapRow(row) : null
  }

  public async findById(id: number): Promise<UserRecord | null> {
    const row = await this.database.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst()
    return row ? this.mapRow(row) : null
  }

  public async list(params: ListUsersParams): Promise<{ items: UserRecord[]; total: number }> {
    let query = this.database.selectFrom('users')
    let countQuery = this.database.selectFrom('users')

    if (params.status !== undefined) {
      query = query.where('status', '=', params.status)
      countQuery = countQuery.where('status', '=', params.status)
    }

    const [items, totalRow] = await Promise.all([
      query
        .selectAll()
        .orderBy('id', 'asc')
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize)
        .execute(),
      countQuery.select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirstOrThrow(),
    ])

    return {
      items: items.map((row) => this.mapRow(row)),
      total: Number(totalRow.count),
    }
  }

  public async create(input: CreateUserInput): Promise<UserRecord> {
    const row = await this.database
      .insertInto('users')
      .values({
        username: input.username,
        password_hash: input.passwordHash,
        role: input.role,
        menu_perms: toJsonbString(input.menuPerms),
        status: input.status,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return this.mapRow(row)
  }

  public async update(id: number, input: UpdateUserInput): Promise<UserRecord | null> {
    const values: Record<string, unknown> = {
      updated_at: new Date(),
    }

    if (input.role !== undefined) {
      values.role = input.role
    }

    if (input.passwordHash !== undefined) {
      values.password_hash = input.passwordHash
    }

    if (input.menuPerms !== undefined) {
      values.menu_perms = toJsonbString(input.menuPerms)
    }

    if (input.status !== undefined) {
      values.status = input.status
    }

    const row = await this.database
      .updateTable('users')
      .set(values)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()

    return row ? this.mapRow(row) : null
  }

  public async softDelete(id: number): Promise<UserRecord | null> {
    return this.update(id, { status: 0 })
  }

  private mapRow(row: {
    id: number | string
    username: string
    password_hash: string
    role: 'admin' | 'user'
    menu_perms: string[]
    status: number | string
    created_at: Date | string
    updated_at: Date | string
  }): UserRecord {
    return {
      id: normalizeNumericValue(row.id),
      username: row.username,
      passwordHash: row.password_hash,
      role: row.role,
      menuPerms: row.menu_perms,
      status: normalizeNumericValue(row.status),
      createdAt: normalizeDate(row.created_at),
      updatedAt: normalizeDate(row.updated_at),
    }
  }
}

class KyselyUserProjectRepository implements UserProjectRepository {
  public async listProjectsByUserIds(userIds: number[]): Promise<UserProjectAccessRecord[]> {
    if (userIds.length === 0) {
      return []
    }

    const rows = await db
      .selectFrom('project_members')
      .innerJoin('projects', 'projects.id', 'project_members.project_id')
      .select([
        'project_members.user_id as userId',
        'project_members.project_id as projectId',
        'project_members.project_role as projectRole',
        'projects.name as projectName',
        'projects.code as projectCode',
        'projects.status as projectStatus',
      ])
      .where('project_members.user_id', 'in', userIds)
      .where('project_members.status', '=', 'active')
      .orderBy('project_members.user_id', 'asc')
      .orderBy('project_members.id', 'asc')
      .execute()

    return rows.map((row) => ({
      userId: Number(row.userId),
      projectId: Number(row.projectId),
      projectName: row.projectName,
      projectCode: row.projectCode,
      projectStatus: row.projectStatus,
      projectRole: row.projectRole,
    }))
  }

  public async listExistingProjectIds(projectIds: number[]): Promise<number[]> {
    if (projectIds.length === 0) {
      return []
    }

    const rows = await db.selectFrom('projects').select('id').where('id', 'in', projectIds).execute()
    return rows.map((row) => Number(row.id))
  }

  public async replaceUserProjects(
    userId: number,
    projects: Array<{ projectId: number; projectRole: ProjectRole }>,
    operatorUserId: number | null
  ): Promise<void> {
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('project_members')
        .set({
          status: 'inactive',
          updated_at: new Date(),
        })
        .where('user_id', '=', userId)
        .execute()

      if (projects.length === 0) {
        return
      }

      await trx
        .insertInto('project_members')
        .values(
          projects.map((project) => ({
            user_id: userId,
            project_id: project.projectId,
            project_role: project.projectRole,
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
    })
  }
}

export interface LoginResult {
  token: string
  user: {
    id: number
    username: string
    role: 'admin' | 'user'
    menuPerms: string[]
    status: number
  }
  projects: Array<{
    id: number
    name: string
    code: string
    status: ProjectStatus
    projectRole: ProjectRole
  }>
  activeProjectId: number | null
}

export interface SessionResult {
  user: {
    id: number
    username: string
    role: 'admin' | 'user'
    menuPerms: string[]
    status: number
  }
  projects: Array<{
    id: number
    name: string
    code: string
    status: ProjectStatus
    projectRole: ProjectRole
  }>
  activeProjectId: number | null
}

export interface ListUsersResult {
  items: Array<{
    id: number
    username: string
    role: 'admin' | 'user'
    menuPerms: string[]
    status: number
    projects: Array<{
      id: number
      name: string
      code: string
      status: ProjectStatus
      projectRole: ProjectRole
    }>
    createdAt: string
    updatedAt: string
  }>
  total: number
  page: number
  pageSize: number
}

export interface UserServiceOptions {
  repository?: UserRepository
  projectAccessRepository?: ProjectAccessRepository
  userProjectRepository?: UserProjectRepository
}

const validateEnabledUserMenuPerms = (role: 'admin' | 'user', menuPerms: string[], status: number) => {
  if (role === 'user' && status === 1 && menuPerms.length === 0) {
    throw new ValidationAppError('启用中的普通用户至少保留一个菜单权限')
  }
}

const validateEnabledUserProjectAssignments = (
  role: 'admin' | 'user',
  projectCount: number,
  status: number
) => {
  if (role === 'user' && status === 1 && projectCount === 0) {
    throw new ValidationAppError('普通用户至少授权一个项目')
  }
}

export class UserService {
  private readonly repository: UserRepository
  private readonly projectAccessService: ProjectAccessService
  private readonly userProjectRepository: UserProjectRepository

  public constructor(options: UserServiceOptions = {}) {
    this.repository = options.repository ?? new KyselyUserRepository()
    const useNoopProjectDeps =
      options.repository !== undefined &&
      options.projectAccessRepository === undefined &&
      options.userProjectRepository === undefined

    this.projectAccessService = new ProjectAccessService(
      useNoopProjectDeps ? new NoopProjectAccessRepository() : options.projectAccessRepository
    )
    this.userProjectRepository = useNoopProjectDeps
      ? new NoopUserProjectRepository()
      : (options.userProjectRepository ?? new KyselyUserProjectRepository())
  }

  public getRepository(): UserRepository {
    return this.repository
  }


  public async login(username: string, password: string): Promise<LoginResult> {
    const user = await this.repository.findByUsername(username)
    if (!user || user.status !== 1) {
      throw new UnauthorizedError('用户名或密码错误')
    }

    const isValid = await bcrypt.compare(password, user.passwordHash)
    if (!isValid) {
      throw new UnauthorizedError('用户名或密码错误')
    }

    const signOptions: SignOptions = {
      expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as SignOptions['expiresIn'],
    }

    const token = jwt.sign(
      { sub: String(user.id), role: user.role },
      process.env.JWT_SECRET || 'dev-jwt-secret',
      signOptions
    )

    const normalizedUserId = normalizeNumericValue(user.id)
    const projects = await this.listEffectiveProjects(normalizedUserId, user.role)

    return {
      token,
      user: this.toUserSummary(user),
      projects,
      activeProjectId: projects[0]?.id ?? null,
    }
  }

  public async listUsers(params: ListUsersParams): Promise<ListUsersResult> {
    const result = await this.repository.list(params)
    const userProjectRows = await this.getProjectMap(result.items.map((user) => normalizeNumericValue(user.id)))

    return {
      items: result.items.map((user) => ({
        ...this.toUserSummary(user),
        projects: userProjectRows.get(normalizeNumericValue(user.id)) ?? [],
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      })),
      total: result.total,
      page: params.page,
      pageSize: params.pageSize,
    }
  }

  public async getSession(userId: number): Promise<SessionResult> {
    const user = await this.repository.findById(userId)
    if (!user || user.status !== 1) {
      throw new UnauthorizedError('当前用户不存在或已禁用')
    }

    const normalizedUserId = normalizeNumericValue(user.id)
    const projects = await this.listEffectiveProjects(normalizedUserId, user.role)

    return {
      user: this.toUserSummary(user),
      projects,
      activeProjectId: projects[0]?.id ?? null,
    }
  }

  public async createUser(input: {
    username: string
    password: string
    role: 'admin' | 'user'
    menuPerms: string[]
    projects: Array<{
      projectId: number
      projectRole: ProjectRole
    }>
    operatorUserId: number | null
  }) {
    const existingUser = await this.repository.findByUsername(input.username)
    if (existingUser) {
      throw new ValidationAppError('用户名已存在')
    }

    validateEnabledUserMenuPerms(input.role, input.menuPerms, 1)
    this.assertUniqueProjects(input.projects)
    validateEnabledUserProjectAssignments(input.role, input.projects.length, 1)
    await this.ensureProjectsExist(input.projects.map((project) => project.projectId))

    const passwordHash = await bcrypt.hash(input.password, 12)
    const createdUser = await this.repository.create({
      username: input.username,
      passwordHash,
      role: input.role,
      menuPerms: input.menuPerms,
      status: 1,
    })

    await this.userProjectRepository.replaceUserProjects(createdUser.id, input.projects, input.operatorUserId)

    return await this.getUserSummaryWithProjects(createdUser)
  }

  public async updateUser(
    id: number,
    input: {
      role?: 'admin' | 'user'
      menuPerms?: string[]
      status?: number
      password?: string
      projects?: Array<{
        projectId: number
        projectRole: ProjectRole
      }>
      operatorUserId: number | null
    }
  ) {
    const currentUser = await this.repository.findById(id)
    if (!currentUser) {
      throw new NotFoundError('用户不存在')
    }

    const nextRole = input.role ?? currentUser.role
    const nextStatus = input.status ?? currentUser.status
    const nextMenuPerms = input.menuPerms ?? currentUser.menuPerms
    const nextProjects =
      input.projects ??
      (await this.userProjectRepository.listProjectsByUserIds([id])).map((project) => ({
        projectId: project.projectId,
        projectRole: project.projectRole,
      }))

    validateEnabledUserMenuPerms(nextRole, nextMenuPerms, nextStatus)
    this.assertUniqueProjects(nextProjects)
    validateEnabledUserProjectAssignments(nextRole, nextProjects.length, nextStatus)

    const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : undefined
    const updatedUser = await this.repository.update(id, {
      role: input.role,
      menuPerms: input.menuPerms,
      status: input.status,
      passwordHash,
    })
    if (input.projects !== undefined) {
      await this.ensureProjectsExist(input.projects.map((project) => project.projectId))
      await this.userProjectRepository.replaceUserProjects(id, input.projects, input.operatorUserId)
    }

    return await this.getUserSummaryWithProjects(updatedUser ?? currentUser)
  }

  public async deleteUser(targetUserId: number, currentUserId: number) {
    if (targetUserId === currentUserId) {
      throw new ValidationAppError('不能删除当前登录用户')
    }

    const deletedUser = await this.repository.softDelete(targetUserId)
    if (!deletedUser) {
      throw new NotFoundError('用户不存在')
    }

    await this.userProjectRepository.replaceUserProjects(targetUserId, [], currentUserId)

    return await this.getUserSummaryWithProjects(deletedUser)
  }

  public async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await this.repository.findById(userId)
    if (!user || user.status !== 1) {
      throw new UnauthorizedError('当前用户不存在或已禁用')
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!isValid) {
      throw new UnauthorizedError('当前密码错误')
    }

    if (currentPassword === newPassword) {
      throw new ValidationAppError('新密码不能与当前密码相同')
    }

    const nextPasswordHash = await bcrypt.hash(newPassword, 12)
    const updatedUser = await this.repository.update(userId, {
      passwordHash: nextPasswordHash,
    })

    if (!updatedUser) {
      throw new NotFoundError('用户不存在')
    }
  }

  public toUserSummary(user: UserRecord) {
    return {
      id: normalizeNumericValue(user.id),
      username: user.username,
      role: user.role,
      menuPerms: user.menuPerms,
      status: normalizeNumericValue(user.status),
    }
  }

  private async getUserSummaryWithProjects(user: UserRecord) {
    const normalizedUserId = normalizeNumericValue(user.id)
    return {
      ...this.toUserSummary(user),
      projects: await this.listEffectiveProjects(normalizedUserId, user.role),
    }
  }

  private async listEffectiveProjects(userId: number, role: 'admin' | 'user'): Promise<
    Array<{
      id: number
      name: string
      code: string
      status: ProjectStatus
      projectRole: ProjectRole
    }>
  > {
    return await this.listUserProjects(userId)
  }

  private async listAccessibleProjects(userId: number, role: 'admin' | 'user'): Promise<
    Array<{
      id: number
      name: string
      code: string
      status: ProjectStatus
      projectRole: ProjectRole
    }>
  > {
    const rows = await this.projectAccessService.listAccessibleProjects(userId, role)
    return rows.map((row) => ({
      id: row.projectId,
      name: row.projectName,
      code: row.projectCode,
      status: row.projectStatus,
      projectRole: row.projectRole,
    }))
  }

  private async listUserProjects(userId: number): Promise<
    Array<{
      id: number
      name: string
      code: string
      status: ProjectStatus
      projectRole: ProjectRole
    }>
  > {
    const rows = await this.userProjectRepository.listProjectsByUserIds([userId])
    return rows.map((row) => ({
      id: row.projectId,
      name: row.projectName,
      code: row.projectCode,
      status: row.projectStatus,
      projectRole: row.projectRole,
    }))
  }

  private async getProjectMap(userIds: number[]) {
    const rows = await this.userProjectRepository.listProjectsByUserIds(userIds)
    const map = new Map<
      number,
      Array<{
        id: number
        name: string
        code: string
        status: ProjectStatus
        projectRole: ProjectRole
      }>
    >()

    for (const row of rows) {
      const projects = map.get(row.userId) ?? []
      projects.push({
        id: row.projectId,
        name: row.projectName,
        code: row.projectCode,
        status: row.projectStatus,
        projectRole: row.projectRole,
      })
      map.set(row.userId, projects)
    }

    return map
  }

  private async ensureProjectsExist(projectIds: number[]): Promise<void> {
    const uniqueProjectIds = [...new Set(projectIds)]
    if (uniqueProjectIds.length === 0) {
      return
    }

    const existingProjectIds = await this.userProjectRepository.listExistingProjectIds(uniqueProjectIds)
    if (existingProjectIds.length !== uniqueProjectIds.length) {
      throw new ValidationAppError('存在无效项目')
    }
  }

  private assertUniqueProjects(
    projects: Array<{
      projectId: number
      projectRole: ProjectRole
    }>
  ): void {
    const projectIds = projects.map((project) => project.projectId)
    if (new Set(projectIds).size !== projectIds.length) {
      throw new ValidationAppError('项目授权不能重复')
    }
  }
}
