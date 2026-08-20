export interface VideoFrameSample {
  time: number
  brightness: number
  nonDarkRatio: number
}

const FALLBACK_PREVIEW_SECONDS = [0.12, 0.32, 0.56, 0.96, 1.36]
const MIN_BRIGHTNESS = 28
const MIN_NON_DARK_RATIO = 0.12

const clampPreviewTime = (duration: number, time: number) => {
  if (!Number.isFinite(duration) || duration <= 0) {
    return Math.max(0, time)
  }

  return Math.max(0, Math.min(time, Math.max(duration - 0.08, 0)))
}

export const buildVideoPreviewCandidates = (duration: number): number[] => {
  const dynamicCandidates =
    Number.isFinite(duration) && duration > 0
      ? [duration * 0.04, duration * 0.08, duration * 0.12, duration * 0.2]
      : []

  return [...new Set([...FALLBACK_PREVIEW_SECONDS, ...dynamicCandidates].map((time) => Number(clampPreviewTime(duration, time).toFixed(2))))].sort(
    (left, right) => left - right
  )
}

export const isMeaningfulVideoFrame = (sample: Pick<VideoFrameSample, 'brightness' | 'nonDarkRatio'>): boolean => {
  return sample.brightness >= MIN_BRIGHTNESS || sample.nonDarkRatio >= MIN_NON_DARK_RATIO
}

export const pickVideoPreviewTime = (samples: VideoFrameSample[], duration: number): number => {
  const meaningfulSample = samples.find((sample) => isMeaningfulVideoFrame(sample))
  if (meaningfulSample) {
    return clampPreviewTime(duration, meaningfulSample.time)
  }

  const fallbackTime = FALLBACK_PREVIEW_SECONDS.find((time) => clampPreviewTime(duration, time) > 0) ?? 0
  return clampPreviewTime(duration, fallbackTime)
}

const waitForSeeked = (video: HTMLVideoElement): Promise<void> =>
  new Promise((resolve, reject) => {
    const handleSeeked = () => {
      cleanup()
      resolve()
    }
    const handleError = () => {
      cleanup()
      reject(video.error ?? new Error('视频帧定位失败'))
    }
    const cleanup = () => {
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('error', handleError)
    }

    video.addEventListener('seeked', handleSeeked, { once: true })
    video.addEventListener('error', handleError, { once: true })
  })

const analyzeFrame = (video: HTMLVideoElement, canvas: HTMLCanvasElement): VideoFrameSample => {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('无法创建视频预览画布')
  }

  canvas.width = 48
  canvas.height = 48
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)

  let brightnessSum = 0
  let nonDarkPixels = 0

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 0
    const green = data[index + 1] ?? 0
    const blue = data[index + 2] ?? 0
    const luminance = red * 0.299 + green * 0.587 + blue * 0.114
    brightnessSum += luminance
    if (luminance >= 24) {
      nonDarkPixels += 1
    }
  }

  const pixelCount = data.length / 4 || 1
  return {
    time: video.currentTime,
    brightness: brightnessSum / pixelCount,
    nonDarkRatio: nonDarkPixels / pixelCount,
  }
}

export const resolveVideoPreviewTime = async (video: HTMLVideoElement): Promise<number> => {
  const duration = Number.isFinite(video.duration) ? video.duration : 0
  const canvas = document.createElement('canvas')
  const samples: VideoFrameSample[] = []

  for (const candidate of buildVideoPreviewCandidates(duration)) {
    const targetTime = clampPreviewTime(duration, candidate)
    try {
      video.currentTime = targetTime
      await waitForSeeked(video)
      samples.push(analyzeFrame(video, canvas))
      if (isMeaningfulVideoFrame(samples[samples.length - 1])) {
        break
      }
    } catch {
      return clampPreviewTime(duration, 0.8)
    }
  }

  return pickVideoPreviewTime(samples, duration)
}
