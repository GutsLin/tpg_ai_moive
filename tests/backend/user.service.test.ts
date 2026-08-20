import { describe, expect, it } from 'vitest'

import type {
  CreateUserInput,
  ListUsersParams,
  UpdateUserInput,
  UserProjectAccessRecord,
  UserProjectRepository,
  UserRecord,
  UserRepository,
} from '../../backend/src/services/user.service'
import { UserService } from '../../backend/src/services/user.service'

class StringIdUserRepository implements UserRepository {
  public async findByUsername(): Promise<UserRecord | null> {
    return null
  }

  public async findById(): Promise<UserRecord | null> {
    return null
  }

  public async list(_params: ListUsersParams): Promise<{ items: UserRecord[]; total: number }> {
    return {
      items: [
        {
          id: '2' as unknown as number,
          username: 'operator',
          passwordHash: 'hashed-password',
          role: 'user',
          menuPerms: ['assets', 'videos'],
          status: 1,
          createdAt: new Date('2026-04-04T00:00:00.000Z'),
          updatedAt: new Date('2026-04-04T00:00:00.000Z'),
        },
      ],
      total: 1,
    }
  }

  public async create(_input: CreateUserInput): Promise<UserRecord> {
    throw new Error('not implemented')
  }

  public async update(_id: number, _input: UpdateUserInput): Promise<UserRecord | null> {
    throw new Error('not implemented')
  }

  public async softDelete(_id: number): Promise<UserRecord | null> {
    throw new Error('not implemented')
  }
}

class FixedUserProjectRepository implements UserProjectRepository {
  public async listProjectsByUserIds(_userIds: number[]): Promise<UserProjectAccessRecord[]> {
    return [
      {
        userId: 2,
        projectId: 101,
        projectName: '都市逆袭',
        projectCode: 'urban-rise',
        projectStatus: 'active',
        projectRole: 'member',
      },
    ]
  }

  public async listExistingProjectIds(): Promise<number[]> {
    return []
  }

  public async replaceUserProjects(): Promise<void> {
    return
  }
}

describe('UserService', () => {
  it('listUsers 在 bigint 字符串用户 ID 下仍能返回项目授权', async () => {
    const service = new UserService({
      repository: new StringIdUserRepository(),
      userProjectRepository: new FixedUserProjectRepository(),
    })

    const result = await service.listUsers({
      page: 1,
      pageSize: 10,
      status: 1,
    })

    expect(result.items).toEqual([
      {
        id: 2,
        username: 'operator',
        role: 'user',
        menuPerms: ['assets', 'videos'],
        status: 1,
        projects: [
          {
            id: 101,
            name: '都市逆袭',
            code: 'urban-rise',
            status: 'active',
            projectRole: 'member',
          },
        ],
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
    ])
  })
})
