import { describe, expect, it } from 'vitest'

import { buildVideoPreviewCandidates, isMeaningfulVideoFrame, pickVideoPreviewTime } from './video-preview'

describe('video-preview helpers', () => {
  it('优先选择最早的非黑场候选帧', () => {
    const previewTime = pickVideoPreviewTime(
      [
        { time: 0.12, brightness: 8, nonDarkRatio: 0.01 },
        { time: 0.32, brightness: 36, nonDarkRatio: 0.2 },
        { time: 0.56, brightness: 54, nonDarkRatio: 0.42 },
      ],
      4
    )

    expect(previewTime).toBe(0.32)
  })

  it('全部样本偏黑时回退到默认预览时间', () => {
    const previewTime = pickVideoPreviewTime(
      [
        { time: 0.12, brightness: 6, nonDarkRatio: 0.01 },
        { time: 0.32, brightness: 10, nonDarkRatio: 0.03 },
      ],
      5
    )

    expect(previewTime).toBe(0.12)
  })

  it('候选时间会按视频时长裁剪并去重排序', () => {
    expect(buildVideoPreviewCandidates(1.2)).toEqual([0.05, 0.1, 0.12, 0.14, 0.24, 0.32, 0.56, 0.96, 1.12])
  })

  it('亮度或非黑像素比例达到阈值都算有效画面', () => {
    expect(isMeaningfulVideoFrame({ brightness: 30, nonDarkRatio: 0.02 })).toBe(true)
    expect(isMeaningfulVideoFrame({ brightness: 10, nonDarkRatio: 0.2 })).toBe(true)
    expect(isMeaningfulVideoFrame({ brightness: 10, nonDarkRatio: 0.02 })).toBe(false)
  })
})
