import type { VideoTaskItem } from '../../api/videos'

const sameTaskView = (previous: VideoTaskItem, next: VideoTaskItem) =>
  previous.id === next.id &&
  previous.userId === next.userId &&
  previous.projectId === next.projectId &&
  previous.status === next.status &&
  previous.mode === next.mode &&
  previous.model === next.model &&
  previous.prompt === next.prompt &&
  previous.promptRaw === next.promptRaw &&
  previous.duration === next.duration &&
  previous.ratio === next.ratio &&
  previous.resolution === next.resolution &&
  previous.generateAudio === next.generateAudio &&
  previous.createdAt === next.createdAt &&
  previous.updatedAt === next.updatedAt &&
  previous.errorMessage === next.errorMessage &&
  previous.videoUrl === next.videoUrl &&
  previous.elapsedSeconds === next.elapsedSeconds &&
  previous.estimatedTotalSeconds === next.estimatedTotalSeconds &&
  previous.estimateSampleSize === next.estimateSampleSize

export const mergeVideoTasksForRefresh = (previous: VideoTaskItem[], incoming: VideoTaskItem[]): VideoTaskItem[] => {
  const previousMap = new Map(previous.map((task) => [task.id, task]))

  return incoming.map((task) => {
    const current = previousMap.get(task.id)
    if (!current) {
      return task
    }

    const merged: VideoTaskItem = {
      ...current,
      ...task,
      videoUrl: current.videoUrl && task.videoUrl ? current.videoUrl : task.videoUrl,
    }

    return sameTaskView(current, merged) ? current : merged
  })
}

export const replaceVideoTaskInList = (previous: VideoTaskItem[], incoming: VideoTaskItem): VideoTaskItem[] =>
  previous.map((task) => {
    if (task.id !== incoming.id) {
      return task
    }

    const merged: VideoTaskItem = {
      ...task,
      ...incoming,
      videoUrl: task.videoUrl && incoming.videoUrl ? task.videoUrl : incoming.videoUrl,
    }

    return sameTaskView(task, merged) ? task : merged
  })
