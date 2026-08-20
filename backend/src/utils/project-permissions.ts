import type { ProjectRole } from '../services/project-access.service'
import { ForbiddenError } from './errors'

export const canUploadAsset = (role: ProjectRole | null | undefined): boolean => {
  return role === 'manager' || role === 'member'
}

export const canDeleteAsset = (role: ProjectRole | null | undefined): boolean => {
  return role === 'manager'
}

export const canCreateVideoTask = (role: ProjectRole | null | undefined): boolean => {
  return role === 'manager' || role === 'member'
}

export const assertProjectPermission = (allowed: boolean, message: string): void => {
  if (!allowed) {
    throw new ForbiddenError(message)
  }
}
