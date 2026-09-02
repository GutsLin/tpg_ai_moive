import { Readable } from 'node:stream'

import { ValidationAppError } from '../utils/errors'

export type ImageReference = {
  url?: string
  body?: Buffer
  contentType?: string
  filename?: string
}

export type ImageOutput =
  | { source: 'url'; url: string; contentType?: string }
  | { source: 'stream'; body: NodeJS.ReadableStream; contentType: string; contentLength?: number }

export type ImageCreateResult =
  | { mode: 'sync'; outputs: ImageOutput[] }
  | { mode: 'async'; providerTaskId: string; nextPollAfterMs?: number }

export type ImageTaskResult = {
  status: 'processing' | 'succeeded' | 'failed'
  progress?: number
  outputs?: ImageOutput[]
  errorCode?: string
  errorMessage?: string
}

export interface AtelierImageProviderPort {
  endpoint: string
  apiKey: string
}

export interface AtelierImageAdapter {
  create(input: AtelierImageProviderPort & { model: string; prompt: string; size?: string; n?: number; references?: ImageReference[] }): Promise<ImageCreateResult>
  poll(input: AtelierImageProviderPort & { providerTaskId: string }): Promise<ImageTaskResult>
}

const normalizeBase = (endpoint: string): string => endpoint.trim().replace(/\/+$/, '')
const apiBase = (endpoint: string): string => /\/v1$/i.test(normalizeBase(endpoint)) ? normalizeBase(endpoint) : `${normalizeBase(endpoint)}/v1`

const parseOutputs = (data: unknown): ImageOutput[] => {
  if (!Array.isArray(data)) return []
  return data.reduce<ImageOutput[]>((result, item) => {
    if (typeof item === 'string') {
      result.push({ source: 'url', url: item })
      return result
    }
    if (!item || typeof item !== 'object') return result
    const value = item as { url?: unknown; b64_json?: unknown }
    if (typeof value.url === 'string' && value.url) {
      result.push({ source: 'url', url: value.url })
      return result
    }
    if (typeof value.b64_json === 'string' && value.b64_json) {
      const match = value.b64_json.match(/^data:([^;,]+);base64,(.+)$/s)
      const contentType = match?.[1] ?? 'image/png'
      const encoded = match?.[2] ?? value.b64_json
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length > Math.ceil(50 * 1024 * 1024 / 3) * 4) {
        throw new ValidationAppError('图像生成结果过大或格式无效')
      }
      const body = Buffer.from(encoded, 'base64')
      result.push({ source: 'stream', body: Readable.from([body]), contentType, contentLength: body.length })
    }
    return result
  }, [])
}

const providerError = async (response: Response): Promise<Error> => {
  let detail = ''
  try {
    const raw = (await response.text()).slice(0, 900)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { error?: { code?: string; message?: string }; message?: string }
        detail = parsed.error?.message ?? parsed.message ?? raw
      } catch {
        detail = raw
      }
    }
  } catch {
    // The response body may be unavailable.
  }
  return new Error(`IMAGE_PROVIDER_HTTP_${response.status}${detail ? `: ${detail.replace(/\s+/g, ' ').trim()}` : ''}`)
}

export class OpenAiCompatibleImageAdapter implements AtelierImageAdapter {
  public async create(input: AtelierImageProviderPort & { model: string; prompt: string; size?: string; n?: number; references?: ImageReference[] }): Promise<ImageCreateResult> {
    const base = apiBase(input.endpoint)
    const headers = { authorization: `Bearer ${input.apiKey}`, 'content-type': 'application/json' }
    const references = (input.references ?? []).map((reference) => reference.url).filter((url): url is string => Boolean(url))
    const payload = {
      model: input.model,
      prompt: input.prompt,
      n: input.n ?? 1,
      ...(input.size ? { size: input.size } : {}),
      ...(references.length ? { image_urls: references } : {}),
    }
    const response = await fetch(`${base}/images/generations`, { method: 'POST', headers, body: JSON.stringify(payload) })
    if (!response.ok) throw await providerError(response)
    const body = await response.json() as { id?: string; data?: unknown; result?: { data?: unknown } }
    if (body.id) return { mode: 'async', providerTaskId: body.id, nextPollAfterMs: 1000 }
    const outputs = parseOutputs(body.data ?? body.result?.data)
    if (!outputs.length) throw new ValidationAppError('图像生成平台未返回结果')
    return { mode: 'sync', outputs }
  }

  public async poll(input: AtelierImageProviderPort & { providerTaskId: string }): Promise<ImageTaskResult> {
    const base = apiBase(input.endpoint)
    const response = await fetch(`${base}/images/generations/${encodeURIComponent(input.providerTaskId)}`, { headers: { authorization: `Bearer ${input.apiKey}` } })
    if (!response.ok) {
      const error = await providerError(response)
      return { status: 'failed', errorCode: error.message.split(':', 1)[0], errorMessage: error.message }
    }
    const body = await response.json() as { status?: string; progress?: number; data?: unknown; result?: { data?: unknown }; error?: { code?: string; message?: string } }
    const outputs = parseOutputs(body.data ?? body.result?.data)
    const status = String(body.status ?? '').toLowerCase()
    if (outputs.length && ['completed', 'succeeded', 'success', ''].includes(status)) return { status: 'succeeded', progress: 100, outputs }
    if (['failed', 'canceled', 'cancelled'].includes(status)) return { status: 'failed', errorCode: body.error?.code ?? 'IMAGE_PROVIDER_FAILED', errorMessage: body.error?.message }
    return { status: 'processing', progress: body.progress }
  }
}
