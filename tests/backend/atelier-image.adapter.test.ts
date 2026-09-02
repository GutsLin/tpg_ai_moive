import { afterEach, describe, expect, it, vi } from 'vitest'

import { OpenAiCompatibleImageAdapter } from '../../backend/src/services/atelier-image.adapter'

describe('Atelier image adapter', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the OpenAI-compatible image endpoint and never exposes configuration to the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'image-task-1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await new OpenAiCompatibleImageAdapter().create({ endpoint: 'https://provider.test/v1', apiKey: 'user-secret', model: 'gpt-image-2', prompt: 'a cat', size: '1:1' })
    expect(result).toEqual({ mode: 'async', providerTaskId: 'image-task-1', nextPollAfterMs: 1000 })
    expect(fetchMock).toHaveBeenCalledWith('https://provider.test/v1/images/generations', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ authorization: 'Bearer user-secret' }) }))
    expect(JSON.stringify(result)).not.toMatch(/user-secret|endpoint|apiKey/i)
  })

  it('parses synchronous URL and base64 outputs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ url: 'https://cdn.test/a.png' }, { b64_json: 'aGVsbG8=' }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await new OpenAiCompatibleImageAdapter().create({ endpoint: 'https://provider.test', apiKey: 'key', model: 'gpt-image-2', prompt: 'x' })
    expect(result.mode).toBe('sync')
    if (result.mode === 'sync') {
      expect(result.outputs[0]).toEqual({ source: 'url', url: 'https://cdn.test/a.png' })
      expect(result.outputs[1]).toMatchObject({ source: 'stream', contentType: 'image/png' })
    }
  })

  it('maps failed polling responses without returning provider secrets', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'failed', error: { code: 'BAD_INPUT', message: 'invalid prompt' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(new OpenAiCompatibleImageAdapter().poll({ endpoint: 'https://provider.test', apiKey: 'key', providerTaskId: 'task-1' })).resolves.toEqual({ status: 'failed', errorCode: 'BAD_INPUT', errorMessage: 'invalid prompt' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://provider.test/v1/images/generations/task-1')
  })
})
