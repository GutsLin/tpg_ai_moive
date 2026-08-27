import { AppstoreAddOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Modal, Select, Space, Tag, Typography, message } from 'antd'
import { useEffect, useRef, useState } from 'react'

import type { AssetItem } from '../../api/assets'
import type { ActiveVideoProvider, CreateVideoTaskPayload } from '../../api/videos'
import { getActiveVideoProvider } from '../../api/video-provider'
import { getMyApiKeys } from '../../api/user-api-keys'
import { useAuth } from '../../stores/auth'
import { clearVideoDraft, readVideoDraft, writeVideoDraft } from '../../utils/video-draft-storage'
import { AssetMediaPreview } from './AssetMediaPreview'
import { AssetPickerModal } from './AssetPickerModal'
import { PromptInput } from './PromptInput'

const fallbackModelId = 'seedance-2'
const legacyFallbackProvider: ActiveVideoProvider = {
  providerKey: 'toapis',
  name: 'ToAPIs',
  providerType: 'toapis',
  capabilities: {
    version: 1,
    models: [
      {
        id: 'seedance-2', label: 'Seedance 2.0', duration: { min: 4, max: 15, auto: true },
        resolutions: ['480p', '720p'], aspectRatios: ['16:9', '9:16', '1:1'], operations: ['generate'],
        supports: { firstLastFrame: true, referenceImage: true, referenceVideo: true, referenceAudio: true, generateAudio: true },
      },
      {
        id: 'seedance-2-fast', label: 'Seedance 2.0 fast', duration: { min: 4, max: 15, auto: true },
        resolutions: ['480p', '720p'], aspectRatios: ['16:9', '9:16', '1:1'], operations: ['generate'],
        supports: { firstLastFrame: true, referenceImage: true, referenceVideo: true, referenceAudio: true, generateAudio: true },
      },
    ],
  },
}
const modeOptions = [
  { label: '首尾帧模式', value: 'frames' as const },
  { label: '全能参考模式', value: 'omni' as const },
]

const stripPromptMentions = (value: string) => value.replace(/@/g, '').trim()
const resolveErrorMessage = (error: any, fallback: string) => error?.response?.data?.message ?? fallback

interface SharedGenerateSettings {
  model: string
  ratio: string
  duration: number
  resolution: string
  generateAudio: boolean
}

interface FrameModeDraft extends SharedGenerateSettings {
  prompt: string
  firstFrame: AssetItem | null
  lastFrame: AssetItem | null
}

interface OmniModeDraft extends SharedGenerateSettings {
  prompt: string
  references: AssetItem[]
}

interface VideoGenerateDraft {
  mode: 'frames' | 'omni'
  frame: FrameModeDraft
  omni: OmniModeDraft
}

interface GenerateConfirmationState {
  payload: CreateVideoTaskPayload
  summary: Array<{ label: string; value: string }>
}

const defaultFrameDraft = (): FrameModeDraft => ({
  model: fallbackModelId,
  ratio: '16:9',
  duration: 5,
  resolution: '720p',
  generateAudio: true,
  prompt: '',
  firstFrame: null,
  lastFrame: null,
})

const defaultOmniDraft = (): OmniModeDraft => ({
  model: fallbackModelId,
  ratio: '16:9',
  duration: 5,
  resolution: '720p',
  generateAudio: true,
  prompt: '',
  references: [],
})

const readDraft = (projectId: number): VideoGenerateDraft | null => {
  const parsed = readVideoDraft<Partial<VideoGenerateDraft>>(projectId)
  if (!parsed) {
    return null
  }

  const fallbackFrame = defaultFrameDraft()
  const fallbackOmni = defaultOmniDraft()

  const legacyShared = {
    model: typeof (parsed as any).model === 'string' ? (parsed as any).model : fallbackFrame.model,
    ratio: typeof (parsed as any).ratio === 'string' ? (parsed as any).ratio : fallbackFrame.ratio,
    duration: typeof (parsed as any).duration === 'number' ? (parsed as any).duration : fallbackFrame.duration,
    resolution: typeof (parsed as any).resolution === 'string' ? (parsed as any).resolution : fallbackFrame.resolution,
    generateAudio: typeof (parsed as any).generateAudio === 'boolean' ? (parsed as any).generateAudio : fallbackFrame.generateAudio,
  }

  const frameSource = parsed.frame ?? {
    ...legacyShared,
    prompt: typeof (parsed as any).framePrompt === 'string' ? (parsed as any).framePrompt : fallbackFrame.prompt,
    firstFrame: (parsed as any).firstFrame,
    lastFrame: (parsed as any).lastFrame,
  }

  const omniSource = parsed.omni ?? {
    ...legacyShared,
    prompt: typeof (parsed as any).omniPrompt === 'string' ? (parsed as any).omniPrompt : fallbackOmni.prompt,
    references: (parsed as any).references,
  }

  return {
    mode: parsed.mode === 'omni' ? 'omni' : 'frames',
    frame: {
      model: typeof frameSource.model === 'string' ? frameSource.model : fallbackFrame.model,
      ratio: typeof frameSource.ratio === 'string' ? frameSource.ratio : fallbackFrame.ratio,
      duration: typeof frameSource.duration === 'number' ? frameSource.duration : fallbackFrame.duration,
      resolution: typeof frameSource.resolution === 'string' ? frameSource.resolution : fallbackFrame.resolution,
      generateAudio: typeof frameSource.generateAudio === 'boolean' ? frameSource.generateAudio : fallbackFrame.generateAudio,
      prompt: typeof frameSource.prompt === 'string' ? frameSource.prompt : fallbackFrame.prompt,
      firstFrame: frameSource.firstFrame && typeof frameSource.firstFrame === 'object' ? (frameSource.firstFrame as AssetItem) : null,
      lastFrame: frameSource.lastFrame && typeof frameSource.lastFrame === 'object' ? (frameSource.lastFrame as AssetItem) : null,
    },
    omni: {
      model: typeof omniSource.model === 'string' ? omniSource.model : fallbackOmni.model,
      ratio: typeof omniSource.ratio === 'string' ? omniSource.ratio : fallbackOmni.ratio,
      duration: typeof omniSource.duration === 'number' ? omniSource.duration : fallbackOmni.duration,
      resolution: typeof omniSource.resolution === 'string' ? omniSource.resolution : fallbackOmni.resolution,
      generateAudio: typeof omniSource.generateAudio === 'boolean' ? omniSource.generateAudio : fallbackOmni.generateAudio,
      prompt: typeof omniSource.prompt === 'string' ? omniSource.prompt : fallbackOmni.prompt,
      references: Array.isArray(omniSource.references) ? (omniSource.references as AssetItem[]) : [],
    },
  }
}

const writeDraft = (projectId: number, draft: VideoGenerateDraft) => {
  writeVideoDraft(projectId, draft)
}

const isFrameDraftEmpty = (draft: FrameModeDraft) =>
  draft.model === fallbackModelId &&
  draft.ratio === '16:9' &&
  draft.duration === 5 &&
  draft.resolution === '720p' &&
  draft.generateAudio &&
  draft.prompt === '' &&
  draft.firstFrame === null &&
  draft.lastFrame === null

const isOmniDraftEmpty = (draft: OmniModeDraft) =>
  draft.model === fallbackModelId &&
  draft.ratio === '16:9' &&
  draft.duration === 5 &&
  draft.resolution === '720p' &&
  draft.generateAudio &&
  draft.prompt === '' &&
  draft.references.length === 0

export interface GeneratePanelReplayDraft {
  mode: 'frames' | 'omni'
  model: string
  ratio: string
  duration: number
  resolution: string
  generateAudio: boolean
  promptRaw: string
  firstFrame: AssetItem | null
  lastFrame: AssetItem | null
  references: AssetItem[]
}

export const GeneratePanel = ({
  onSubmit,
  replayDraft,
}: {
  onSubmit: (payload: CreateVideoTaskPayload) => Promise<void>
  replayDraft?: GeneratePanelReplayDraft | null
}) => {
  const { state } = useAuth()
  const projectId = state.activeProjectId
  const rootRef = useRef<HTMLElement | null>(null)
  const [mode, setMode] = useState<'frames' | 'omni'>('frames')
  const [model, setModel] = useState(fallbackModelId)
  const [ratio, setRatio] = useState('16:9')
  const [duration, setDuration] = useState(5)
  const [resolution, setResolution] = useState('720p')
  const [generateAudio, setGenerateAudio] = useState(true)
  const [framePrompt, setFramePrompt] = useState('')
  const [omniPrompt, setOmniPrompt] = useState('')
  const [firstFrame, setFirstFrame] = useState<AssetItem | null>(null)
  const [lastFrame, setLastFrame] = useState<AssetItem | null>(null)
  const [references, setReferences] = useState<AssetItem[]>([])
  const [pickerMode, setPickerMode] = useState<'first' | 'last' | 'reference' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [frameModeDraft, setFrameModeDraft] = useState<FrameModeDraft>(defaultFrameDraft)
  const [omniModeDraft, setOmniModeDraft] = useState<OmniModeDraft>(defaultOmniDraft)
  const [hydratedProjectId, setHydratedProjectId] = useState<number | null>(null)
  const [messageApi, contextHolder] = message.useMessage()
  const [confirmationState, setConfirmationState] = useState<GenerateConfirmationState | null>(null)
  const [provider, setProvider] = useState<ActiveVideoProvider | null>(null)
  const [providerLoading, setProviderLoading] = useState(true)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [missingPersonalKey, setMissingPersonalKey] = useState(false)

  const apiKeyMode = state.apiKeyMode

  const selectedModel = provider?.capabilities.models.find((item) => item.id === model) ?? null
  const modelOptions = provider?.capabilities.models.map((item) => ({ label: item.label, value: item.id })) ?? []
  const ratioOptions = selectedModel?.aspectRatios ?? []
  const resolutionOptions = selectedModel?.resolutions ?? []
  const durationOptions = selectedModel
    ? [
        ...(selectedModel.duration.auto ? [-1] : []),
        ...Array.from({ length: selectedModel.duration.max - selectedModel.duration.min + 1 }, (_, index) => selectedModel.duration.min + index),
      ]
    : []

  const buildCurrentFrameDraft = (): FrameModeDraft => ({
    model,
    ratio,
    duration,
    resolution,
    generateAudio,
    prompt: framePrompt,
    firstFrame,
    lastFrame,
  })

  const buildCurrentOmniDraft = (): OmniModeDraft => ({
    model,
    ratio,
    duration,
    resolution,
    generateAudio,
    prompt: omniPrompt,
    references,
  })

  const applySharedSettings = (draft: SharedGenerateSettings) => {
    setModel(draft.model)
    setRatio(draft.ratio)
    setDuration(draft.duration)
    setResolution(draft.resolution)
    setGenerateAudio(draft.generateAudio)
  }

  const applyFrameDraft = (draft: FrameModeDraft) => {
    setMode('frames')
    applySharedSettings(draft)
    setFramePrompt(draft.prompt)
    setFirstFrame(draft.firstFrame)
    setLastFrame(draft.lastFrame)
    setPickerMode(null)
  }

  const applyOmniDraft = (draft: OmniModeDraft) => {
    setMode('omni')
    applySharedSettings(draft)
    setOmniPrompt(draft.prompt)
    setReferences(draft.references)
    setPickerMode(null)
  }

  const isDraftEmpty = (() => {
    const persistedFrameDraft = mode === 'frames' ? buildCurrentFrameDraft() : frameModeDraft
    const persistedOmniDraft = mode === 'omni' ? buildCurrentOmniDraft() : omniModeDraft
    return isFrameDraftEmpty(persistedFrameDraft) && isOmniDraftEmpty(persistedOmniDraft)
  })()

  useEffect(() => {
    let cancelled = false
    setProviderLoading(true)
    const providerRequest = typeof getActiveVideoProvider === 'function'
      ? getActiveVideoProvider()
      : Promise.resolve(legacyFallbackProvider)
    void providerRequest
      .then((nextProvider) => {
        if (cancelled) return
        setProvider(nextProvider)
        setProviderError(null)
      })
      .catch((error: any) => {
        if (cancelled) return
        setProvider(null)
        setProviderError(resolveErrorMessage(error, '视频生成平台加载失败'))
      })
      .finally(() => {
        if (!cancelled) setProviderLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (apiKeyMode !== 'per_member') {
      setMissingPersonalKey(false)
      return
    }

    let cancelled = false
    void getMyApiKeys()
      .then((result) => {
        if (cancelled) return
        const hasKey = result.items.some((item) => item.enabled)
        setMissingPersonalKey(!hasKey)
      })
      .catch(() => {
        if (cancelled) return
        setMissingPersonalKey(false)
      })

    return () => { cancelled = true }
  }, [apiKeyMode])

  useEffect(() => {
    const initialModel = provider?.capabilities.models[0]
    if (!initialModel) return
    const resolvedModel = provider.capabilities.models.find((item) => item.id === model) ?? initialModel
    if (resolvedModel.id !== model) setModel(resolvedModel.id)
    if (!resolvedModel.resolutions.includes(resolution)) setResolution(resolvedModel.resolutions[0])
    if (!resolvedModel.aspectRatios.includes(ratio)) setRatio(resolvedModel.aspectRatios.includes('16:9') ? '16:9' : resolvedModel.aspectRatios[0])
    if (duration !== -1 && (duration < resolvedModel.duration.min || duration > resolvedModel.duration.max)) setDuration(resolvedModel.duration.min)
    if (!resolvedModel.supports.generateAudio && generateAudio) setGenerateAudio(false)
  }, [provider, model, ratio, resolution, duration, generateAudio])

  useEffect(() => {
    if (projectId === null) {
      setHydratedProjectId(null)
      return
    }

    const restored = readDraft(projectId) ?? {
      mode: 'frames',
      frame: defaultFrameDraft(),
      omni: defaultOmniDraft(),
    }
    setFrameModeDraft(restored.frame)
    setOmniModeDraft(restored.omni)
    if (restored.mode === 'frames') {
      applyFrameDraft(restored.frame)
    } else {
      applyOmniDraft(restored.omni)
    }
    setHydratedProjectId(projectId)
  }, [projectId])

  useEffect(() => {
    if (projectId === null || hydratedProjectId !== projectId) {
      return
    }

    if (isDraftEmpty) {
      clearVideoDraft(projectId)
      return
    }

    const persistedFrameDraft = mode === 'frames' ? buildCurrentFrameDraft() : frameModeDraft
    const persistedOmniDraft = mode === 'omni' ? buildCurrentOmniDraft() : omniModeDraft

    writeDraft(projectId, {
      mode,
      frame: persistedFrameDraft,
      omni: persistedOmniDraft,
    })
  }, [
    duration,
    firstFrame,
    frameModeDraft,
    framePrompt,
    generateAudio,
    hydratedProjectId,
    lastFrame,
    mode,
    model,
    omniModeDraft,
    omniPrompt,
    projectId,
    ratio,
    references,
    resolution,
    isDraftEmpty,
  ])

  useEffect(() => {
    if (!replayDraft) {
      return
    }

    if (mode === 'frames') {
      setFrameModeDraft(buildCurrentFrameDraft())
    } else {
      setOmniModeDraft(buildCurrentOmniDraft())
    }

    const nextShared = {
      model: replayDraft.model,
      ratio: replayDraft.ratio,
      duration: replayDraft.duration,
      resolution: replayDraft.resolution,
      generateAudio: replayDraft.generateAudio,
    }

    if (replayDraft.mode === 'frames') {
      const nextFrameDraft: FrameModeDraft = {
        ...nextShared,
        prompt: replayDraft.promptRaw,
        firstFrame: replayDraft.firstFrame,
        lastFrame: replayDraft.lastFrame,
      }
      setFrameModeDraft(nextFrameDraft)
      applyFrameDraft(nextFrameDraft)
    } else {
      const nextOmniDraft: OmniModeDraft = {
        ...nextShared,
        prompt: replayDraft.promptRaw,
        references: replayDraft.references,
      }
      setOmniModeDraft(nextOmniDraft)
      applyOmniDraft(nextOmniDraft)
    }

    window.setTimeout(() => {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      const promptLabel = replayDraft.mode === 'frames' ? '首尾帧提示词' : '创意提示词'
      const promptElement = document.querySelector(`textarea[aria-label="${promptLabel}"]`) as HTMLTextAreaElement | null
      promptElement?.focus()
    }, 0)
  }, [replayDraft])

  const handlePickAsset = (asset: AssetItem) => {
    if (pickerMode === 'first') {
      setFirstFrame(asset)
    } else if (pickerMode === 'last') {
      setLastFrame(asset)
    } else if (pickerMode === 'reference') {
      const fallbackLimits = { image: 9, video: 3, audio: 3 } as const
      const resolveLimit = (assetType: AssetItem['assetType']) => {
        const key = assetType.toLowerCase() as keyof typeof fallbackLimits
        // 生效上限 = 全局配置与所选模型上限的较小值；两者都缺失时才回退到内置默认值
        const candidates = [
          provider?.referenceLimits?.[key],
          selectedModel?.referenceLimits?.[key],
        ].filter((value): value is number => typeof value === 'number' && value >= 1)
        return candidates.length > 0 ? Math.min(...candidates) : fallbackLimits[key]
      }
      const limits = {
        Image: resolveLimit('Image'),
        Video: resolveLimit('Video'),
        Audio: resolveLimit('Audio'),
      }
      const existing = references.filter((item) => item.assetType === asset.assetType)
      if (existing.length >= limits[asset.assetType]) {
        void messageApi.warning(`${asset.assetType} 类型已达到可选上限`)
        return
      }
      setReferences((current) => (current.some((item) => item.id === asset.id) ? current : [...current, asset]))
    }

    setPickerMode(null)
  }

  const handleSubmit = async () => {
    if (!provider || !selectedModel) {
      void messageApi.error(providerError ?? '当前没有可用的视频生成平台')
      return
    }
    const payload =
      mode === 'frames'
        ? buildFramePayload({
            mode,
            model,
            ratio,
            duration,
            resolution,
            generateAudio,
            providerKey: provider.providerKey,
            prompt: framePrompt,
            firstFrame,
            lastFrame,
          })
        : buildOmniPayload({
            mode,
            model,
            ratio,
            duration,
            resolution,
            generateAudio,
            providerKey: provider.providerKey,
            promptRaw: omniPrompt,
            references,
          })

    if (!payload) {
      void messageApi.warning(mode === 'frames' ? '请至少选择首帧并填写提示词' : '请填写提示词并选择至少一个参考素材')
      return
    }

    setConfirmationState({
      payload,
      summary: buildConfirmationSummary({
        mode,
        model,
        resolution,
        ratio,
        duration,
        generateAudio,
        assetCount: mode === 'frames' ? [firstFrame, lastFrame].filter(Boolean).length : references.length,
        promptSummary: (mode === 'frames' ? framePrompt : omniPrompt).trim(),
      }),
    })
  }

  const handleConfirmSubmit = async () => {
    if (!confirmationState) {
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(confirmationState.payload)
      if (mode === 'frames') {
        const clearedFrameDraft = defaultFrameDraft()
        setFrameModeDraft(clearedFrameDraft)
        applyFrameDraft(clearedFrameDraft)
      } else {
        const clearedOmniDraft = defaultOmniDraft()
        setOmniModeDraft(clearedOmniDraft)
        applyOmniDraft(clearedOmniDraft)
      }
      setConfirmationState(null)
      void messageApi.success('生成任务已提交')
    } catch (error: any) {
      setConfirmationState(null)
      void messageApi.error(resolveErrorMessage(error, '生成任务提交失败，请稍后重试'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleClearDraft = () => {
    setFrameModeDraft(defaultFrameDraft())
    setOmniModeDraft(defaultOmniDraft())
    if (projectId !== null) {
      clearVideoDraft(projectId)
    }
    applyFrameDraft(defaultFrameDraft())
    void messageApi.success('草稿已清空')
  }

  const handleModeChange = (nextMode: 'frames' | 'omni') => {
    if (nextMode === mode) {
      return
    }

    if (mode === 'frames') {
      setFrameModeDraft(buildCurrentFrameDraft())
      applyOmniDraft(omniModeDraft)
      return
    }

    setOmniModeDraft(buildCurrentOmniDraft())
    applyFrameDraft(frameModeDraft)
  }

  return (
    <>
      {contextHolder}
      <section
        ref={rootRef}
        style={{
          borderRadius: 32,
          border: '1px solid #dbe4ea',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.05)',
          padding: 24,
        }}
      >
        <Space orientation="vertical" size={18} style={{ width: '100%' }}>
          {apiKeyMode === 'per_member' && missingPersonalKey ? (
            <Alert
              type="warning"
              showIcon
              message="您尚未配置个人 API Key，当前无法生成视频"
              description="请联系管理员在「用户管理」中为您配置 ToAPIs API Key。"
            />
          ) : null}

          <div
            role="radiogroup"
            aria-label="生成模式"
            style={{
              display: 'inline-flex',
              gap: 8,
              padding: 4,
              borderRadius: 999,
              background: '#f1f5f9',
              border: '1px solid #dbe4ea',
              alignSelf: 'flex-start',
            }}
          >
            {modeOptions.map((item) => {
              const active = mode === item.value

              return (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => handleModeChange(item.value)}
                  style={{
                    border: 'none',
                    borderRadius: 999,
                    padding: '10px 16px',
                    background: active ? '#111827' : 'transparent',
                    color: active ? '#f8fafc' : '#475569',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          <Space size={12} wrap>
            <Tag color="blue">{providerLoading ? '加载平台中...' : provider?.name ?? '未配置平台'}</Tag>
            <Select value={model} style={{ width: 220 }} options={modelOptions} onChange={setModel} loading={providerLoading} disabled={!provider} />
            <Select value={resolution} style={{ width: 120 }} options={resolutionOptions.map((item) => ({ label: item, value: item }))} onChange={setResolution} disabled={!selectedModel} />
            <Select value={duration} style={{ width: 120 }} options={durationOptions.map((item) => ({ label: item === -1 ? '自动' : `${item}s`, value: item }))} onChange={setDuration} disabled={!selectedModel} />
            <Select value={ratio} style={{ width: 120 }} options={ratioOptions.map((item) => ({ label: item, value: item }))} onChange={setRatio} disabled={!selectedModel} />
            <Button icon={<ReloadOutlined aria-hidden="true" />} onClick={() => setGenerateAudio((value) => !value)} disabled={!selectedModel?.supports.generateAudio}>
              {generateAudio ? '带音频' : '静音'}
            </Button>
          </Space>

          {mode === 'frames' ? (
            <Space orientation="vertical" size={14} style={{ width: '100%' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: 12,
                }}
              >
                <SelectionCard
                  title="首帧"
                  value={firstFrame?.name ?? '尚未选择'}
                  helperText="预览会直接显示在右侧，保持原图比例完整展示，不再裁切。"
                  actionLabel={firstFrame ? '重新选择首帧' : '选择首帧'}
                  previewAlt="首帧预览"
                  asset={firstFrame}
                  onAction={() => setPickerMode('first')}
                />
                <SelectionCard
                  title="尾帧"
                  value={lastFrame?.name ?? '可选'}
                  helperText="预览会直接显示在右侧，保持原图比例完整展示，不再裁切。"
                  actionLabel={lastFrame ? '重新选择尾帧' : '选择尾帧'}
                  previewAlt="尾帧预览"
                  asset={lastFrame}
                  onAction={() => setPickerMode('last')}
                />
              </div>
              <PromptInput
                value={framePrompt}
                onChange={setFramePrompt}
                availableMentions={[firstFrame?.name, lastFrame?.name].filter((n): n is string => Boolean(n))}
                ariaLabel="首尾帧提示词"
                placeholder="描述镜头动作、运镜和氛围，例如：镜头缓慢推近，角色抬头看向远方。"
              />
            </Space>
          ) : (
            <Space orientation="vertical" size={14} style={{ width: '100%' }}>
              <Space wrap>
                <Button
                  icon={<AppstoreAddOutlined aria-hidden="true" />}
                  aria-label="添加参考素材"
                  onClick={() => setPickerMode('reference')}
                >
                  添加参考素材
                </Button>
                {references.map((item) => (
                  <Button key={item.id} onClick={() => setReferences((current) => current.filter((entry) => entry.id !== item.id))}>
                    移除 {item.name}
                  </Button>
                ))}
              </Space>
              <PromptInput
                value={omniPrompt}
                onChange={setOmniPrompt}
                availableMentions={references.map((item) => item.name)}
                ariaLabel="创意提示词"
                placeholder="输入创意描述，可使用 @素材名 引用已选素材"
              />
              {references.length > 0 ? (
                <ReferencePreviewSection
                  references={references}
                  onRemove={(assetId) => setReferences((current) => current.filter((entry) => entry.id !== assetId))}
                />
              ) : null}
            </Space>
          )}

          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={handleClearDraft} disabled={isDraftEmpty}>
              清空草稿
            </Button>
            <Button type="primary" size="large" loading={submitting} disabled={!provider || !selectedModel || (apiKeyMode === 'per_member' && missingPersonalKey)} onClick={() => void handleSubmit()}>
              开始生成
            </Button>
          </Space>
        </Space>
      </section>

      <AssetPickerModal
        open={pickerMode !== null}
        title={pickerMode === 'reference' ? '选择参考素材' : pickerMode === 'last' ? '选择尾帧' : '选择首帧'}
        acceptedTypes={pickerMode === 'reference' ? ['Image', 'Video', 'Audio'] : ['Image']}
        onClose={() => setPickerMode(null)}
        onPick={handlePickAsset}
      />

      <Modal
        open={confirmationState !== null}
        title="生成参数确认"
        okText="确认提交"
        cancelText="返回编辑"
        confirmLoading={submitting}
        destroyOnHidden
        onCancel={() => {
          if (!submitting) {
            setConfirmationState(null)
          }
        }}
        onOk={() => {
          void handleConfirmSubmit()
        }}
      >
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            请在提交前再次确认关键参数。本次只做提交前校验，不会调用火山侧取消任务能力。
          </Typography.Paragraph>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
            }}
          >
            {confirmationState?.summary.map((item) => (
              <div
                key={item.label}
                style={{
                  borderRadius: 16,
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  padding: '12px 14px',
                }}
              >
                <Typography.Text type="secondary">{item.label}</Typography.Text>
                <Typography.Paragraph style={{ margin: '6px 0 0', color: '#0f172a' }}>
                  {item.value}
                </Typography.Paragraph>
              </div>
            ))}
          </div>
        </Space>
      </Modal>
    </>
  )
}

const SelectionCard = ({
  title,
  value,
  helperText,
  actionLabel,
  previewAlt,
  asset,
  onAction,
}: {
  title: string
  value: string
  helperText: string
  actionLabel: string
  previewAlt: string
  asset: AssetItem | null
  onAction: () => void
}) => (
  <div
    style={{
      borderRadius: 22,
      border: '1px solid #e2e8f0',
      background: '#f8fafc',
      padding: 18,
    }}
  >
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(156px, 196px)',
        gap: 16,
        alignItems: 'stretch',
      }}
    >
      <Space orientation="vertical" size={10} style={{ width: '100%' }}>
        <Typography.Text type="secondary">{title}</Typography.Text>
        <Typography.Text strong>{value}</Typography.Text>
        <Typography.Text type="secondary">{helperText}</Typography.Text>
        <Button onClick={onAction}>{actionLabel}</Button>
      </Space>

      <div
        style={{
          borderRadius: 16,
          border: '1px solid #dbe4ea',
          background: '#ffffff',
          minHeight: 176,
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {asset ? (
          <img
            src={asset.thumbnailUrl}
            alt={previewAlt}
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: 152,
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
            }}
          />
        ) : (
          <Typography.Text type="secondary" style={{ textAlign: 'center' }}>
            选择后在这里预览
          </Typography.Text>
        )}
      </div>
    </div>
  </div>
)

const ReferencePreviewSection = ({
  references,
  onRemove,
}: {
  references: AssetItem[]
  onRemove: (assetId: number) => void
}) => (
  <Space orientation="vertical" size={12} style={{ width: '100%' }}>
    <div>
      <Typography.Text type="secondary">已选参考素材</Typography.Text>
      <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
        这里会直接展示图片、视频和音频的可预览内容，避免引用错素材。
      </Typography.Paragraph>
    </div>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
      }}
    >
      {references.map((item) => (
        <div
          key={item.id}
          style={{
            borderRadius: 18,
            border: '1px solid #dbe4ea',
            background: '#ffffff',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: 140,
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12,
            }}
          >
            <AssetMediaPreview
              asset={item}
              imageAlt={`${item.name} 预览`}
              videoLabel={`已选参考视频预览-${item.id}`}
              audioLabel={`已选参考音频播放-${item.id}`}
              height={140}
            />
          </div>
          <div style={{ padding: 12 }}>
            <Space orientation="vertical" size={8} style={{ width: '100%' }}>
              <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
                <Tag style={{ marginInlineEnd: 0, borderRadius: 999 }}>
                  {item.assetType === 'Image' ? '图片' : item.assetType === 'Video' ? '视频' : '音频'}
                </Tag>
                <Button type="text" size="small" onClick={() => onRemove(item.id)}>
                  移除
                </Button>
              </Space>
              <Typography.Text strong>{item.name}</Typography.Text>
            </Space>
          </div>
        </div>
      ))}
    </div>
  </Space>
)

const buildFramePayload = ({
  providerKey,
  mode,
  model,
  ratio,
  duration,
  resolution,
  generateAudio,
  prompt,
  firstFrame,
  lastFrame,
}: {
  providerKey: string
  mode: 'frames'
  model: string
  ratio: string
  duration: number
  resolution: string
  generateAudio: boolean
  prompt: string
  firstFrame: AssetItem | null
  lastFrame: AssetItem | null
}): CreateVideoTaskPayload | null => {
  const normalizedPrompt = stripPromptMentions(prompt)
  if (!firstFrame || !normalizedPrompt) {
    return null
  }

  return {
    providerKey,
    mode,
    model,
    operation: 'generate',
    outputFormat: 'mp4',
    prompt: normalizedPrompt,
    promptRaw: prompt,
    duration,
    ratio,
    resolution,
    generateAudio,
    content: [
      { type: 'text', text: normalizedPrompt },
      {
        type: 'image_url',
        image_url: { url: resolveAssetContentUrl(firstFrame) },
        assetId: firstFrame.id,
        role: 'first_frame',
      },
      ...(lastFrame
        ? [
            {
              type: 'image_url' as const,
              image_url: { url: resolveAssetContentUrl(lastFrame) },
              assetId: lastFrame.id,
              role: 'last_frame' as const,
            },
          ]
        : []),
    ],
  }
}

const buildConfirmationSummary = ({
  mode,
  model,
  resolution,
  ratio,
  duration,
  generateAudio,
  assetCount,
  promptSummary,
}: {
  mode: 'frames' | 'omni'
  model: string
  resolution: string
  ratio: string
  duration: number
  generateAudio: boolean
  assetCount: number
  promptSummary: string
}) => [
  { label: '生成模式', value: mode === 'frames' ? '首尾帧模式' : '全能参考模式' },
  { label: '模型', value: model },
  { label: '分辨率', value: resolution },
  { label: '画幅比例', value: ratio },
  { label: '时长', value: `${duration} 秒` },
  { label: '音频', value: generateAudio ? '带音频' : '静音' },
  { label: '素材数量', value: `${assetCount}` },
  { label: '提示词摘要', value: promptSummary || '未填写' },
]

const buildOmniPayload = ({
  providerKey,
  mode,
  model,
  ratio,
  duration,
  resolution,
  generateAudio,
  promptRaw,
  references,
}: {
  providerKey: string
  mode: 'omni'
  model: string
  ratio: string
  duration: number
  resolution: string
  generateAudio: boolean
  promptRaw: string
  references: AssetItem[]
}): CreateVideoTaskPayload | null => {
  const prompt = stripPromptMentions(promptRaw)
  if (!prompt || references.length === 0) {
    return null
  }

  return {
    providerKey,
    mode,
    model,
    operation: 'generate',
    outputFormat: 'mp4',
    prompt,
    promptRaw,
    duration,
    ratio,
    resolution,
    generateAudio,
    content: [
      { type: 'text', text: prompt },
      ...references.map((item) => {
        if (item.assetType === 'Image') {
          return {
            type: 'image_url' as const,
            image_url: { url: resolveAssetContentUrl(item) },
            assetId: item.id,
            role: 'reference_image' as const,
          }
        }
        if (item.assetType === 'Video') {
          return {
            type: 'video_url' as const,
            video_url: { url: resolveAssetContentUrl(item) },
            assetId: item.id,
            role: 'reference_video' as const,
          }
        }
        return {
          type: 'audio_url' as const,
          audio_url: { url: resolveAssetContentUrl(item) },
          assetId: item.id,
          role: 'reference_audio' as const,
        }
      }),
    ],
  }
}

const resolveAssetContentUrl = (asset: AssetItem): string => {
  if (asset.effectiveSync && asset.arkStatus === 'active' && asset.arkAssetId) {
    return `asset://${asset.arkAssetId}`
  }

  return asset.sourceUrl ?? asset.thumbnailUrl
}
