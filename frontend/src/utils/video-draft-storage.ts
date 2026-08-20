const VIDEO_DRAFT_STORAGE_KEY = 'videos:generate-draft'

export const getVideoDraftStorageKey = (projectId: number) => `${VIDEO_DRAFT_STORAGE_KEY}:${projectId}`

export const readVideoDraft = <T,>(projectId: number): T | null => {
  try {
    const raw = window.sessionStorage.getItem(getVideoDraftStorageKey(projectId))
    if (!raw) {
      return null
    }

    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export const writeVideoDraft = <T,>(projectId: number, draft: T) => {
  window.sessionStorage.setItem(getVideoDraftStorageKey(projectId), JSON.stringify(draft))
}

export const clearVideoDraft = (projectId: number) => {
  window.sessionStorage.removeItem(getVideoDraftStorageKey(projectId))
}

export const clearAllVideoDrafts = () => {
  const keysToDelete: string[] = []

  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index)
    if (key?.startsWith(`${VIDEO_DRAFT_STORAGE_KEY}:`)) {
      keysToDelete.push(key)
    }
  }

  keysToDelete.forEach((key) => {
    window.sessionStorage.removeItem(key)
  })
}
