import { db } from '../db/kysely'

export type ProjectRole = 'manager' | 'member' | 'viewer'
export type ProjectStatus = 'active' | 'archived'

export interface ProjectAccessRecord {
  projectId: number
  projectName: string
  projectCode: string
  projectStatus: ProjectStatus
  projectRole: ProjectRole
}

export interface ProjectAccessRepository {
  listAccessibleProjectsForUser(userId: number, role: 'admin' | 'user'): Promise<ProjectAccessRecord[]>
  findAccessibleProjectForUser(
    userId: number,
    role: 'admin' | 'user',
    projectId: number
  ): Promise<ProjectAccessRecord | null>
}

class KyselyProjectAccessRepository implements ProjectAccessRepository {
  public async listAccessibleProjectsForUser(userId: number, role: 'admin' | 'user'): Promise<ProjectAccessRecord[]> {
    const rows = await db
      .selectFrom('project_members as members')
      .innerJoin('projects', 'projects.id', 'members.project_id')
      .select([
        'projects.id as projectId',
        'projects.name as projectName',
        'projects.code as projectCode',
        'projects.status as projectStatus',
        'members.project_role as projectRole',
      ])
      .where('members.user_id', '=', userId)
      .where('members.status', '=', 'active')
      .orderBy('projects.id', 'asc')
      .execute()

    return rows.map((row) => ({
      projectId: Number(row.projectId),
      projectName: row.projectName,
      projectCode: row.projectCode,
      projectStatus: row.projectStatus,
      projectRole: row.projectRole,
    }))
  }

  public async findAccessibleProjectForUser(
    userId: number,
    role: 'admin' | 'user',
    projectId: number
  ): Promise<ProjectAccessRecord | null> {
    const row = await db
      .selectFrom('project_members as members')
      .innerJoin('projects', 'projects.id', 'members.project_id')
      .select([
        'projects.id as projectId',
        'projects.name as projectName',
        'projects.code as projectCode',
        'projects.status as projectStatus',
        'members.project_role as projectRole',
      ])
      .where('members.user_id', '=', userId)
      .where('members.status', '=', 'active')
      .where('members.project_id', '=', projectId)
      .executeTakeFirst()

    return row
      ? {
          projectId: Number(row.projectId),
          projectName: row.projectName,
          projectCode: row.projectCode,
          projectStatus: row.projectStatus,
          projectRole: row.projectRole,
        }
      : null
  }
}

export class ProjectAccessService {
  private readonly repository: ProjectAccessRepository

  public constructor(repository: ProjectAccessRepository = new KyselyProjectAccessRepository()) {
    this.repository = repository
  }

  public async listAccessibleProjects(userId: number, role: 'admin' | 'user'): Promise<ProjectAccessRecord[]> {
    return await this.repository.listAccessibleProjectsForUser(userId, role)
  }

  public async getAccessibleProject(
    userId: number,
    role: 'admin' | 'user',
    projectId: number
  ): Promise<ProjectAccessRecord | null> {
    return await this.repository.findAccessibleProjectForUser(userId, role, projectId)
  }
}
