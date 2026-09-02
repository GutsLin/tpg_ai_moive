import request from '../utils/request'

export interface AtelierCanvas { id: number; projectId: number; createdByUserId: number; title: string; documentJson: Record<string, unknown>; version: number; createdAt: string; updatedAt: string }
export interface AtelierPrompt { id: number; projectId: number; title: string; tags: string[]; version: number; createdByUserId: number; updatedByUserId: number; content: string; createdAt: string; updatedAt: string }
export interface AtelierAiCapability { mediaType: 'image' | 'video' | 'audio'; enabled: boolean; operations: string[]; providerKey: string | null; providerName: string | null; models: Array<{ id: string; label: string; operations: string[]; supports: Record<string, boolean | undefined> }> }

export const listAtelierCanvases = async (): Promise<AtelierCanvas[]> => (await request.get<AtelierCanvas[]>('/api/infinite-atelier/canvases')).data
export const getAtelierCanvas = async (id: number): Promise<AtelierCanvas> => (await request.get<AtelierCanvas>(`/api/infinite-atelier/canvases/${id}`)).data
export const createAtelierCanvas = async (payload: { title: string; documentJson: Record<string, unknown> }): Promise<AtelierCanvas> => (await request.post<AtelierCanvas>('/api/infinite-atelier/canvases', payload)).data
export const updateAtelierCanvas = async (id: number, payload: { version: number; title?: string; documentJson?: Record<string, unknown> }): Promise<AtelierCanvas> => (await request.put<AtelierCanvas>(`/api/infinite-atelier/canvases/${id}`, payload)).data
export const deleteAtelierCanvas = async (id: number) => request.delete(`/api/infinite-atelier/canvases/${id}`)
export const listAtelierPrompts = async (q?: string): Promise<AtelierPrompt[]> => (await request.get<AtelierPrompt[]>(`/api/infinite-atelier/prompts${q ? `?q=${encodeURIComponent(q)}` : ''}`)).data
export const createAtelierPrompt = async (payload: { title: string; content: string; tags?: string[] }): Promise<AtelierPrompt> => (await request.post<AtelierPrompt>('/api/infinite-atelier/prompts', payload)).data
export const updateAtelierPrompt = async (id: number, payload: { version: number; title?: string; content?: string; tags?: string[] }): Promise<AtelierPrompt> => (await request.put<AtelierPrompt>(`/api/infinite-atelier/prompts/${id}`, payload)).data
export const deleteAtelierPrompt = async (id: number) => request.delete(`/api/infinite-atelier/prompts/${id}`)
export const getAtelierAiCapabilities = async (): Promise<{ items: AtelierAiCapability[] }> => (await request.get<{ items: AtelierAiCapability[] }>('/api/infinite-atelier/ai/capabilities')).data
export type AtelierImageTask = { id: number; projectId: number; createdByUserId: number; model: string; operation: string; status: 'pending' | 'processing' | 'succeeded' | 'failed'; progress: number; errorCode: string | null; errorMessage: string | null; outputs?: Array<{ url?: string; contentType?: string; base64?: string }>; nextPollAfterMs?: number }
export const createAtelierImageTask = async (payload: { model?: string; prompt: string; size?: string; n?: number; idempotencyKey?: string; references?: Array<{ url?: string }> }): Promise<AtelierImageTask> => (await request.post<AtelierImageTask>('/api/infinite-atelier/images/generate', payload)).data
export const pollAtelierImageTask = async (id: number): Promise<AtelierImageTask> => (await request.get<AtelierImageTask>(`/api/infinite-atelier/images/tasks/${id}`)).data
