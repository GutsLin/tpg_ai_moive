import { describe, expect, it } from 'vitest'
import { collectCanvasAssetIds } from '../../backend/src/services/atelier.service'

describe('Infinite Atelier asset lifecycle contracts', () => {
  it('collects only numeric asset references from canvas JSON', () => {
    expect([...collectCanvasAssetIds({ nodes: [{ assetId: 12 }, { assetId: '12' }, { nested: { assetId: 15 } }] })]).toEqual([12, 15])
  })

  it('keeps asset name and generation prompt as separate fields', () => {
    const canvasNode = { name: '角色立绘', prompt: 'cinematic portrait, blue light' }
    expect(canvasNode.name).not.toBe(canvasNode.prompt)
  })
})
