import { describe, expect, it } from 'vitest'

import { normalizeDocument, serializeDocument } from './model'

describe('Infinite Atelier canvas document model', () => {
  it('normalizes and clamps persisted viewport values', () => {
    const result = normalizeDocument({
      viewport: { x: 12, y: -8, k: 9 },
      nodes: [{ id: 'n1', text: '图片', x: 40, y: 50, assetId: 7, remoteUrl: 'https://signed.example/n1' }],
    })
    expect(result.viewport).toEqual({ x: 12, y: -8, k: 2.5 })
    expect(result.nodes[0]).toMatchObject({ id: 'n1', assetId: 7 })
  })

  it('does not persist ephemeral signed URLs while retaining asset references', () => {
    const result = serializeDocument({
      viewport: { x: 0, y: 0, k: 1 },
      nodes: [{ id: 'n1', text: '图片', x: 0, y: 0, assetId: 7, remoteUrl: 'https://signed.example/n1', remoteStatus: 'active' }],
    })
    expect(result).toEqual({ viewport: { x: 0, y: 0, k: 1 }, nodes: [{ id: 'n1', text: '图片', x: 0, y: 0, assetId: 7 }] })
  })
})
