export type CanvasNode = {
  id: string
  text: string
  x: number
  y: number
  storageKey?: string
  name?: string
  prompt?: string
  assetId?: number
  remoteUrl?: string
  remoteStatus?: string
}

export type CanvasViewport = { x: number; y: number; k: number }
export type CanvasDocument = { nodes: CanvasNode[]; viewport: CanvasViewport }

export const emptyDocument: CanvasDocument = { nodes: [], viewport: { x: 0, y: 0, k: 1 } }

export const normalizeDocument = (value: Record<string, unknown> | undefined): CanvasDocument => {
  const nodes = Array.isArray(value?.nodes)
    ? value.nodes
        .filter((node): node is CanvasNode => Boolean(node && typeof node === 'object' && typeof (node as CanvasNode).id === 'string'))
        .map((node) => ({
          id: node.id,
          text: node.text || '图片节点',
          x: Number(node.x) || 80,
          y: Number(node.y) || 80,
          storageKey: node.storageKey,
          name: node.name,
          prompt: node.prompt,
          assetId: typeof node.assetId === 'number' ? node.assetId : undefined,
          remoteUrl: node.remoteUrl,
          remoteStatus: node.remoteStatus,
        }))
    : []
  const rawViewport = value?.viewport && typeof value.viewport === 'object' ? value.viewport as Partial<CanvasViewport> : {}
  return {
    nodes,
    viewport: {
      x: Number(rawViewport.x) || 0,
      y: Number(rawViewport.y) || 0,
      k: Math.min(2.5, Math.max(0.25, Number(rawViewport.k) || 1)),
    },
  }
}

export const serializeDocument = (value: CanvasDocument): Record<string, unknown> => ({
  ...value,
  nodes: value.nodes.map(({ remoteUrl: _remoteUrl, remoteStatus: _remoteStatus, ...node }) => node),
})
