import type { AssetItem } from '../../api/assets'

const canKeepPreviewUrl = (previous: AssetItem, incoming: AssetItem) =>
  previous.id === incoming.id &&
  previous.ossKey &&
  incoming.ossKey &&
  previous.ossKey === incoming.ossKey &&
  (incoming.assetType === 'Image' || incoming.assetType === 'Video')

const samePrimitiveArray = <T extends string | number>(left?: T[], right?: T[]) => {
  if (!left && !right) {
    return true
  }

  if (!left || !right || left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
}

const sameProjects = (left?: Array<{ id: number; name: string }>, right?: Array<{ id: number; name: string }>) => {
  if (!left && !right) {
    return true
  }

  if (!left || !right || left.length !== right.length) {
    return false
  }

  return left.every((project, index) => {
    const target = right[index]
    return project.id === target.id && project.name === target.name
  })
}

const isSameAssetView = (previous: AssetItem, next: AssetItem) =>
  previous.id === next.id &&
  previous.name === next.name &&
  previous.uploaderName === next.uploaderName &&
  previous.projectId === next.projectId &&
  previous.assetType === next.assetType &&
  previous.categoryId === next.categoryId &&
  previous.groupSyncEnabled === next.groupSyncEnabled &&
  previous.syncMode === next.syncMode &&
  previous.effectiveSync === next.effectiveSync &&
  samePrimitiveArray(previous.projectIds, next.projectIds) &&
  samePrimitiveArray(previous.projectNames, next.projectNames) &&
  previous.ossKey === next.ossKey &&
  previous.sourceUrl === next.sourceUrl &&
  previous.thumbnailUrl === next.thumbnailUrl &&
  previous.arkGroupId === next.arkGroupId &&
  previous.arkAssetId === next.arkAssetId &&
  previous.arkStatus === next.arkStatus &&
  previous.arkError === next.arkError &&
  sameProjects(previous.projects, next.projects) &&
  samePrimitiveArray(previous.tags, next.tags) &&
  previous.createdAt === next.createdAt &&
  previous.updatedAt === next.updatedAt

export const mergeAssetsForRefresh = (previous: AssetItem[], incoming: AssetItem[]): AssetItem[] => {
  const previousMap = new Map(previous.map((asset) => [asset.id, asset]))

  return incoming.map((asset) => {
    const current = previousMap.get(asset.id)
    if (!current) {
      return asset
    }

    const merged: AssetItem = {
      ...current,
      ...asset,
      sourceUrl: canKeepPreviewUrl(current, asset) ? (current.sourceUrl ?? asset.sourceUrl) : asset.sourceUrl,
      thumbnailUrl: canKeepPreviewUrl(current, asset) ? (current.thumbnailUrl ?? asset.thumbnailUrl) : asset.thumbnailUrl,
    }

    return isSameAssetView(current, merged) ? current : merged
  })
}
