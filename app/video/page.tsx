"use client"

import { useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  Clock3,
  FileVideo,
  FolderOpen,
  ImagePlus,
  Layers3,
  ListChecks,
  Lock,
  Settings,
  RadioTower,
  Save,
  Search,
  Sparkles,
  SquareStop,
  UploadCloud,
  X,
} from "lucide-react"

import {
  FeatureFlagList,
  LicenseGate,
  useLicenseVerification,
} from "@/components/license-gate"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  createPublishDraft,
  readPublishDraft,
  recordPublishAutomationResult,
  savePublishDraft,
  sanitizePublishDraftForExport,
  startAuthorizedPublish,
  type PublishAccount,
  type PublishDraft,
} from "@/lib/video-publish"
import { hasLicenseFeature } from "@/lib/licensing"
import {
  createVideoTask,
  createVideoRecoverySnapshot,
  executeVideoTaskRecovery,
  planVideoTaskRecovery,
  readVideoTasks,
  saveVideoTasks,
  type VideoTask,
  type VideoProductionStep,
  type VideoWorkflowStepState,
} from "@/lib/video-task"
import {
  createTaskFileRef,
  createVideoTaskSnapshot,
  readVideoTaskSnapshot,
  saveVideoTaskSnapshot,
  type StoryboardShot,
  type VideoAsset,
  type VideoAssetKind,
  type VideoDurationPreset,
  type VideoPackageId,
  type VideoTimeline,
  type VideoTaskSnapshot,
  type VoicePlan,
} from "@/lib/video-domain"
import {
  API_PROFILE_SERVICES,
  buildApiProfileRequestContext,
  createApiFailoverLogEntry,
  createApiFailoverPlan,
  createApiProfileLogEntry,
  createDefaultApiProfileStore,
  readApiProfileStore,
  resolveApiProfile,
  runApiProfileFailover,
  saveApiProfileStore,
  setActiveApiProfile,
  upsertApiProfile,
  type ApiFailoverAttempt,
  type ApiProfile,
  type ApiProfileService,
  type ApiProfileStore,
} from "@/lib/api-profiles"
import {
  EXTERNAL_MATERIAL_LABEL_OPTIONS,
  IMAGE_GENERATION_PRESETS,
  VIDEO_ASSET_CATEGORY_OPTIONS,
  createExternalMaterialPlaceholderAsset,
  createImportedVideoAsset,
  createPerShotImageGenerationPlan,
  getExternalMaterialLabels,
  generateStickmanStoryboardAsset,
  normalizeVideoImageGenerationSettings,
  normalizeExternalMaterialLabels,
  prepareStickmanRegenerationBatch,
  removeVideoAssetFromInventory,
  type ExternalMaterialLabelId,
  type VideoImageGenerationRequest,
  type VideoImageGenerationPresetId,
  type VideoImageGenerationSettings,
} from "@/lib/video-assets"
import {
  COPYWRITING_BOARD_OPTIONS,
  DEFAULT_PRODUCT_CONVERSION_THEME,
  SCRIPT_REWRITE_MODE_OPTIONS,
  buildScriptGenerationRequest,
  createDefaultScriptWorkflowSettings,
  createModelVideoAnalysisDraft,
  createPastedScriptDraft,
  createScriptGenerationFailureDraft,
  readScriptWorkflowSettings,
  saveScriptWorkflowSettings,
  shouldRequestTextModelForScriptMode,
  type CopywritingBoardId,
  type ScriptGenerationRequest,
  type ScriptRewriteMode,
  type ScriptWorkflowMode,
  type ScriptWorkflowSettings,
  type VideoAnalysisDraft,
} from "@/lib/video-analysis"
import {
  VIDEO_DURATION_OPTIONS,
  VIDEO_PACKAGE_OPTIONS,
  createStoryboardFromScript,
  deleteStoryboardShotAndReindex,
} from "@/lib/video-storyboard"
import {
  createUnifiedVideoTimeline,
  createVoicePlanFromScript,
} from "@/lib/video-timeline"
import {
  COMMON_VIDEO_TTS_VOICE_PRESETS,
  createDefaultVideoTtsSettings,
  createVideoTtsLaunchPlan,
  resolveVideoTtsVoiceSelection,
  readVideoTtsSettings,
  saveVideoTtsSettings,
  type VideoTtsVoicePresetId,
  type VideoTtsSettings,
} from "@/lib/video-tts"
import {
  buildAiDirectorGenerationRequest,
  createImageAssetsDraftTimeline,
  createJianyingDraftPlan,
  createModelAiDirectorPlan,
  createRenderEngineOptions,
  type JianyingDraftPlan,
  type RenderEngineId,
  type RenderEngineOption,
} from "@/lib/video-rendering"
import {
  collectViralSourceCandidates,
  createDouyinLinkSourceCandidate,
  createLocalUploadSourceCandidate,
  type ViralSourceCandidate,
  type ViralSourceCollectionMode,
} from "@/lib/video-source-adapters"
import { imageSourceToBlob } from "@/lib/local-image-library"

const STICKMAN_IMAGE_CONCURRENCY = 8

type StickmanGenerationQueueState = {
  pending: StoryboardShot[]
  queuedShotIds: Set<string>
  activeShotIds: Set<string>
  completed: number
  failed: number
  total: number
  actionLabel: string
  fatalError?: Error
  stopRequested?: boolean
}

type StickmanGenerationQueueOptions = {
  clearExistingTargets?: boolean
}

const defaultPublishAccount: PublishAccount = {
  id: "douyin-main",
  displayName: "抖音主账号",
  platform: "douyin",
  browserProfileId: "work",
  authorized: true,
}

const apiProfileServiceLabels: Record<ApiProfileService, string> = {
  text_model: "文本模型",
  image_generation: "图片生成",
  cloud_tts: "云端 TTS",
  edit_director: "剪辑决策",
  video_parsing: "视频解析",
  publish_helper: "发布辅助",
}

const sourceModeLabels: Record<ViralSourceCollectionMode, string> = {
  recent_24_48h: "近 24-48 小时新爆款",
  stable_7d: "近 7 天稳态爆款",
}

const materialIntentRules: Array<{
  labelId: ExternalMaterialLabelId
  patterns: RegExp[]
}> = [
  { labelId: "opening_hook", patterns: [/开头|钩子|hook/i] },
  { labelId: "ending_conversion", patterns: [/结尾|转化|关注|下单|私信/i] },
  { labelId: "product_proof", patterns: [/证明|案例|结果|数据|对比/i] },
  { labelId: "tool_demo", patterns: [/工具|演示|操作|流程|界面/i] },
  { labelId: "real_drama_clip", patterns: [/漫剧|剧情|真人|片段/i] },
  { labelId: "emotion_boost", patterns: [/情绪|冲突|痛点|震惊|共鸣/i] },
]

function createRecoveryPlanFromSnapshot(snapshot: VideoTaskSnapshot) {
  const imageAssetIds = snapshot.assets
    .filter((asset) => asset.kind === "stickman_image")
    .map((asset) => asset.id)
  const voiceAssetIds = snapshot.voice.audio ? [snapshot.voice.audio.id] : []
  const subtitleIds = snapshot.voice.subtitles.map((cue) => cue.id)
  const draftAssetIds = snapshot.assets
    .filter((asset) => asset.kind === "jianying_draft")
    .map((asset) => asset.id)
  const recoverySnapshot = createVideoRecoverySnapshot({
    taskId: snapshot.id,
    steps: [
      {
        id: "images",
        state: imageAssetIds.length ? "success" : "waiting",
        assetIds: imageAssetIds,
      },
      {
        id: "tts",
        state: voiceAssetIds.length ? "success" : "waiting",
        assetIds: voiceAssetIds,
      },
      {
        id: "subtitles",
        state: subtitleIds.length ? "success" : "waiting",
        assetIds: subtitleIds,
      },
      {
        id: "timeline",
        state: snapshot.timeline.tracks.length ? "success" : "waiting",
      },
      {
        id: "draft",
        state: draftAssetIds.length ? "success" : "waiting",
        assetIds: draftAssetIds,
      },
      { id: "publish", state: "waiting" },
    ],
  })

  return planVideoTaskRecovery(recoverySnapshot, {
    hasApiBackup: true,
    localTtsAvailable: Boolean(snapshot.voice.audio),
  })
}

async function runRecoveryStepFromSnapshot(
  snapshot: VideoTaskSnapshot,
  step: VideoProductionStep
) {
  if (step.id === "tts") {
    return snapshot.voice.audio
      ? { ok: true, assetIds: [snapshot.voice.audio.id] }
      : { ok: false, reason: "local_tts_unavailable" }
  }
  if (step.id === "subtitles") {
    return snapshot.voice.subtitles.length
      ? { ok: true, assetIds: snapshot.voice.subtitles.map((cue) => cue.id) }
      : { ok: false, reason: "subtitle_cues_missing" }
  }
  if (step.id === "timeline") {
    return snapshot.timeline.tracks.length
      ? { ok: true, assetIds: snapshot.timeline.tracks.map((track) => track.id) }
      : { ok: false, reason: "timeline_missing" }
  }
  if (step.id === "draft") {
    const draftAssetIds = snapshot.assets
      .filter((asset) => asset.kind === "jianying_draft")
      .map((asset) => asset.id)

    return draftAssetIds.length
      ? { ok: true, assetIds: draftAssetIds }
      : { ok: false, reason: "jianying_draft_missing" }
  }
  if (step.id === "images") {
    const imageAssetIds = snapshot.assets
      .filter((asset) => asset.kind === "stickman_image")
      .map((asset) => asset.id)

    return imageAssetIds.length
      ? { ok: true, assetIds: imageAssetIds }
      : { ok: false, reason: "image_assets_missing" }
  }

  return { ok: false, reason: "manual_confirmation_required" }
}

function createModuleFailoverPlan(
  store: ApiProfileStore,
  service: ApiProfileService
) {
  const activeProfile = buildApiProfileRequestContext(store, service)
  const backupProfileIds = store.profiles[service]
    .map((profile) => profile.id)
    .filter((profileId) => profileId !== activeProfile.profileId)

  return createApiFailoverPlan(store, {
    service,
    primaryProfileId: activeProfile.profileId,
    backupProfileIds,
  })
}

function requestContextFromAttempt(attempt: ApiFailoverAttempt) {
  return {
    service: attempt.service,
    profileId: attempt.profileId,
    model: attempt.model,
    apiBaseUrl: attempt.apiBaseUrl,
    apiKey: attempt.apiKey,
  }
}

function formatApiFailoverSummary(
  label: string,
  result:
    | { ok: true; state: { activeProfileId: string; failedAttempts: Array<{ profileId: string }> } }
    | { ok: false; state: { activeProfileId: string; failedAttempts: Array<{ profileId: string }>; pauseReason: string }; error: string }
) {
  const failureCount = result.state.failedAttempts.length
  const activeProfileId = result.state.activeProfileId || "无可用 Profile"
  const pauseReason = result.ok ? "" : result.state.pauseReason || result.error
  return [
    `${label}：${activeProfileId}`,
    `失败 ${failureCount}`,
    pauseReason ? `暂停原因 ${pauseReason}` : "",
  ]
    .filter(Boolean)
    .join(" · ")
}

async function requestScriptGenerationText(
  request: ScriptGenerationRequest
) {
  if (!request.apiKey) {
    throw {
      message: "文本模型 Profile 尚未配置 API Key，已切换到备份路由。",
    }
  }

  const response = await fetch("/api/codex/chat/completions", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  })
  const payload = (await response.json().catch(() => null)) as {
    text?: unknown
    error?: unknown
  } | null

  if (!response.ok) {
    throw {
      status: response.status,
      message:
        typeof payload?.error === "string"
          ? payload.error
          : `文本模型请求失败：${response.status}`,
    }
  }

  const modelText = typeof payload?.text === "string" ? payload.text.trim() : ""
  if (!modelText) throw { message: "文本模型没有返回脚本内容" }
  return modelText
}

async function requestAiDirectorGeneration(
  request: ReturnType<typeof buildAiDirectorGenerationRequest>
) {
  if (!request.body.apiKey) {
    throw {
      message: "剪辑决策 Profile 尚未配置 API Key，已切换到备份路由。",
    }
  }

  const response = await fetch(request.endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request.body),
  })
  const payload = (await response.json().catch(() => null)) as {
    text?: unknown
    error?: unknown
  } | null

  if (!response.ok) {
    throw {
      status: response.status,
      message:
        typeof payload?.error === "string"
          ? payload.error
          : `剪辑决策模型请求失败：${response.status}`,
    }
  }

  const modelText = typeof payload?.text === "string" ? payload.text.trim() : ""
  if (!modelText) throw { message: "剪辑决策模型没有返回方案" }
  return modelText
}

async function requestImageGeneration(request: VideoImageGenerationRequest) {
  if (!request.apiKey) {
    throw {
      message: "图片生成 Profile 尚未配置 API Key，已切换到备份路由。",
    }
  }

  const response = await fetch(request.endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      prompt: request.prompt,
      negative_prompt: request.negativePrompt,
      apiBaseUrl: request.apiBaseUrl,
      apiKey: request.apiKey,
      size: request.size,
      quality: request.quality,
      aspectRatio: request.aspectRatio,
      styleStrength: request.styleStrength,
      n: 1,
    }),
  })
  const payload = (await response.json().catch(() => null)) as {
    images?: unknown
    error?: unknown
  } | null

  if (!response.ok) {
    throw {
      status: response.status,
      message:
        typeof payload?.error === "string"
          ? payload.error
          : `图片生成失败：${response.status}`,
    }
  }
  if (!Array.isArray(payload?.images)) {
    throw { message: "接口没有返回图片" }
  }
  return payload.images
}

function inferRequiredMaterialLabel(
  shot: Pick<StoryboardShot, "id" | "voiceText" | "visualDescription" | "prompt">
): ExternalMaterialLabelId | undefined {
  const text = `${shot.voiceText} ${shot.visualDescription} ${shot.prompt}`
  return materialIntentRules.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(text))
  )?.labelId
}

type VideoFactoryModuleId =
  | "overview"
  | "script"
  | "storyboard"
  | "assets"
  | "voice"
  | "draft"
  | "settings"

const videoFactoryModules: Array<{
  id: VideoFactoryModuleId
  label: string
}> = [
  { id: "overview", label: "任务总览" },
  { id: "script", label: "文案" },
  { id: "storyboard", label: "分镜" },
  { id: "assets", label: "素材" },
  { id: "voice", label: "配音字幕" },
  { id: "draft", label: "剪辑草稿" },
  { id: "settings", label: "设置" },
]

export default function VideoFactoryPage() {
  return (
    <LicenseGate feature="video_factory" title="视频工厂">
      <VideoFactoryShell />
    </LicenseGate>
  )
}

function VideoFactoryShell() {
  const license = useLicenseVerification()
  const [activeModule, setActiveModule] =
    useState<VideoFactoryModuleId>("overview")
  const [tasks, setTasks] = useState<VideoTask[]>([])
  const [activeTaskId, setActiveTaskId] = useState("")
  const [apiProfiles, setApiProfiles] = useState<ApiProfileStore>(
    createDefaultApiProfileStore
  )
  const [publishDraft, setPublishDraft] = useState<PublishDraft | null>(null)
  const [sourceKeyword, setSourceKeyword] = useState("剪映爆款")
  const [sourceMode, setSourceMode] =
    useState<ViralSourceCollectionMode>("recent_24_48h")
  const [sourceCandidates, setSourceCandidates] = useState<
    ViralSourceCandidate[]
  >([])
  const [sourceStatus, setSourceStatus] = useState("等待采集爆款来源")
  const [isCollectingSources, setIsCollectingSources] = useState(false)
  const [manualDouyinUrl, setManualDouyinUrl] = useState("")
  const [localUploadName, setLocalUploadName] = useState("")
  const [analysisTopic, setAnalysisTopic] =
    useState("AI 工具帮普通人一键生成短视频")
  const [analysisDraft, setAnalysisDraft] = useState<VideoAnalysisDraft | null>(
    null
  )
  const [scriptWorkflowMode, setScriptWorkflowMode] =
    useState<ScriptWorkflowMode>("semi_auto")
  const [scriptRewriteMode, setScriptRewriteMode] =
    useState<ScriptRewriteMode>("rewrite_b")
  const [scriptCopywritingBoard, setScriptCopywritingBoard] =
    useState<CopywritingBoardId>("generic_rewrite")
  const [scriptConversionTheme, setScriptConversionTheme] = useState(
    DEFAULT_PRODUCT_CONVERSION_THEME
  )
  const [showAdvancedRewrite, setShowAdvancedRewrite] = useState(false)
  const [scriptWorkflowSettings, setScriptWorkflowSettings] =
    useState<ScriptWorkflowSettings>(createDefaultScriptWorkflowSettings)
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false)
  const [selectedPackages, setSelectedPackages] = useState<VideoPackageId[]>([
    "stickman_meme",
  ])
  const [selectedDuration, setSelectedDuration] =
    useState<VideoDurationPreset>("45-60s")
  const [storyboardShots, setStoryboardShots] = useState<StoryboardShot[]>([])
  const [assetImportKind, setAssetImportKind] =
    useState<VideoAssetKind>("yanling_clip")
  const [assetImportName, setAssetImportName] = useState("")
  const [selectedMaterialLabels, setSelectedMaterialLabels] = useState<
    ExternalMaterialLabelId[]
  >([])
  const [videoAssets, setVideoAssets] = useState<VideoAsset[]>([])
  const [imageGenerationSettings, setImageGenerationSettings] =
    useState<VideoImageGenerationSettings>(() =>
      normalizeVideoImageGenerationSettings()
    )
  const [showAdvancedImageSettings, setShowAdvancedImageSettings] =
    useState(false)
  const [isGeneratingStickmanImages, setIsGeneratingStickmanImages] =
    useState(false)
  const [stickmanProgress, setStickmanProgress] = useState("")
  const stickmanGenerationQueueRef = useRef<StickmanGenerationQueueState>({
    pending: [],
    queuedShotIds: new Set(),
    activeShotIds: new Set(),
    completed: 0,
    failed: 0,
    total: 0,
    actionLabel: "生成火柴人图",
    stopRequested: false,
  })
  const stickmanQueuePumpScheduledRef = useRef(false)
  const stopStickmanGenerationRef = useRef(false)
  const [queuedStickmanShotIds, setQueuedStickmanShotIds] = useState<string[]>(
    []
  )
  const [activeStickmanShotIds, setActiveStickmanShotIds] = useState<string[]>(
    []
  )
  const [voicePlan, setVoicePlan] = useState<VoicePlan | null>(null)
  const [ttsSettings, setTtsSettings] = useState<VideoTtsSettings>(
    createDefaultVideoTtsSettings
  )
  const [taskVoicePresetId, setTaskVoicePresetId] =
    useState<VideoTtsVoicePresetId | "">("")
  const [ttsStatus, setTtsStatus] = useState("未检测本地 TTS")
  const [videoTimeline, setVideoTimeline] = useState<VideoTimeline | null>(null)
  const [requestedRenderEngine, setRequestedRenderEngine] =
    useState<RenderEngineId>("jianying")
  const [renderEngines] = useState<RenderEngineOption[]>(() =>
    createRenderEngineOptions({
      jianyingAvailable: false,
      ffmpegAvailable: true,
      remotionAvailable: false,
      davinciAvailable: false,
    })
  )
  const [draftPlan, setDraftPlan] = useState<JianyingDraftPlan | null>(null)
  const [aiDirectorPlan, setAiDirectorPlan] = useState<
    JianyingDraftPlan["aiDirector"] | null
  >(null)
  const [aiDirectorStatus, setAiDirectorStatus] =
    useState("AI 剪辑决策未生成")
  const [isGeneratingAiDirector, setIsGeneratingAiDirector] = useState(false)
  const [toast, setToast] = useState("")
  const autoPublishEnabled = hasLicenseFeature(license.result, "auto_publish")
  const activeTask = tasks.find((task) => task.id === activeTaskId) || tasks[0]

  useEffect(() => {
    let alive = true
    Promise.resolve().then(async () => {
      if (!alive) return
      try {
        setPublishDraft(readPublishDraft())
        const restoredTasks = readVideoTasks()
        setTasks(restoredTasks)
        setActiveTaskId(restoredTasks[0]?.id || "")
        setApiProfiles(readApiProfileStore())
        const restoredTtsSettings = readVideoTtsSettings()
        setTtsSettings(restoredTtsSettings)
        setTaskVoicePresetId(restoredTtsSettings.taskVoicePresetId || "")
        const restoredScriptSettings = readScriptWorkflowSettings()
        setScriptWorkflowSettings(restoredScriptSettings)
        setScriptRewriteMode(restoredScriptSettings.fullAutoRewriteMode)
        setScriptCopywritingBoard(restoredScriptSettings.copywritingBoard)
        setScriptConversionTheme(restoredScriptSettings.conversionTheme)
      } catch {
        setPublishDraft(null)
        setTasks([])
        setActiveTaskId("")
        setApiProfiles(createDefaultApiProfileStore())
        const defaults = createDefaultScriptWorkflowSettings()
        setScriptWorkflowSettings(defaults)
        setScriptRewriteMode(defaults.fullAutoRewriteMode)
        setScriptCopywritingBoard(defaults.copywritingBoard)
        setScriptConversionTheme(defaults.conversionTheme)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(""), 2300)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    let alive = true
    Promise.resolve().then(async () => {
      if (!alive) return
      if (!activeTask?.id) {
        setAnalysisDraft(null)
        setStoryboardShots([])
        setVideoAssets([])
        setTaskVoicePresetId("")
        setStickmanProgress("")
        setVoicePlan(null)
        setVideoTimeline(null)
        setDraftPlan(null)
        return
      }
      const snapshot = readVideoTaskSnapshot(activeTask.id)
      const recovery = snapshot
        ? await executeVideoTaskRecovery(createRecoveryPlanFromSnapshot(snapshot), {
            runStep: (step) => runRecoveryStepFromSnapshot(snapshot, step),
          })
        : null
      if (snapshot?.source.userTopic) {
        setAnalysisTopic(snapshot.source.userTopic)
      }
      setAnalysisDraft(
        snapshot?.voice.text
          ? createModelVideoAnalysisDraft({
              sourceText: snapshot.source.userTopic || activeTask.title,
              modelText: snapshot.voice.text,
            })
          : null
      )
      setStoryboardShots(snapshot?.storyboard || [])
      setVideoAssets(snapshot?.assets || [])
      setStickmanProgress("")
      setVoicePlan(snapshot?.voice.subtitles.length ? snapshot.voice : null)
      setVideoTimeline(
        snapshot?.timeline.tracks.length ? snapshot.timeline : null
      )
      const restoredDraftAsset = snapshot?.assets.find(
        (asset) =>
          asset.kind === "jianying_draft" &&
          asset.tags?.includes("editable_draft_plan")
      )
      setDraftPlan(
        restoredDraftAsset
          ? {
              taskId: activeTask.id,
              status: "created",
              defaultOutputKind: "jianying_draft",
              mp4ExportDefault: false,
              output: restoredDraftAsset,
              previewPath: restoredDraftAsset.file.path,
              command: "",
              message: "已恢复上次剪映草稿计划。",
              aiDirector: { trackOrder: [], clips: [] },
              materialAssets: [],
              brandOverlays: [],
              requiredConfirmations: [],
            }
          : null
      )
      if (snapshot && recovery) {
        const recoveryTaskStatus = recovery.taskStatus
        setTasks((currentTasks) => {
          const nextTasks = currentTasks.map((task) =>
            task.id === activeTask.id
              ? {
                  ...task,
                  status: recoveryTaskStatus,
                  recovery,
                  updatedAt: new Date().toISOString(),
                }
              : task
          )
          saveVideoTasks(nextTasks)
          return nextTasks
        })
        saveVideoTaskSnapshot({
          ...snapshot,
          status: recoveryTaskStatus,
          recovery,
          records: [
            ...snapshot.records.filter(
              (record) => record.kind !== "recovery_plan"
            ),
            {
              id: `recovery_${Date.now()}`,
              at: new Date().toISOString(),
              kind: "recovery_plan",
              message: `恢复策略：已续跑 ${recovery.completedStepIds.join(",") || "无"}；失败 ${recovery.failedStepIds.join(",") || "无"}；待处理 ${recovery.pendingStepIds.join(",") || "无"}；需人工 ${recovery.manualStepIds.join(",") || "无"}；保留素材 ${recovery.preservedAssetIds.length} 个。`,
            },
          ],
        })
      }
    })
    return () => {
      alive = false
    }
  }, [activeTask?.id, activeTask?.title])

  const persistTasks = (nextTasks: VideoTask[], nextActiveId?: string) => {
    setTasks(nextTasks)
    saveVideoTasks(nextTasks)
    if (nextActiveId !== undefined) {
      setActiveTaskId(nextActiveId)
    }
  }

  const persistApiProfiles = (store: ApiProfileStore) => {
    setApiProfiles(store)
    saveApiProfileStore(store)
  }

  const saveApiProfile = (profile: ApiProfile) => {
    persistApiProfiles(upsertApiProfile(apiProfiles, profile))
    setToast("API Profile 已保存")
  }

  const saveTtsSettings = (settings: VideoTtsSettings) => {
    const nextSettings = {
      ...settings,
      taskVoicePresetId: undefined,
    }
    setTtsSettings(nextSettings)
    saveVideoTtsSettings(nextSettings)
    setTtsStatus(
      nextSettings.engine === "cloud_tts"
        ? "云端 TTS 配置已保存"
        : nextSettings.engine === "manual_audio"
          ? "手动音频配置已保存"
          : "本地 TTS 配置已保存"
    )
    setToast("TTS 路径配置已保存")
  }

  const updateTaskVoicePreset = (value: VideoTtsVoicePresetId | "") => {
    setTaskVoicePresetId(value)
    setToast(value ? "已设置任务临时音色" : "已恢复全局默认音色")
  }

  const saveScriptWorkflowPreference = (
    mode: ScriptRewriteMode,
    board = scriptCopywritingBoard,
    conversionTheme = scriptConversionTheme
  ) => {
    const nextSettings: ScriptWorkflowSettings = {
      ...scriptWorkflowSettings,
      fullAutoRewriteMode: mode,
      copywritingBoard: board,
      conversionTheme,
    }
    setScriptWorkflowSettings(nextSettings)
    saveScriptWorkflowSettings(nextSettings)
    if (scriptWorkflowMode === "full_auto") {
      setScriptRewriteMode(mode)
    }
    setScriptCopywritingBoard(board)
    setScriptConversionTheme(conversionTheme)
    setToast("文案板子偏好已保存")
  }

  const checkTtsSettings = async (settings = ttsSettings) => {
    if (settings.engine === "manual_audio") {
      setTtsStatus(
        settings.manualAudioPath
          ? `已选择手动音频：${settings.manualAudioPath}`
          : "手动音频模式需要先选择音频文件"
      )
      return
    }

    if (settings.engine === "cloud_tts") {
      const profile = resolveApiProfile(apiProfiles, "cloud_tts")
      setTtsStatus(
        profile.apiKey.trim()
          ? `云端 TTS 已配置：${profile.label} · ${profile.model}`
          : "云端 TTS Profile 未配置 API Key"
      )
      return
    }

    const result = await window.promptCenterDesktop?.checkLocalTtsProject?.({
      projectPath: settings.projectPath,
    })
    if (!result) {
      setTtsStatus("当前不是桌面端，无法自动检测本地 TTS")
      return
    }
    if (result.ok) {
      setTtsStatus(`已找到本地 TTS：${result.projectPath}`)
      return
    }
    const missing = Array.isArray(result.missing)
      ? result.missing.join("、")
      : result.error || "路径不可用"
    setTtsStatus(`本地 TTS 未就绪：${missing}`)
  }

  const selectApiProfile = (service: ApiProfileService, profileId: string) => {
    persistApiProfiles(setActiveApiProfile(apiProfiles, service, profileId))
  }

  const createTask = () => {
    const task = createVideoTask({
      title: `她火视频任务 ${String(tasks.length + 1).padStart(2, "0")}`,
    })
    const profileRecords = API_PROFILE_SERVICES.map((service, index) => {
      const entry = createApiProfileLogEntry(apiProfiles, service)

      return {
        id: `api_profile_${service}`,
        at: new Date(Date.now() + index).toISOString(),
        kind: "api_profile_selected" as const,
        message: `${apiProfileServiceLabels[service]}：${entry.label}（${
          entry.configured ? "已配置" : "未配置"
        }）`,
      }
    })

    saveVideoTaskSnapshot(
      createVideoTaskSnapshot({
        id: task.id,
        title: task.title,
        status: task.status,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        workflow: task.workflow,
        source: {
          mode: "manual_text",
          userTopic: "等待输入关键词、抖音链接或本地视频",
        },
        records: profileRecords,
        assets: [],
        publish: {
          platform: "douyin",
          accountId: defaultPublishAccount.id,
          displayName: defaultPublishAccount.displayName,
          browserProfileId: defaultPublishAccount.browserProfileId,
          authorizedByUser: defaultPublishAccount.authorized,
          title: "等待生成发布标题",
          topics: [],
          intro: "",
        },
      })
    )
    persistTasks([task, ...tasks], task.id)
    setToast("已创建视频任务")
  }

  const updateActiveTaskSnapshot = (
    patch: (snapshot: VideoTaskSnapshot) => VideoTaskSnapshot
  ) => {
    if (!activeTask) {
      setToast("请先创建视频任务")
      return
    }
    const snapshot =
      readVideoTaskSnapshot(activeTask.id) ||
      createVideoTaskSnapshot({
        id: activeTask.id,
        title: activeTask.title,
        status: activeTask.status,
        createdAt: activeTask.createdAt,
        updatedAt: activeTask.updatedAt,
        workflow: activeTask.workflow,
      })
    saveVideoTaskSnapshot(patch(snapshot))
  }

  const saveCurrentProgress = () => {
    if (!activeTask) {
      setToast("请先创建视频任务")
      return
    }
    updateActiveTaskSnapshot((snapshot) => ({
      ...snapshot,
      source: {
        ...snapshot.source,
        userTopic: analysisTopic,
      },
      packagePlan: {
        packageIds: selectedPackages,
        durationPreset: selectedDuration,
      },
      storyboard: storyboardShots,
      assets: videoAssets,
      voice: {
        ...(voicePlan || snapshot.voice),
        text: analysisDraft?.originalScript || voicePlan?.text || snapshot.voice.text,
      },
      timeline: videoTimeline || snapshot.timeline,
      records: [
        ...snapshot.records,
        {
          id: `progress_${Date.now()}`,
          at: new Date().toISOString(),
          kind: "progress_saved",
          message: "已保存视频工厂当前进度",
        },
      ],
    }))
    setToast("进度已保存，返回后可继续")
  }

  const collectSources = async () => {
    setIsCollectingSources(true)
    try {
      const result = await collectViralSourceCandidates({
        keyword: sourceKeyword,
        mode: sourceMode,
        adapters: [
          {
            id: "authorized-douyin-browser",
            label: "授权抖音浏览器",
            collect: async () => ({
              ok: false,
              adapterId: "authorized-douyin-browser",
              reason: "login_required",
              message: "需要用户授权登录态或处理风控后才能自动采集。",
            }),
          },
        ],
      })
      setSourceCandidates(result.candidates)
      setSourceStatus(
        result.failures.length
          ? `${sourceModeLabels[result.mode]}：自动采集未完成，手动导入仍可继续。`
          : result.summary
      )
    } finally {
      setIsCollectingSources(false)
    }
  }

  const selectSourceCandidate = (candidate: ViralSourceCandidate) => {
    updateActiveTaskSnapshot((snapshot) => ({
      ...snapshot,
      source:
        candidate.sourceKind === "local_upload"
          ? {
              mode: "local_upload",
              userTopic: candidate.title,
              sourceVideo: createTaskFileRef({
                taskId: snapshot.id,
                kind: "source_video",
                filename: candidate.localFile?.filename || "source-video.mp4",
                bytes: candidate.localFile?.bytes,
                mimeType: candidate.localFile?.mimeType,
              }),
            }
          : {
              mode:
                candidate.sourceKind === "douyin_link"
                  ? "douyin_link"
                  : "keyword_search",
              keyword: sourceKeyword.trim() || undefined,
              douyinUrl: candidate.url,
              userTopic: candidate.title,
            },
      records: [
        ...snapshot.records,
        {
          id: `source_${Date.now()}`,
          at: new Date().toISOString(),
          kind: "source_selected",
          message: `${candidate.title} · ${candidate.author} · ${
            candidate.sourceKind === "local_upload"
              ? "本地上传"
              : sourceModeLabels[sourceMode]
          }`,
        },
      ],
    }))
    setAnalysisTopic(candidate.title)
    setToast("已写入爆款来源")
  }

  const importDouyinLink = () => {
    const candidate = createDouyinLinkSourceCandidate({
      url: manualDouyinUrl,
      title: "手动导入抖音链接",
    })
    setSourceCandidates((current) => [candidate, ...current])
    selectSourceCandidate(candidate)
    setManualDouyinUrl("")
  }

  const importLocalUpload = () => {
    const candidate = createLocalUploadSourceCandidate({
      filename: localUploadName || "source-video.mp4",
      bytes: 0,
      mimeType: "video/mp4",
    })
    setSourceCandidates((current) => [candidate, ...current])
    selectSourceCandidate(candidate)
    setLocalUploadName("")
  }

  const applyScriptDraft = (draft: VideoAnalysisDraft, message: string) => {
    setAnalysisDraft(draft)
    updateActiveTaskSnapshot((snapshot) => ({
      ...snapshot,
      source: {
        ...snapshot.source,
        mode: "manual_text",
        userTopic: analysisTopic,
      },
      voice: {
        ...snapshot.voice,
        text: draft.originalScript,
      },
      records: [
        ...snapshot.records,
        {
          id: `script_${Date.now()}`,
          at: new Date().toISOString(),
          kind: "script_analysis",
          message,
        },
      ],
    }))
  }

  const applyPastedScript = () => {
    const draft = createPastedScriptDraft({
      script: analysisTopic,
      rewriteMode: "original",
      sourceLabel: "用户粘贴脚本",
    })
    applyScriptDraft(draft, `原文直通：${draft.sentenceTimeline.length} 句`)
    setToast("已直通粘贴脚本，可继续分镜")
  }

  const generateAnalysisDraft = async () => {
    const effectiveRewriteMode =
      scriptWorkflowMode === "full_auto"
        ? scriptWorkflowSettings.fullAutoRewriteMode
        : scriptRewriteMode
    const effectiveCopywritingBoard =
      scriptWorkflowMode === "full_auto"
        ? scriptWorkflowSettings.copywritingBoard
        : scriptCopywritingBoard
    if (!shouldRequestTextModelForScriptMode(effectiveRewriteMode)) {
      applyPastedScript()
      return
    }
    const failoverPlan = createModuleFailoverPlan(apiProfiles, "text_model")
    const failoverLogEntry = createApiFailoverLogEntry(failoverPlan)
    let draft: VideoAnalysisDraft
    let failoverSummary = "文本路由：未执行"

    setIsGeneratingAnalysis(true)
    try {
      const failoverResult = await runApiProfileFailover(
        failoverPlan,
        async (attempt) => {
          const request = buildScriptGenerationRequest({
            profile: requestContextFromAttempt(attempt),
            sourceText: analysisTopic,
            durationPreset: "45-60s",
            packageId: "stickman_meme",
            rewriteMode: effectiveRewriteMode,
            copywritingBoard: effectiveCopywritingBoard,
            conversionTheme: scriptConversionTheme,
          })
          return requestScriptGenerationText(request)
        }
      )
      failoverSummary = formatApiFailoverSummary("文本路由", failoverResult)

      if (failoverResult.ok) {
        draft = createModelVideoAnalysisDraft({
          sourceText: analysisTopic,
          modelText: failoverResult.value,
        })
      } else {
        draft = createScriptGenerationFailureDraft({
          sourceText: analysisTopic,
          reason: failoverResult.state.pauseReason || failoverResult.error,
        })
      }
    } finally {
      setIsGeneratingAnalysis(false)
    }

    applyScriptDraft(
      draft,
      [
        `脚本分析：${draft.status}`,
        effectiveRewriteMode,
        failoverSummary,
        `备份 ${failoverLogEntry.attempts.length - 1}`,
      ]
        .filter(Boolean)
        .join(" · ")
    )
    setToast(
      draft.status === "ready_for_edit"
        ? "已调用文本模型生成原创脚本"
        : "文本模型不可用，已保留手动编辑稿"
    )
  }

  const togglePackage = (packageId: VideoPackageId) => {
    setSelectedPackages((current) =>
      current.includes(packageId)
        ? current.filter((item) => item !== packageId)
        : [...current, packageId]
    )
  }

  const generateStoryboard = () => {
    if (!analysisDraft) {
      setToast("请先生成脚本草稿")
      return
    }
    const nextShots = createStoryboardFromScript({
      script: analysisDraft.originalScript,
      packageIds: selectedPackages,
      durationPreset: selectedDuration,
      copywritingBoard: scriptCopywritingBoard,
      conversionTheme: scriptConversionTheme,
    })
    setStoryboardShots(nextShots)
    updateActiveTaskSnapshot((snapshot) => ({
      ...snapshot,
      storyboard: nextShots,
      records: [
        ...snapshot.records,
        {
          id: `storyboard_${Date.now()}`,
          at: new Date().toISOString(),
          kind: "storyboard_generated",
          message: `分镜已生成：${selectedPackages.join(" + ")} · ${selectedDuration}`,
        },
      ],
    }))
    setToast("已生成分镜")
  }

  const updateStoryboardShot = (
    shotId: string,
    patch: Partial<StoryboardShot>
  ) => {
    setStoryboardShots((current) =>
      current.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot))
    )
    updateActiveTaskSnapshot((snapshot) => ({
      ...snapshot,
      storyboard: snapshot.storyboard.map((shot) =>
        shot.id === shotId ? { ...shot, ...patch } : shot
      ),
    }))
  }

  const deleteStoryboardShot = (shotId: string) => {
    const localResult = deleteStoryboardShotAndReindex({
      shotId,
      shots: storyboardShots,
      assets: videoAssets,
    })
    if (!localResult.deletedShot) {
      setToast("没有找到要删除的分镜")
      return
    }

    setStoryboardShots(localResult.shots)
    setVideoAssets(localResult.assets)
    setVideoTimeline(null)
    setDraftPlan(null)
    setAiDirectorPlan(null)
    setAiDirectorStatus("分镜已调整，请重新生成 AI 剪辑决策")
    updateActiveTaskSnapshot((snapshot) => {
      const snapshotResult = deleteStoryboardShotAndReindex({
        shotId,
        shots: snapshot.storyboard,
        assets: snapshot.assets,
      })

      return {
        ...snapshot,
        storyboard: snapshotResult.shots,
        assets: snapshotResult.assets,
        timeline: { taskId: snapshot.id, durationMs: 0, tracks: [] },
        records: [
          ...snapshot.records,
          {
            id: `storyboard_delete_${Date.now()}`,
            at: new Date().toISOString(),
            kind: "storyboard_shot_deleted",
            message: `已删除 ${shotId}，分镜自动重排为 ${snapshotResult.shots.length} 条，清理图片 ${snapshotResult.removedAssetIds.length} 张。`,
          },
        ],
      }
    })
    setToast(`已删除 ${shotId}，分镜已自动重排`)
  }

  const addVideoAsset = (asset: VideoAsset, message: string) => {
    setVideoAssets((current) => [asset, ...current])
    updateActiveTaskSnapshot((snapshot) => ({
      ...snapshot,
      assets: [asset, ...snapshot.assets],
      records: [
        ...snapshot.records,
        {
          id: `asset_${Date.now()}`,
          at: new Date().toISOString(),
          kind: "asset_added",
          message,
        },
      ],
    }))
  }

  const stopStickmanGeneration = () => {
    stopStickmanGenerationRef.current = true
    stickmanGenerationQueueRef.current.stopRequested = true
    setStickmanProgress("正在停止，已发出的请求会先返回")
    setToast("已请求停止生成")
  }

  const syncStickmanQueueStatus = () => {
    const queue = stickmanGenerationQueueRef.current
    setQueuedStickmanShotIds(Array.from(queue.queuedShotIds))
    setActiveStickmanShotIds(Array.from(queue.activeShotIds))
  }

  const resetStickmanQueueIfIdle = (actionLabel: string) => {
    const queue = stickmanGenerationQueueRef.current
    if (queue.pending.length || queue.activeShotIds.size) return

    queue.completed = 0
    queue.failed = 0
    queue.total = 0
    queue.actionLabel = actionLabel
    queue.fatalError = undefined
    queue.stopRequested = false
  }

  const updateStickmanQueueProgress = (extra = "") => {
    const queue = stickmanGenerationQueueRef.current
    setStickmanProgress(
      `${queue.actionLabel} · 已完成 ${queue.completed}/${queue.total} · 运行 ${queue.activeShotIds.size} · 排队 ${queue.pending.length} · 失败 ${queue.failed}${extra}`
    )
  }

  const finishStickmanQueueIfIdle = () => {
    const queue = stickmanGenerationQueueRef.current
    if (queue.pending.length || queue.activeShotIds.size) return

    setIsGeneratingStickmanImages(false)
    stopStickmanGenerationRef.current = false
    syncStickmanQueueStatus()

    if (queue.fatalError) {
      setToast(queue.fatalError.message)
      setStickmanProgress(
        `已停止：余额不足 · 已完成 ${queue.completed}/${queue.total} · 失败 ${queue.failed}`
      )
      return
    }

    if (queue.stopRequested) {
      setToast(`已停止，已生成 ${queue.completed} 张`)
      setStickmanProgress(
        `已停止 · 已完成 ${queue.completed}/${queue.total} · 失败 ${queue.failed}`
      )
      return
    }

    if (!queue.total) {
      setStickmanProgress("")
      return
    }

    setToast(
      queue.failed
        ? `已生成 ${queue.completed} 张火柴人图，${queue.failed} 张失败`
        : `已生成 ${queue.completed} 张火柴人图`
    )
    setStickmanProgress(
      queue.failed
        ? `已完成 ${queue.completed}/${queue.total} · 失败 ${queue.failed}`
        : ""
    )
  }

  const hasGeneratedStickmanAsset = (shot: StoryboardShot) =>
    videoAssets.some(
      (asset) =>
        asset.kind === "stickman_image" &&
        asset.tags?.includes("generated_image") &&
        asset.tags?.includes(shot.id)
    )

  const stickmanShotCount = storyboardShots.filter(
    (item) => item.visualType === "stickman"
  ).length
  const generatedStickmanShotCount = storyboardShots.filter(
    (item) => item.visualType === "stickman" && hasGeneratedStickmanAsset(item)
  ).length

  const updateImageGenerationPreset = (presetId: VideoImageGenerationPresetId) => {
    setImageGenerationSettings((current) =>
      normalizeVideoImageGenerationSettings({
        ...current,
        presetId,
        styleStrength: current.styleStrength,
      })
    )
  }

  const updateAdvancedImageSetting = (
    patch: Partial<Pick<VideoImageGenerationSettings, "size" | "quality" | "styleStrength">>
  ) => {
    setImageGenerationSettings((current) =>
      normalizeVideoImageGenerationSettings({
        ...current,
        advanced: {
          size: patch.size ?? current.size,
          quality: patch.quality ?? current.quality,
          styleStrength: patch.styleStrength ?? current.styleStrength,
        },
      })
    )
  }

  const fillFailedStickmanShots = () => {
    const plan = createPerShotImageGenerationPlan({
      shots: storyboardShots.filter((shot) => shot.visualType === "stickman"),
      action: "fill_failed",
    })
    enqueueStickmanGeneration(plan.targets as StoryboardShot[], "补齐缺失")
  }

  const regenerateStickmanShot = (shotId: string) => {
    const plan = createPerShotImageGenerationPlan({
      shots: storyboardShots.filter((shot) => shot.visualType === "stickman"),
      action: "regenerate",
      shotId,
    })
    enqueueStickmanGeneration(plan.targets as StoryboardShot[], "重新生成")
  }

  const regenerateAllStickmanShots = () => {
    const plan = createPerShotImageGenerationPlan({
      shots: storyboardShots.filter((shot) => shot.visualType === "stickman"),
      action: "regenerate_all",
    })
    enqueueStickmanGeneration(plan.targets as StoryboardShot[], "全部重新生成", {
      clearExistingTargets: true,
    })
  }

  const toggleSelectedMaterialLabel = (labelId: ExternalMaterialLabelId) => {
    setSelectedMaterialLabels((current) =>
      normalizeExternalMaterialLabels(
        current.includes(labelId)
          ? current.filter((item) => item !== labelId)
          : [...current, labelId]
      )
    )
  }

  const updateAssetMaterialLabels = (
    assetId: string,
    labels: ExternalMaterialLabelId[]
  ) => {
    const nextLabels = normalizeExternalMaterialLabels(labels)
    const applyLabels = (asset: VideoAsset) =>
      asset.id === assetId
        ? {
            ...asset,
            tags: [
              ...(asset.tags || []).filter(
                (tag) => !getExternalMaterialLabels({ tags: [tag] }).length
              ),
              ...nextLabels,
            ],
          }
        : asset

    setVideoAssets((current) => current.map(applyLabels))
    updateActiveTaskSnapshot((snapshot) => ({
      ...snapshot,
      assets: snapshot.assets.map(applyLabels),
    }))
  }

  const enqueueStickmanGeneration = (
    targetShots?: StoryboardShot[],
    actionLabel = "生成火柴人图",
    options: StickmanGenerationQueueOptions = {}
  ) => {
    const stickmanShots =
      targetShots ||
      storyboardShots.filter(
        (item) =>
          item.visualType === "stickman" && !hasGeneratedStickmanAsset(item)
      )
    if (!activeTask || !stickmanShots.length) {
      setToast(
        storyboardShots.some((item) => item.visualType === "stickman")
          ? "火柴人图都已生成，可删除某张后再重新生成"
          : "请先生成火柴人分镜"
      )
      return
    }

    if (options.clearExistingTargets) {
      try {
        const targetShotIds = stickmanShots.map((shot) => shot.id)
        const localBatch = prepareStickmanRegenerationBatch({
          shots: storyboardShots,
          assets: videoAssets,
          targetShotIds,
        })
        setStoryboardShots((localBatch.shots as StoryboardShot[]))
        setVideoAssets(localBatch.assets)
        updateActiveTaskSnapshot((snapshot) => {
          const snapshotBatch = prepareStickmanRegenerationBatch({
            shots: snapshot.storyboard,
            assets: snapshot.assets,
            targetShotIds,
          })
          return {
            ...snapshot,
            storyboard: snapshotBatch.shots as StoryboardShot[],
            assets: snapshotBatch.assets,
            records: [
              ...snapshot.records,
              {
                id: `asset_reset_${Date.now()}`,
                at: new Date().toISOString(),
                kind: "asset_reset",
                message: `全部重新生成：已清理 ${snapshotBatch.removedAssetIds.length} 张旧火柴人图记录`,
              },
            ],
          }
        })
      } catch (error) {
        setToast(error instanceof Error ? error.message : "准备重新生成失败")
        return
      }
    }

    const queue = stickmanGenerationQueueRef.current
    resetStickmanQueueIfIdle(actionLabel)
    queue.actionLabel = actionLabel
    let added = 0

    for (const shot of stickmanShots) {
      if (queue.queuedShotIds.has(shot.id) || queue.activeShotIds.has(shot.id)) {
        continue
      }
      queue.pending.push(shot)
      queue.queuedShotIds.add(shot.id)
      queue.total += 1
      added += 1
    }

    if (!added) {
      setToast("这张图已经在生成队列中")
      return
    }

    stopStickmanGenerationRef.current = false
    setIsGeneratingStickmanImages(true)
    syncStickmanQueueStatus()
    updateStickmanQueueProgress()
    pumpStickmanGenerationQueue()
  }

  const runQueuedStickmanShot = async (shot: StoryboardShot) => {
    const queue = stickmanGenerationQueueRef.current
    const failoverPlan = createModuleFailoverPlan(apiProfiles, "image_generation")
    const failoverLogEntry = createApiFailoverLogEntry(failoverPlan)
    const updateProgress = (extra = "") => updateStickmanQueueProgress(extra)

    try {
      const taskId = activeTask?.id
      if (!taskId) {
        throw new Error("请先创建视频任务")
      }
      updateProgress(` · ${shot.id}`)
      setToast(`正在生成火柴人图：${shot.id}`)
      const failoverResult = await runApiProfileFailover(
        failoverPlan,
        async (attempt) =>
          generateStickmanStoryboardAsset({
            taskId,
            shot,
            profile: requestContextFromAttempt(attempt),
            settings: imageGenerationSettings,
            onAttempt: (attemptIndex, maxAttempts) =>
              setStickmanProgress(
                `${queue.actionLabel} · 已完成 ${queue.completed}/${queue.total} · 运行中 · ${shot.id} · ${attempt.profileId} · 第 ${attemptIndex}/${maxAttempts} 次`
              ),
            requestImages: requestImageGeneration,
          })
      )
      const failoverSummary = formatApiFailoverSummary(
        "图片路由",
        failoverResult
      )
      if (!failoverResult.ok) {
        throw new Error(failoverSummary)
      }
      const result = failoverResult.value
      const saved = await window.promptCenterDesktop?.saveTaskAssetFile?.({
        taskId,
        kind: result.asset.kind,
        filename: result.asset.file.filename,
        mimeType: result.image.mimeType || result.asset.file.mimeType,
        data: await imageSourceToBlob(result.image).then((blob) =>
          blob.arrayBuffer()
        ),
      })
      if (!saved?.ok) {
        throw new Error(saved?.error || "保存火柴人图失败")
      }
      const preview =
        saved.dataUrl ||
        (await window.promptCenterDesktop?.readTaskAssetPreview?.({
          filePath: saved.filePath || result.asset.file.path,
          mimeType: saved.mimeType || result.asset.file.mimeType,
        }))?.dataUrl ||
        result.image.dataUrl ||
        result.image.url ||
        ""
      const asset = saved.filePath
        ? {
            ...result.asset,
            file: {
              ...result.asset.file,
              path: saved.filePath,
              bytes: saved.bytes || result.asset.file.bytes,
              mimeType: saved.mimeType || result.asset.file.mimeType,
            },
            previewUrl: preview,
          }
        : {
            ...result.asset,
            previewUrl: preview,
          }
      const record: VideoTaskSnapshot["records"][number] = {
        id: `asset_${shot.id}_${Date.now()}`,
        at: new Date().toISOString(),
        kind: "asset_added",
        message: `火柴人图已生成：${shot.id} · ${failoverSummary} · 备份 ${failoverLogEntry.attempts.length - 1} · ${result.attempts} 次请求`,
      }
      const isSameShotGeneratedImage = (item: VideoAsset) =>
        item.kind === "stickman_image" &&
        item.tags?.includes("generated_image") &&
        item.tags?.includes(shot.id)

      queue.completed += 1
      setVideoAssets((current) => [
        asset,
        ...current.filter((item) => !isSameShotGeneratedImage(item)),
      ])
      setStoryboardShots((current) =>
        current.map((item) =>
          item.id === shot.id
            ? {
                ...item,
                status: "ready" as const,
                assetIds: [asset.id],
              }
            : item
        )
      )
      updateActiveTaskSnapshot((snapshot) => ({
        ...snapshot,
        storyboard: snapshot.storyboard.map((item) =>
          item.id === shot.id
            ? {
                ...item,
                status: "ready" as const,
                assetIds: [asset.id],
              }
            : item
        ),
        assets: [
          asset,
          ...snapshot.assets.filter((item) => !isSameShotGeneratedImage(item)),
        ],
        records: [...snapshot.records, record],
      }))
      updateProgress()
    } catch (error) {
      queue.failed += 1
      const message = error instanceof Error ? error.message : "生成火柴人图失败"
      if (/余额不足|insufficient|quota|credits?|balance/i.test(message)) {
        queue.fatalError = new Error(message)
        queue.pending = []
        queue.queuedShotIds.clear()
      }
      updateProgress(` · ${shot.id} 失败`)
    } finally {
      queue.activeShotIds.delete(shot.id)
      syncStickmanQueueStatus()
      pumpStickmanGenerationQueue()
    }
  }

  const pumpStickmanGenerationQueue = () => {
    const queue = stickmanGenerationQueueRef.current
    if (stickmanQueuePumpScheduledRef.current) return
    stickmanQueuePumpScheduledRef.current = true

    window.setTimeout(() => {
      stickmanQueuePumpScheduledRef.current = false
      if (queue.fatalError || stopStickmanGenerationRef.current) {
        queue.pending = []
        queue.queuedShotIds.clear()
        finishStickmanQueueIfIdle()
        return
      }

      while (
        queue.pending.length &&
        queue.activeShotIds.size < STICKMAN_IMAGE_CONCURRENCY
      ) {
        const shot = queue.pending.shift()
        if (!shot) break
        queue.queuedShotIds.delete(shot.id)
        queue.activeShotIds.add(shot.id)
        void runQueuedStickmanShot(shot)
      }

      syncStickmanQueueStatus()
      updateStickmanQueueProgress()
      finishStickmanQueueIfIdle()
    }, 0)
  }

  const importVideoAsset = () => {
    if (!activeTask) {
      setToast("请先创建视频任务")
      return
    }
    const asset = createImportedVideoAsset({
      taskId: activeTask.id,
      kind: assetImportKind,
      filename: assetImportName || `${assetImportKind}.bin`,
      mimeType:
        assetImportKind === "bgm" || assetImportKind === "sfx"
          ? "audio/mpeg"
          : assetImportKind === "brand_sticker" ||
              assetImportKind.includes("image")
            ? "image/png"
            : "video/mp4",
      tags: selectedMaterialLabels,
    })
    addVideoAsset(asset, `已导入任务素材：${asset.displayName}`)
    setAssetImportName("")
  }

  const removeVideoAsset = (assetId: string) => {
    const localRemoval = removeVideoAssetFromInventory({
      shots: storyboardShots,
      assets: videoAssets,
      assetId,
    })
    setVideoAssets(localRemoval.assets)
    setStoryboardShots(localRemoval.shots as StoryboardShot[])
    updateActiveTaskSnapshot((snapshot) => ({
      ...snapshot,
      ...(() => {
        const snapshotRemoval = removeVideoAssetFromInventory({
          shots: snapshot.storyboard,
          assets: snapshot.assets,
          assetId,
        })
        return {
          storyboard: snapshotRemoval.shots as StoryboardShot[],
          assets: snapshotRemoval.assets,
        }
      })(),
    }))
    setToast("已移除任务素材记录")
  }

  const withoutPreviousDraftPlan = (assets: VideoAsset[]) =>
    assets.filter((asset) => !asset.tags?.includes("editable_draft_plan"))

  const createDesktopJianyingDraft = async (plan: JianyingDraftPlan) => {
    const desktopDraft = window.promptCenterDesktop?.createJianyingDraft
    const draftResult =
      plan.status === "ready" && desktopDraft
        ? await desktopDraft({ plan })
        : null
    const draftOutput =
      draftResult?.ok && draftResult.draftPath
        ? {
            ...plan.output,
            file: {
              ...plan.output.file,
              path: draftResult.nativeDraftPath || draftResult.draftPath,
              bytes: draftResult.bytes || 0,
            },
          }
        : plan.output
    const createdMessage = draftResult?.nativeDraftCreated
      ? `剪映原生草稿已导入：${draftResult.nativeDraftPath}`
      : draftResult?.ok && draftResult.nativeDraftError
        ? `剪映草稿包已创建：${draftResult.draftPath}；原生导入未完成：${draftResult.nativeDraftError}`
        : draftResult?.ok
          ? `剪映草稿包已创建：${draftOutput.file.path}`
          : ""

    return {
      draftResult,
      desktopDraft,
      nextPlan: {
        ...plan,
        output: draftOutput,
        previewPath: draftOutput.file.path,
        status: draftResult?.ok ? "created" : plan.status,
        message: draftResult?.ok
          ? createdMessage
          : draftResult?.error
            ? `剪映草稿创建失败：${draftResult.error}`
            : desktopDraft
              ? plan.message
              : `${plan.message} 当前浏览器环境仅生成草稿计划，桌面端会创建草稿包。`,
      } satisfies JianyingDraftPlan,
    }
  }

  const exportImageAssetsToJianyingDraft = async () => {
    if (!activeTask) {
      setToast("请先创建视频任务")
      return
    }
    if (generatedStickmanShotCount === 0) {
      setToast("请先生成图片素材")
      return
    }

    const timeline = createImageAssetsDraftTimeline({
      taskId: activeTask.id,
      shots: storyboardShots,
      assets: videoAssets,
    })
    if (!timeline.tracks.length) {
      setToast("没有可导出的图片素材")
      return
    }

    const imageAssetIds = new Set(
      timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.assetId))
    )
    const materialAssets = videoAssets.filter((asset) =>
      imageAssetIds.has(asset.id)
    )
    const plan = createJianyingDraftPlan({
      taskId: activeTask.id,
      timeline,
      materialAssets,
    })
    const { draftResult, nextPlan } = await createDesktopJianyingDraft(plan)
    const output = {
      ...nextPlan.output,
      tags: [
        ...new Set([
          ...(nextPlan.output.tags || []),
          "asset_images_jianying_draft",
        ]),
      ],
    }
    const imageDraftPlan: JianyingDraftPlan = {
      ...nextPlan,
      output,
      previewPath: output.file.path,
      message:
        nextPlan.status === "created"
          ? `图片素材已导出到剪映草稿：${output.file.path}`
          : nextPlan.message,
    }
    const isUsablePlan =
      imageDraftPlan.status === "ready" || imageDraftPlan.status === "created"

    setVideoTimeline(timeline)
    setDraftPlan(imageDraftPlan)
    if (isUsablePlan) {
      setVideoAssets((current) => [
        imageDraftPlan.output,
        ...withoutPreviousDraftPlan(current),
      ])
    }

    updateActiveTaskSnapshot((snapshot) => ({
      ...snapshot,
      timeline,
      assets: isUsablePlan
        ? [imageDraftPlan.output, ...withoutPreviousDraftPlan(snapshot.assets)]
        : snapshot.assets,
      records: [
        ...snapshot.records,
        {
          id: `asset_images_jianying_draft_${Date.now()}`,
          at: new Date().toISOString(),
          kind: "asset_images_jianying_draft",
          message: `${imageDraftPlan.message} 图片 ${materialAssets.length} 张 · 输出引用：${imageDraftPlan.previewPath}`,
        },
      ],
    }))
    setToast(
      draftResult?.ok
        ? "图片素材已导出到剪映草稿"
        : isUsablePlan
          ? "已生成图片素材剪映草稿计划"
          : "当前无法创建图片素材草稿"
    )
  }

  const assembleTimeline = () => {
    if (!activeTask || !analysisDraft) {
      setToast("请先创建任务并生成脚本")
      return
    }
    if (!storyboardShots.length) {
      setToast("请先生成分镜")
      return
    }

    const manualAudioFilename =
      ttsSettings.manualAudioPath.split(/[\\/]/u).pop() || "manual-audio.wav"
    const voiceAudioFilename =
      ttsSettings.engine === "manual_audio"
        ? manualAudioFilename
        : ttsSettings.engine === "cloud_tts"
          ? "cloud-tts.wav"
          : `${resolveVideoTtsVoiceSelection({
              settings: ttsSettings,
              taskVoicePresetId,
            }).id}.wav`
    const voice = createVoicePlanFromScript({
      taskId: activeTask.id,
      script: analysisDraft.originalScript,
      durationPreset: selectedDuration,
      audioFilename: voiceAudioFilename,
    })
    const visualAssets = videoAssets.filter((asset) =>
      ["stickman_image", "yanling_clip", "showcase_clip"].includes(asset.kind)
    )
    const placeholderAssets = storyboardShots
      .map((shot) => {
        const requiredMaterialLabel = inferRequiredMaterialLabel(shot)
        if (
          !requiredMaterialLabel ||
          shot.assetIds.length ||
          visualAssets.some((asset) =>
            getExternalMaterialLabels(asset).includes(requiredMaterialLabel)
          )
        ) {
          return null
        }

        return createExternalMaterialPlaceholderAsset({
          taskId: activeTask.id,
          labelId: requiredMaterialLabel,
          shotId: shot.id,
        })
      })
      .filter((asset): asset is VideoAsset => Boolean(asset))
    const timelineExternalAssets = [...visualAssets, ...placeholderAssets]
    const storyboard = storyboardShots.map((shot, index) => {
      const requiredMaterialLabel = inferRequiredMaterialLabel(shot)
      return {
        id: shot.id,
        startMs: shot.startMs,
        endMs: shot.endMs,
        requiredMaterialLabel,
        assetIds:
          shot.assetIds.length > 0 || requiredMaterialLabel
            ? shot.assetIds
            : [
                visualAssets[index % Math.max(visualAssets.length, 1)]?.id ||
                  shot.id,
              ],
      }
    })
    const timeline = createUnifiedVideoTimeline({
      taskId: activeTask.id,
      voice,
      storyboard,
      externalAssets: timelineExternalAssets,
      bgmAssetId: videoAssets.find((asset) => asset.kind === "bgm")?.id,
      sfxAssetIds: videoAssets
        .filter((asset) => asset.kind === "sfx")
        .map((asset) => asset.id),
      previousTimeline: videoTimeline || undefined,
    })
    const nextAssets = [
      ...placeholderAssets.filter(
        (placeholder) =>
          !videoAssets.some((asset) => asset.id === placeholder.id)
      ),
      ...videoAssets,
    ]

    setVoicePlan(voice)
    setVideoTimeline(timeline)
    if (placeholderAssets.length) {
      setVideoAssets(nextAssets)
    }
    updateActiveTaskSnapshot((snapshot) => ({
      ...snapshot,
      assets: [
        ...placeholderAssets.filter(
          (placeholder) =>
            !snapshot.assets.some((asset) => asset.id === placeholder.id)
        ),
        ...snapshot.assets,
      ],
      voice,
      timeline,
      records: [
        ...snapshot.records,
        {
          id: `timeline_${Date.now()}`,
          at: new Date().toISOString(),
          kind: "timeline_assembled",
          message: `时间线已装配：${timeline.durationMs}ms · ${timeline.tracks.length} tracks · ${ttsSettings.engine === "cloud_tts" ? "云端 TTS 配置预留" : ttsSettings.engine === "manual_audio" ? "手动音频引用" : "本地 TTS 音色引用"} · TTS timestamps 缺失时使用句子级 fallback timing`,
        },
      ],
    }))
    setToast("已生成配音、字幕和统一时间线")
  }

  const prepareRenderExport = async () => {
    if (!activeTask || !videoTimeline) {
      setToast("请先生成统一时间线")
      return
    }

    const plan = createJianyingDraftPlan({
      taskId: activeTask.id,
      timeline: videoTimeline,
      aiDirectorPlan: aiDirectorPlan || undefined,
      materialAssets: videoAssets,
      copywritingBoard: scriptCopywritingBoard,
    })
    const withoutPreviousDraftPlan = (assets: VideoAsset[]) =>
      assets.filter((asset) => !asset.tags?.includes("editable_draft_plan"))
    const { draftResult, nextPlan } = await createDesktopJianyingDraft(plan)
    const isUsablePlan =
      nextPlan.status === "ready" ||
      nextPlan.status === "created"
    setDraftPlan(nextPlan)

    if (isUsablePlan) {
      setVideoAssets((current) => [
        nextPlan.output,
        ...withoutPreviousDraftPlan(current),
      ])
    }

    updateActiveTaskSnapshot((snapshot) => ({
      ...snapshot,
      assets: isUsablePlan
        ? [nextPlan.output, ...withoutPreviousDraftPlan(snapshot.assets)]
        : snapshot.assets,
      records: [
        ...snapshot.records,
        {
          id: `jianying_draft_${Date.now()}`,
          at: new Date().toISOString(),
          kind: "jianying_draft_plan",
          message: `${nextPlan.message} 输出引用：${nextPlan.previewPath}`,
        },
      ],
    }))
    setToast(
      draftResult?.ok
        ? "已创建剪映草稿包"
        : isUsablePlan
          ? "已生成剪映草稿计划"
          : "当前无法创建剪映草稿"
    )
  }

  const generateAiDirectorPlan = async () => {
    if (!activeTask || !videoTimeline?.tracks.length) {
      setToast("请先生成统一时间线")
      return
    }

    const fallbackDraftPlan = createJianyingDraftPlan({
      taskId: activeTask.id,
      timeline: videoTimeline,
      materialAssets: videoAssets,
      copywritingBoard: scriptCopywritingBoard,
    })
    const failoverPlan = createModuleFailoverPlan(apiProfiles, "edit_director")
    const failoverLogEntry = createApiFailoverLogEntry(failoverPlan)
    const script =
      analysisDraft?.originalScript || voicePlan?.text || activeTask.title

    setIsGeneratingAiDirector(true)
    setAiDirectorStatus("正在生成 AI 剪辑决策")
    try {
      const failoverResult = await runApiProfileFailover(
        failoverPlan,
        async (attempt) => {
          const request = buildAiDirectorGenerationRequest({
            profile: requestContextFromAttempt(attempt),
            script,
            timeline: videoTimeline,
            fallbackPlan: fallbackDraftPlan.aiDirector,
            brandOverlays: fallbackDraftPlan.brandOverlays,
          })
          const modelText = await requestAiDirectorGeneration(request)
          return {
            aiDirector: createModelAiDirectorPlan({
              fallbackPlan: fallbackDraftPlan.aiDirector,
              modelText,
            }),
            logEntry: request.logEntry,
          }
        }
      )
      const failoverSummary = formatApiFailoverSummary(
        "剪辑决策路由",
        failoverResult
      )

      if (!failoverResult.ok) {
        setAiDirectorStatus(failoverResult.error)
        updateActiveTaskSnapshot((snapshot) => ({
          ...snapshot,
          records: [
            ...snapshot.records,
            {
              id: `ai_director_failed_${Date.now()}`,
              at: new Date().toISOString(),
              kind: "ai_director_failed",
              message: failoverSummary,
            },
          ],
        }))
        setToast(failoverResult.error)
        return
      }

      setAiDirectorPlan(failoverResult.value.aiDirector)
      setAiDirectorStatus(failoverSummary)
      setDraftPlan((current) =>
        current
          ? {
              ...current,
              aiDirector: failoverResult.value.aiDirector,
              message: "AI 精剪方案已写入剪映草稿计划。",
            }
          : current
      )
      updateActiveTaskSnapshot((snapshot) => ({
        ...snapshot,
        records: [
          ...snapshot.records,
          {
            id: `ai_director_${Date.now()}`,
            at: new Date().toISOString(),
            kind: "ai_director_plan",
            message: `${failoverSummary} · clips ${failoverResult.value.aiDirector.clips.length} · ${JSON.stringify(failoverLogEntry)}`,
          },
        ],
      }))
      setToast("AI 精剪方案已生成")
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 精剪生成失败"
      setAiDirectorStatus(message)
      setToast(message)
    } finally {
      setIsGeneratingAiDirector(false)
    }
  }

  const persistDraft = (draft: PublishDraft) => {
    const safeDraft = sanitizePublishDraftForExport(draft)
    setPublishDraft(safeDraft)
    savePublishDraft(safeDraft)
  }

  const generateDraft = () => {
    persistDraft(
      createPublishDraft({
        taskId: "stage1-demo-task",
        renderedVideoPath: "%APPDATA%/她火/tasks/stage1-demo/output/demo.mp4",
        titleSeed: "她火一键做短视频：小白也能拆爆款",
        scriptSummary:
          "用她火助手把爆款结构拆成原创脚本，生成火柴人分镜、素材、配音和发布草稿。",
        coverImagePath: "%APPDATA%/她火/tasks/stage1-demo/output/cover.png",
        account: defaultPublishAccount,
      })
    )
    setToast("已生成发布草稿")
  }

  const updateDraft = (patch: Partial<PublishDraft>) => {
    if (!publishDraft) return
    persistDraft({ ...publishDraft, ...patch })
  }

  const updateAccount = (patch: Partial<PublishAccount>) => {
    if (!publishDraft) return
    updateDraft({
      account: {
        ...publishDraft.account,
        ...patch,
      },
    })
  }

  const confirmPublish = () => {
    if (!publishDraft) return
    if (!autoPublishEnabled) {
      persistDraft(
        recordPublishAutomationResult(
          {
            ...publishDraft,
            status: "blocked",
            manualActionRequired: true,
          },
          {
            kind: "risk_prompt",
            message: "自动发布功能未授权，请先激活自动发布套餐。",
          }
        )
      )
      return
    }

    persistDraft(startAuthorizedPublish(publishDraft, { confirmed: true }))
    setToast("已确认，等待授权浏览器执行")
  }

  const simulateRiskPause = () => {
    if (!publishDraft) return
    persistDraft(
      recordPublishAutomationResult(publishDraft, {
        kind: "captcha",
        message: "检测到验证码或风控提示，已暂停等待用户处理。",
      })
    )
  }

  return (
    <main className="min-h-svh bg-muted/40 text-foreground">
      <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg border bg-background">
            <FileVideo className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">视频工厂</div>
            <div className="truncate text-xs text-muted-foreground">
              她火助手短视频任务台
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="outline" onClick={() => history.back()}>
            返回
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 p-6 max-lg:p-4">
        <section className="grid grid-cols-[minmax(0,1fr)_340px] gap-5 max-xl:grid-cols-1">
          <div className="grid gap-5">
            <VideoFactoryModuleNav
              activeModule={activeModule}
              onChange={setActiveModule}
            />

            {activeModule === "overview" ? (
              <>
                <div className="rounded-lg border bg-background p-5">
                  <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h1 className="text-2xl font-semibold tracking-normal">
                        视频工厂任务
                      </h1>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        单条任务从来源、脚本、分镜、素材到剪映草稿分模块推进。
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={saveCurrentProgress}>
                        <Save className="size-4" />
                        保存进度
                      </Button>
                      <Button onClick={createTask}>
                        <Sparkles className="size-4" />
                        新建任务
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <TaskList
                      tasks={tasks}
                      activeTaskId={activeTask?.id || ""}
                      onSelectTask={setActiveTaskId}
                      onCreateTask={createTask}
                    />
                    {activeTask ? (
                      <WorkflowShell task={activeTask} />
                    ) : (
                      <EmptyTaskShell onCreateTask={createTask} />
                    )}
                  </div>
                </div>

                <SourceCollectionPanel
                  keyword={sourceKeyword}
                  mode={sourceMode}
                  candidates={sourceCandidates}
                  status={sourceStatus}
                  isCollecting={isCollectingSources}
                  douyinUrl={manualDouyinUrl}
                  localUploadName={localUploadName}
                  onKeywordChange={setSourceKeyword}
                  onModeChange={setSourceMode}
                  onCollect={collectSources}
                  onSelectCandidate={selectSourceCandidate}
                  onDouyinUrlChange={setManualDouyinUrl}
                  onImportDouyinLink={importDouyinLink}
                  onLocalUploadNameChange={setLocalUploadName}
                  onImportLocalUpload={importLocalUpload}
                />
              </>
            ) : null}

            {activeModule === "script" ? (
              <ScriptAnalysisPanel
                topic={analysisTopic}
                draft={analysisDraft}
                generating={isGeneratingAnalysis}
                workflowMode={scriptWorkflowMode}
                rewriteMode={scriptRewriteMode}
                fullAutoRewriteMode={
                  scriptWorkflowSettings.fullAutoRewriteMode
                }
                copywritingBoard={scriptCopywritingBoard}
                conversionTheme={scriptConversionTheme}
                showAdvancedRewrite={showAdvancedRewrite}
                onTopicChange={setAnalysisTopic}
                onWorkflowModeChange={setScriptWorkflowMode}
                onRewriteModeChange={setScriptRewriteMode}
                onCopywritingBoardChange={setScriptCopywritingBoard}
                onConversionThemeChange={setScriptConversionTheme}
                onSaveWorkflowSettings={saveScriptWorkflowPreference}
                onShowAdvancedRewriteChange={setShowAdvancedRewrite}
                onUsePastedScript={applyPastedScript}
                onGenerateDraft={generateAnalysisDraft}
                onScriptChange={(value) => {
                  setAnalysisDraft((current) =>
                    current ? { ...current, originalScript: value } : current
                  )
                  updateActiveTaskSnapshot((snapshot) => ({
                    ...snapshot,
                    source: {
                      ...snapshot.source,
                      userTopic: analysisTopic,
                    },
                    voice: {
                      ...snapshot.voice,
                      text: value,
                    },
                  }))
                }}
              />
            ) : null}

            {activeModule === "storyboard" ? (
              <StoryboardPanel
                selectedPackages={selectedPackages}
                selectedDuration={selectedDuration}
                shots={storyboardShots}
                onTogglePackage={togglePackage}
                onDurationChange={setSelectedDuration}
                onGenerateStoryboard={generateStoryboard}
                onUpdateShot={updateStoryboardShot}
                onDeleteShot={deleteStoryboardShot}
              />
            ) : null}

            {activeModule === "assets" ? (
              <VideoAssetLibraryPanel
                assets={videoAssets}
                stickmanShots={storyboardShots.filter(
                  (shot) => shot.visualType === "stickman"
                )}
                imageSettings={imageGenerationSettings}
                showAdvancedImageSettings={showAdvancedImageSettings}
                generatingStickman={isGeneratingStickmanImages}
                queuedStickmanShotIds={queuedStickmanShotIds}
                activeStickmanShotIds={activeStickmanShotIds}
                stickmanProgress={stickmanProgress}
                stickmanShotCount={stickmanShotCount}
                generatedStickmanShotCount={generatedStickmanShotCount}
                importKind={assetImportKind}
                importName={assetImportName}
                selectedMaterialLabels={selectedMaterialLabels}
                onImagePresetChange={updateImageGenerationPreset}
                onAdvancedImageSettingChange={updateAdvancedImageSetting}
                onShowAdvancedImageSettingsChange={
                  setShowAdvancedImageSettings
                }
                onGenerateStickman={fillFailedStickmanShots}
                onRegenerateShot={regenerateStickmanShot}
                onRegenerateAllStickman={regenerateAllStickmanShots}
                onExportImagesToDraft={exportImageAssetsToJianyingDraft}
                onStopStickman={stopStickmanGeneration}
                onImportKindChange={setAssetImportKind}
                onImportNameChange={setAssetImportName}
                onSelectedMaterialLabelToggle={toggleSelectedMaterialLabel}
                onAssetLabelsChange={updateAssetMaterialLabels}
                onImportAsset={importVideoAsset}
                onRemoveAsset={removeVideoAsset}
              />
            ) : null}

            {activeModule === "voice" ? (
              <TimelineAssemblyPanel
                voice={voicePlan}
                timeline={videoTimeline}
                storyboardCount={storyboardShots.length}
                assetCount={videoAssets.length}
                ttsSettings={ttsSettings}
                taskVoicePresetId={taskVoicePresetId}
                ttsStatus={ttsStatus}
                onAssembleTimeline={assembleTimeline}
                onSaveTtsSettings={saveTtsSettings}
                onTaskVoicePresetChange={updateTaskVoicePreset}
                onCheckTtsSettings={checkTtsSettings}
              />
            ) : null}

            {activeModule === "draft" ? (
              <>
                <RenderExportPanel
                  engines={renderEngines}
                  requestedEngine={requestedRenderEngine}
                  plan={draftPlan}
                  hasTimeline={Boolean(videoTimeline?.tracks.length)}
                  aiDirectorStatus={aiDirectorStatus}
                  generatingAiDirector={isGeneratingAiDirector}
                  onEngineChange={setRequestedRenderEngine}
                  onGenerateAiDirectorPlan={generateAiDirectorPlan}
                  onPrepareExport={prepareRenderExport}
                />

                <PublishPanel
                  draft={publishDraft}
                  autoPublishEnabled={autoPublishEnabled}
                  onGenerateDraft={generateDraft}
                  onUpdateDraft={updateDraft}
                  onUpdateAccount={updateAccount}
                  onConfirmPublish={confirmPublish}
                  onRiskPause={simulateRiskPause}
                />
              </>
            ) : null}

            {activeModule === "settings" ? (
              <ApiProfilesPanel
                store={apiProfiles}
                onSaveProfile={saveApiProfile}
                onSelectProfile={selectApiProfile}
              />
            ) : null}
          </div>

          <aside className="grid content-start gap-4">
            <div className="rounded-lg border bg-background p-4">
              <div className="mb-3 flex items-center gap-2">
                <Clock3 className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">授权功能</h2>
              </div>
              <FeatureFlagList result={license.result} />
            </div>
            <div className="rounded-lg border bg-background p-4 text-sm leading-6 text-muted-foreground">
              发布、批量矩阵和 DaVinci
              引擎仍受独立功能开关控制。未授权时，相关任务动作保持不可运行状态。
            </div>
          </aside>
        </section>
      </div>
      {toast ? (
        <div className="fixed right-5 bottom-5 z-[60] rounded-lg border bg-foreground px-3 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      ) : null}
    </main>
  )
}

function VideoFactoryModuleNav({
  activeModule,
  onChange,
}: {
  activeModule: VideoFactoryModuleId
  onChange: (moduleId: VideoFactoryModuleId) => void
}) {
  return (
    <nav
      aria-label="视频工厂模块"
      className="rounded-lg border bg-background p-2"
    >
      <div className="grid grid-cols-7 gap-1 max-xl:grid-cols-4 max-sm:grid-cols-2">
        {videoFactoryModules.map((module) => {
          const active = activeModule === module.id
          return (
            <button
              key={module.id}
              type="button"
              aria-current={active ? "page" : undefined}
              className={`min-h-10 rounded-md px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              onClick={() => onChange(module.id)}
            >
              {module.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function TaskList({
  tasks,
  activeTaskId,
  onSelectTask,
  onCreateTask,
}: {
  tasks: VideoTask[]
  activeTaskId: string
  onSelectTask: (taskId: string) => void
  onCreateTask: () => void
}) {
  if (!tasks.length) {
    return (
      <section className="rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">任务列表</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              还没有视频任务。新建后会显示完整的单条成片流程。
            </p>
          </div>
          <Button variant="outline" onClick={onCreateTask}>
            <FileVideo className="size-4" />
            新建任务
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">任务列表</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            每条任务独立保存状态和产物路径。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onCreateTask}>
          <Sparkles className="size-3.5" />
          新建
        </Button>
      </div>
      <div className="grid gap-2">
        {tasks.map((task) => {
          const active = task.id === activeTaskId
          return (
            <button
              key={task.id}
              type="button"
              className={`rounded-lg border px-3 py-2 text-left transition ${
                active
                  ? "border-primary bg-background shadow-sm"
                  : "bg-background/60 hover:bg-background"
              }`}
              onClick={() => onSelectTask(task.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {task.title}
                </span>
                <span className="rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {task.status}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {task.workflow.length} 步流程 · {task.createdAt.slice(0, 10)}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function EmptyTaskShell({ onCreateTask }: { onCreateTask: () => void }) {
  return (
    <section className="grid min-h-72 place-items-center rounded-lg border border-dashed bg-muted/30 p-6 text-center">
      <div>
        <FileVideo className="mx-auto mb-3 size-9 text-muted-foreground" />
        <h2 className="text-base font-semibold">准备创建单条视频任务</h2>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          视频工厂是独立页面，不复用图片工作台状态。创建任务后会展开爆款来源到任务记录的完整流程。
        </p>
        <Button className="mt-4" onClick={onCreateTask}>
          <Sparkles className="size-4" />
          新建任务
        </Button>
      </div>
    </section>
  )
}

function WorkflowShell({ task }: { task: VideoTask }) {
  const recovery = task.recovery

  return (
    <section className="rounded-lg border bg-background p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{task.title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            任务工作流会把可编辑脚本、分镜、提示词、素材、配音、导出和发布确认分开记录。
          </p>
        </div>
        <span className="rounded-lg border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          状态：{task.status}
        </span>
      </div>

      {recovery ? (
        <div className="mb-4 grid gap-3 rounded-lg border bg-muted/25 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">恢复摘要</div>
            <span className="rounded-md border bg-background px-2 py-0.5 text-xs text-muted-foreground">
              {recovery.requiresUserConfirmation ? "等待确认" : "安全续跑"}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2 text-xs text-muted-foreground max-lg:grid-cols-3 max-sm:grid-cols-2">
            <span>已续跑 {recovery.completedStepIds.length}</span>
            <span>失败 {recovery.failedStepIds.length}</span>
            <span>待处理 {recovery.pendingStepIds.length}</span>
            <span>需人工 {recovery.manualStepIds.length}</span>
            <span>保留素材 {recovery.preservedAssetIds.length}</span>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {task.workflow.map((step, index) => (
          <article
            key={step.id}
            className="min-h-36 rounded-lg border bg-muted/30 p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="grid size-8 place-items-center rounded-lg border bg-background">
                {index % 3 === 0 ? (
                  <RadioTower className="size-4" />
                ) : index % 3 === 1 ? (
                  <ListChecks className="size-4" />
                ) : (
                  <Layers3 className="size-4" />
                )}
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{step.title}</h3>
              <StepStateBadge state={step.state} />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {step.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}

function StepStateBadge({ state }: { state: VideoWorkflowStepState }) {
  const labelMap: Record<VideoWorkflowStepState, string> = {
    active: "当前",
    queued: "排队",
    locked: "待解锁",
    done: "完成",
  }
  return (
    <span className="shrink-0 rounded-md border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
      {labelMap[state]}
    </span>
  )
}

function SourceCollectionPanel({
  keyword,
  mode,
  candidates,
  status,
  isCollecting,
  douyinUrl,
  localUploadName,
  onKeywordChange,
  onModeChange,
  onCollect,
  onSelectCandidate,
  onDouyinUrlChange,
  onImportDouyinLink,
  onLocalUploadNameChange,
  onImportLocalUpload,
}: {
  keyword: string
  mode: ViralSourceCollectionMode
  candidates: ViralSourceCandidate[]
  status: string
  isCollecting: boolean
  douyinUrl: string
  localUploadName: string
  onKeywordChange: (value: string) => void
  onModeChange: (value: ViralSourceCollectionMode) => void
  onCollect: () => void
  onSelectCandidate: (candidate: ViralSourceCandidate) => void
  onDouyinUrlChange: (value: string) => void
  onImportDouyinLink: () => void
  onLocalUploadNameChange: (value: string) => void
  onImportLocalUpload: () => void
}) {
  return (
    <section className="rounded-lg border bg-background p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">爆款采集</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            关键词自动采集走适配器；登录态、接口或风控失败时，仍可粘贴抖音链接或导入本地视频。
          </p>
        </div>
        <RadioTower className="size-5 text-muted-foreground" />
      </div>

      <div className="grid gap-4">
        <div className="grid grid-cols-[minmax(0,1fr)_220px_auto] gap-3 max-lg:grid-cols-1">
          <TextField
            label="关键词"
            value={keyword}
            onChange={onKeywordChange}
          />
          <label className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              候选模式
            </span>
            <select
              value={mode}
              onChange={(event) =>
                onModeChange(event.target.value as ViralSourceCollectionMode)
              }
              className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
            >
              <option value="recent_24_48h">近 24-48 小时新爆款</option>
              <option value="stable_7d">近 7 天稳态爆款</option>
            </select>
          </label>
          <div className="grid content-end">
            <Button onClick={onCollect} disabled={isCollecting}>
              <Search className="size-4" />
              {isCollecting ? "采集中" : "采集候选"}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {status}
        </div>

        <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
          <div className="rounded-lg border bg-muted/30 p-3">
            <TextField
              label="抖音链接"
              value={douyinUrl}
              onChange={onDouyinUrlChange}
            />
            <Button
              className="mt-3"
              variant="outline"
              onClick={onImportDouyinLink}
            >
              <ListChecks className="size-4" />
              导入链接
            </Button>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <TextField
              label="本地视频文件名"
              value={localUploadName}
              onChange={onLocalUploadNameChange}
            />
            <Button
              className="mt-3"
              variant="outline"
              onClick={onImportLocalUpload}
            >
              <UploadCloud className="size-4" />
              记录本地视频
            </Button>
          </div>
        </div>

        <div className="grid gap-2">
          {candidates.length ? (
            candidates.slice(0, 5).map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className="rounded-lg border bg-muted/30 p-3 text-left transition hover:bg-muted"
                onClick={() => onSelectCandidate(candidate)}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{candidate.title}</span>
                  <span className="rounded-md border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {candidate.sourceKind === "local_upload"
                      ? "本地视频"
                      : candidate.sourceKind === "douyin_link"
                        ? "抖音链接"
                        : "自动候选"}
                  </span>
                </div>
                <div className="mt-1 grid gap-1 text-xs text-muted-foreground">
                  <span>
                    {candidate.author}
                    {candidate.durationSeconds
                      ? ` · ${candidate.durationSeconds}s`
                      : ""}
                  </span>
                  <span>
                    赞 {candidate.metrics.likes ?? 0} · 评{" "}
                    {candidate.metrics.comments ?? 0} · 收藏{" "}
                    {candidate.metrics.favorites ?? 0} · 分享{" "}
                    {candidate.metrics.shares ?? 0}
                  </span>
                </div>
              </button>
            ))
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              暂无自动候选。可以直接使用手动导入继续任务。
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function ScriptAnalysisPanel({
  topic,
  draft,
  generating,
  workflowMode,
  rewriteMode,
  fullAutoRewriteMode,
  copywritingBoard,
  conversionTheme,
  showAdvancedRewrite,
  onTopicChange,
  onWorkflowModeChange,
  onRewriteModeChange,
  onCopywritingBoardChange,
  onConversionThemeChange,
  onSaveWorkflowSettings,
  onShowAdvancedRewriteChange,
  onUsePastedScript,
  onGenerateDraft,
  onScriptChange,
}: {
  topic: string
  draft: VideoAnalysisDraft | null
  generating: boolean
  workflowMode: ScriptWorkflowMode
  rewriteMode: ScriptRewriteMode
  fullAutoRewriteMode: ScriptRewriteMode
  copywritingBoard: CopywritingBoardId
  conversionTheme: string
  showAdvancedRewrite: boolean
  onTopicChange: (value: string) => void
  onWorkflowModeChange: (value: ScriptWorkflowMode) => void
  onRewriteModeChange: (value: ScriptRewriteMode) => void
  onCopywritingBoardChange: (value: CopywritingBoardId) => void
  onConversionThemeChange: (value: string) => void
  onSaveWorkflowSettings: (
    value: ScriptRewriteMode,
    board?: CopywritingBoardId,
    conversionTheme?: string
  ) => void
  onShowAdvancedRewriteChange: (value: boolean) => void
  onUsePastedScript: () => void
  onGenerateDraft: () => void
  onScriptChange: (value: string) => void
}) {
  const visibleRewriteOptions = SCRIPT_REWRITE_MODE_OPTIONS.filter(
    (option) => !option.advancedOnly || showAdvancedRewrite
  )
  const activeFullAutoOption =
    SCRIPT_REWRITE_MODE_OPTIONS.find((option) => option.id === fullAutoRewriteMode) ||
    SCRIPT_REWRITE_MODE_OPTIONS[2]
  const productBoardSelected = copywritingBoard === "product_conversion"

  return (
    <section className="rounded-lg border bg-background p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">视频解析和原创脚本</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            来源视频或手动主题只用于结构分析，输出可编辑原创脚本；模型不可用时仍可手动继续。
          </p>
        </div>
        <ListChecks className="size-5 text-muted-foreground" />
      </div>

      <div className="grid gap-4">
        <div className="grid gap-3 rounded-lg border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border bg-background p-1">
              {(
                [
                  ["semi_auto", "半自动"],
                  ["full_auto", "全自动"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={`h-8 rounded-md px-3 text-sm transition ${
                    workflowMode === mode
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  onClick={() => onWorkflowModeChange(mode)}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showAdvancedRewrite}
                onChange={(event) =>
                  onShowAdvancedRewriteChange(event.target.checked)
                }
              />
              显示高级改写
            </label>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                文案板子 / 模板
              </span>
              <span className="text-[11px] text-muted-foreground">
                产品引流只是其中一个板子
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
              {COPYWRITING_BOARD_OPTIONS.map((option) => {
                const active = copywritingBoard === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`rounded-lg border p-3 text-left transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:bg-muted"
                    }`}
                    onClick={() => {
                      onCopywritingBoardChange(option.id)
                      if (
                        option.id === "product_conversion" &&
                        !conversionTheme.trim()
                      ) {
                        onConversionThemeChange(
                          option.defaultConversionTheme ||
                            DEFAULT_PRODUCT_CONVERSION_THEME
                        )
                      }
                    }}
                  >
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="mt-1 text-xs leading-5 opacity-80">
                      {option.description}
                    </div>
                  </button>
                )
              })}
            </div>
            {productBoardSelected ? (
              <div className="grid gap-2 rounded-lg border bg-background p-3">
                <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                  引流产品/主题
                  <input
                    value={conversionTheme}
                    onChange={(event) =>
                      onConversionThemeChange(event.target.value)
                    }
                    className="h-9 rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/20"
                    placeholder={DEFAULT_PRODUCT_CONVERSION_THEME}
                  />
                </label>
                <div className="text-xs leading-5 text-muted-foreground">
                  默认锁定豆包、炎灵、剪映；成片口播只保留评论区行动，粉丝群和微信话术在视频外处理。
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-4 gap-2 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {visibleRewriteOptions.map((option) => {
              const active = rewriteMode === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`rounded-lg border p-3 text-left transition ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  }`}
                  onClick={() => onRewriteModeChange(option.id)}
                >
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="mt-1 text-xs leading-5 opacity-80">
                    {option.description}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>全自动默认：{activeFullAutoOption.label}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onSaveWorkflowSettings(
                  rewriteMode,
                  copywritingBoard,
                  conversionTheme
                )
              }
            >
              <Save className="size-4" />
              保存全自动偏好
            </Button>
          </div>
        </div>

        <label className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            来源转写、手动主题或完整脚本
          </span>
          <textarea
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            className="min-h-24 rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={generating} onClick={onUsePastedScript}>
            <FileVideo className="size-4" />
            原文直通
          </Button>
          <Button disabled={generating} onClick={onGenerateDraft}>
            <Sparkles className="size-4" />
            {generating
              ? "生成中"
              : workflowMode === "full_auto"
                ? "全自动生成"
                : "生成结构和脚本"}
          </Button>
          <span className="text-xs text-muted-foreground">
            原文直通不会调用文本模型；改写模式使用当前文本模型 Profile。
          </span>
        </div>

        {draft ? (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  结构摘要
                </div>
                <div className="grid gap-2 text-sm leading-6">
                  <p>{draft.structureSummary.hook}</p>
                  <p>{draft.structureSummary.rhythm}</p>
                  <p>{draft.structureSummary.conversion}</p>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  句子级时间轴
                </div>
                <div className="grid gap-2 text-xs text-muted-foreground">
                  {draft.sentenceTimeline.slice(0, 4).map((cue) => (
                    <div
                      key={cue.id}
                      className="grid grid-cols-[88px_minmax(0,1fr)] gap-2"
                    >
                      <span className="font-mono">
                        {Math.round(cue.startMs / 1000)}-
                        {Math.round(cue.endMs / 1000)}s
                      </span>
                      <span className="truncate">{cue.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {draft.structureSummary.reusableElements.map((item) => (
                <span
                  key={item}
                  className="rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground"
                >
                  {item}
                </span>
              ))}
            </div>

            {draft.failureReason ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                {draft.failureReason}
              </div>
            ) : null}

            <label className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                原创完整脚本
              </span>
              <textarea
                value={draft.originalScript}
                onChange={(event) => onScriptChange(event.target.value)}
                className="min-h-56 rounded-lg border bg-background p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring/20"
              />
            </label>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
            等待来源解析。没有转写时可以直接输入主题生成可编辑脚本。
          </div>
        )}
      </div>
    </section>
  )
}

function StoryboardPanel({
  selectedPackages,
  selectedDuration,
  shots,
  onTogglePackage,
  onDurationChange,
  onGenerateStoryboard,
  onUpdateShot,
  onDeleteShot,
}: {
  selectedPackages: VideoPackageId[]
  selectedDuration: VideoDurationPreset
  shots: StoryboardShot[]
  onTogglePackage: (packageId: VideoPackageId) => void
  onDurationChange: (value: VideoDurationPreset) => void
  onGenerateStoryboard: () => void
  onUpdateShot: (shotId: string, patch: Partial<StoryboardShot>) => void
  onDeleteShot: (shotId: string) => void
}) {
  return (
    <section className="rounded-lg border bg-background p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">套餐分镜和火柴人提示词</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            选择套餐和时长后生成紧凑分镜行；火柴人镜头只显示可编辑提示词框。
          </p>
        </div>
        <Layers3 className="size-5 text-muted-foreground" />
      </div>

      <div className="grid gap-4">
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-2 max-lg:grid-cols-1">
            {VIDEO_PACKAGE_OPTIONS.map((option) => {
              const active = selectedPackages.includes(option.id)
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`rounded-lg border p-3 text-left transition ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-muted/30 hover:bg-muted"
                  }`}
                  onClick={() => onTogglePackage(option.id)}
                >
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="mt-1 text-xs leading-5 opacity-80">
                    {option.description}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-48 gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                目标时长
              </span>
              <select
                value={selectedDuration}
                onChange={(event) =>
                  onDurationChange(event.target.value as VideoDurationPreset)
                }
                className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
              >
                {VIDEO_DURATION_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={onGenerateStoryboard}>
              <Layers3 className="size-4" />
              生成分镜
            </Button>
          </div>
        </div>

        <div className="grid gap-3">
          {shots.length ? (
            shots.map((shot) => (
              <article
                key={shot.id}
                className="grid gap-3 rounded-lg border bg-muted/30 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border bg-background px-2 py-1 font-mono text-xs text-muted-foreground">
                      {shot.id}
                    </span>
                    <span className="text-sm font-medium">
                      {Math.round(shot.startMs / 1000)}-
                      {Math.round(shot.endMs / 1000)}s
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground">
                      {shot.visualType}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDeleteShot(shot.id)}
                    >
                      删除
                    </Button>
                  </div>
                </div>

                <label className="grid gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    口播文本
                  </span>
                  <input
                    value={shot.voiceText}
                    onChange={(event) =>
                      onUpdateShot(shot.id, { voiceText: event.target.value })
                    }
                    className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    画面说明
                  </span>
                  <input
                    value={shot.visualDescription}
                    onChange={(event) =>
                      onUpdateShot(shot.id, {
                        visualDescription: event.target.value,
                      })
                    }
                    className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
                  />
                </label>

                {shot.visualType === "stickman" ? (
                  <div className="grid gap-3 rounded-lg border bg-background p-3">
                    <label className="grid gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        火柴人提示词
                      </span>
                      <textarea
                        value={shot.prompt}
                        onChange={(event) =>
                          onUpdateShot(shot.id, { prompt: event.target.value })
                        }
                        className="min-h-24 rounded-lg border bg-background p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring/20"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        负面提示词
                      </span>
                      <textarea
                        value={shot.negativePrompt}
                        onChange={(event) =>
                          onUpdateShot(shot.id, {
                            negativePrompt: event.target.value,
                          })
                        }
                        className="min-h-16 rounded-lg border bg-background p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring/20"
                      />
                    </label>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              生成脚本后选择套餐和时长，即可创建可编辑分镜。
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function VideoAssetLibraryPanel({
  assets,
  stickmanShots,
  imageSettings,
  showAdvancedImageSettings,
  generatingStickman,
  queuedStickmanShotIds,
  activeStickmanShotIds,
  stickmanProgress,
  stickmanShotCount,
  generatedStickmanShotCount,
  importKind,
  importName,
  selectedMaterialLabels,
  onImagePresetChange,
  onAdvancedImageSettingChange,
  onShowAdvancedImageSettingsChange,
  onGenerateStickman,
  onRegenerateShot,
  onRegenerateAllStickman,
  onExportImagesToDraft,
  onStopStickman,
  onImportKindChange,
  onImportNameChange,
  onSelectedMaterialLabelToggle,
  onAssetLabelsChange,
  onImportAsset,
  onRemoveAsset,
}: {
  assets: VideoAsset[]
  stickmanShots: StoryboardShot[]
  imageSettings: VideoImageGenerationSettings
  showAdvancedImageSettings: boolean
  generatingStickman: boolean
  queuedStickmanShotIds: string[]
  activeStickmanShotIds: string[]
  stickmanProgress: string
  stickmanShotCount: number
  generatedStickmanShotCount: number
  importKind: VideoAssetKind
  importName: string
  selectedMaterialLabels: ExternalMaterialLabelId[]
  onImagePresetChange: (value: VideoImageGenerationPresetId) => void
  onAdvancedImageSettingChange: (
    patch: Partial<
      Pick<VideoImageGenerationSettings, "size" | "quality" | "styleStrength">
    >
  ) => void
  onShowAdvancedImageSettingsChange: (value: boolean) => void
  onGenerateStickman: () => void | Promise<void>
  onRegenerateShot: (shotId: string) => void
  onRegenerateAllStickman: () => void
  onExportImagesToDraft: () => void | Promise<void>
  onStopStickman: () => void
  onImportKindChange: (value: VideoAssetKind) => void
  onImportNameChange: (value: string) => void
  onSelectedMaterialLabelToggle: (value: ExternalMaterialLabelId) => void
  onAssetLabelsChange: (
    assetId: string,
    labels: ExternalMaterialLabelId[]
  ) => void
  onImportAsset: () => void
  onRemoveAsset: (assetId: string) => void
}) {
  const [previewAssetId, setPreviewAssetId] = useState("")
  const previewAsset =
    assets.find(
      (asset) =>
        asset.id === previewAssetId &&
        asset.kind.includes("image") &&
        Boolean(asset.previewUrl)
    ) || null
  const isGeneratedStickmanInventoryAsset = (asset: VideoAsset) =>
    asset.kind === "stickman_image" &&
    Boolean(asset.tags?.includes("generated_image"))
  const visibleInventoryAssets = assets.filter(
    (asset) => !isGeneratedStickmanInventoryAsset(asset)
  )

  return (
    <section className="rounded-lg border bg-background p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">任务素材库</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            火柴人图复用图片生成设置；视频和音频只保存任务级文件引用，避免把大文件写入
            IndexedDB。
          </p>
        </div>
        <ImagePlus className="size-5 text-muted-foreground" />
      </div>

      <div className="grid gap-4">
        <div className="grid gap-3 rounded-lg border bg-muted/20 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-44 gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                图片预设
              </span>
              <select
                value={imageSettings.presetId}
                onChange={(event) =>
                  onImagePresetChange(
                    event.target.value as VideoImageGenerationPresetId
                  )
                }
                className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
              >
                {IMAGE_GENERATION_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
              {imageSettings.aspectRatio} · {imageSettings.size} ·{" "}
              {imageSettings.quality}
            </div>
            <label className="flex h-9 items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showAdvancedImageSettings}
                onChange={(event) =>
                  onShowAdvancedImageSettingsChange(event.target.checked)
                }
              />
              显示高级参数
            </label>
          </div>

          {showAdvancedImageSettings ? (
            <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-1">
              <TextField
                label="尺寸"
                value={imageSettings.size}
                onChange={(value) =>
                  onAdvancedImageSettingChange({ size: value })
                }
              />
              <label className="grid gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  质量
                </span>
                <select
                  value={imageSettings.quality}
                  onChange={(event) =>
                    onAdvancedImageSettingChange({
                      quality: event.target
                        .value as VideoImageGenerationSettings["quality"],
                    })
                  }
                  className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
                >
                  {["auto", "high", "medium", "low"].map((quality) => (
                    <option key={quality} value={quality}>
                      {quality}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  风格强度 {imageSettings.styleStrength}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={imageSettings.styleStrength}
                  onChange={(event) =>
                    onAdvancedImageSettingChange({
                      styleStrength: Number(event.target.value),
                    })
                  }
                  className="h-9"
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Button disabled={generatingStickman} onClick={onGenerateStickman}>
            <ImagePlus className="size-4" />
            {generatingStickman ? "生成中" : "补齐缺失"}
          </Button>
          <Button
            variant="outline"
            disabled={generatingStickman || !stickmanShotCount}
            onClick={onRegenerateAllStickman}
          >
            <ImagePlus className="size-4" />
            全部重新生成
          </Button>
          <Button
            variant="outline"
            disabled={generatingStickman || generatedStickmanShotCount === 0}
            onClick={onExportImagesToDraft}
          >
            <FileVideo className="size-4" />
            导出图片到剪映草稿
          </Button>
          {generatingStickman ? (
            <Button variant="outline" onClick={onStopStickman}>
              <SquareStop className="size-4" />
              停止生成
            </Button>
          ) : null}
          {stickmanProgress ? (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {stickmanProgress}
            </div>
          ) : null}
          {stickmanShotCount ? (
            <div className="rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
              火柴人图 {generatedStickmanShotCount}/{stickmanShotCount}
            </div>
          ) : null}
          <label className="grid min-w-44 gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              素材类别
            </span>
            <select
              value={importKind}
              onChange={(event) =>
                onImportKindChange(event.target.value as VideoAssetKind)
              }
              className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
            >
              {VIDEO_ASSET_CATEGORY_OPTIONS.map((option) => (
                <option key={option.kind} value={option.kind}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <TextField
            label="导入文件名"
            value={importName}
            onChange={onImportNameChange}
          />
          <Button variant="outline" onClick={onImportAsset}>
            <UploadCloud className="size-4" />
            导入素材记录
          </Button>
        </div>

        <div className="grid gap-2 rounded-lg border bg-muted/20 p-3">
          <div className="text-xs font-medium text-muted-foreground">
            用途标签
          </div>
          <div className="flex flex-wrap gap-2">
            {EXTERNAL_MATERIAL_LABEL_OPTIONS.map((option) => (
              <label
                key={option.id}
                className="flex h-8 items-center gap-2 rounded-md border bg-background px-2 text-xs text-muted-foreground"
              >
                <input
                  type="checkbox"
                  checked={selectedMaterialLabels.includes(option.id)}
                  onChange={() => onSelectedMaterialLabelToggle(option.id)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        {stickmanShots.length ? (
          <div className="grid gap-2">
            {stickmanShots.map((shot) => {
              const shotAsset = assets.find(
                (asset) =>
                  asset.kind === "stickman_image" &&
                  asset.tags?.includes("generated_image") &&
                  asset.tags?.includes(shot.id)
              )
              const shotAssetLabels = shotAsset
                ? getExternalMaterialLabels(shotAsset)
                : []
              const pendingShotIds = queuedStickmanShotIds
              const queued =
                pendingShotIds.includes(shot.id) ||
                activeStickmanShotIds.includes(shot.id)
              return (
                <div
                  key={shot.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-muted/20 p-3 text-sm"
                >
                  <div className="grid min-w-0 gap-3">
                    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                      {shotAsset?.previewUrl ? (
                        <button
                          type="button"
                          className="text-left"
                          onClick={() => setPreviewAssetId(shotAsset.id)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={shotAsset.previewUrl}
                            alt={shotAsset.displayName}
                            className="size-12 rounded-md border object-cover"
                          />
                        </button>
                      ) : (
                        <div className="grid size-12 place-items-center rounded-md border border-dashed bg-background text-muted-foreground">
                          <ImagePlus className="size-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div>
                          <span className="font-mono text-xs text-muted-foreground">
                            {shot.id}
                          </span>
                          <span className="ml-2 text-muted-foreground">
                            {queued
                              ? activeStickmanShotIds.includes(shot.id)
                                ? "生成中"
                                : "排队中"
                              : shotAsset
                                ? "ready"
                                : "缺图"}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {shotAsset?.displayName || shot.voiceText}
                        </div>
                      </div>
                    </div>
                    {shotAsset ? (
                      <div className="flex flex-wrap gap-1.5">
                        {EXTERNAL_MATERIAL_LABEL_OPTIONS.map((option) => {
                          const checked = shotAssetLabels.includes(option.id)
                          return (
                            <label
                              key={option.id}
                              className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs ${
                                checked
                                  ? "bg-background text-foreground"
                                  : "bg-muted/20 text-muted-foreground"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  onAssetLabelsChange(
                                    shotAsset.id,
                                    checked
                                      ? shotAssetLabels.filter(
                                          (label) => label !== option.id
                                        )
                                      : [...shotAssetLabels, option.id]
                                  )
                                }
                              />
                              {option.label}
                            </label>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={queued}
                      onClick={() => onRegenerateShot(shot.id)}
                    >
                      {generatingStickman && !queued ? "加入队列" : "重新生成"}
                    </Button>
                    {shotAsset ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={queued}
                        onClick={() => onRemoveAsset(shotAsset.id)}
                      >
                        移除
                      </Button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}

        <div className="grid gap-2">
          <div className="text-xs font-medium text-muted-foreground">
            外部素材库存
          </div>
          {visibleInventoryAssets.length ? (
            visibleInventoryAssets.map((asset) => {
              const assetLabels = getExternalMaterialLabels(asset)
              return (
                <div
                  key={asset.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-muted/30 p-3"
                >
                  <div className="grid min-w-0 gap-3">
                    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                      {asset.kind.includes("image") && asset.previewUrl ? (
                        <button
                          type="button"
                          className="text-left"
                          onClick={() => setPreviewAssetId(asset.id)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={asset.previewUrl}
                            alt={asset.displayName}
                            className="size-14 rounded-md border object-cover"
                          />
                        </button>
                      ) : (
                        <div className="grid size-14 place-items-center rounded-md border bg-background text-muted-foreground">
                          <ImagePlus className="size-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {asset.displayName}
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {asset.kind} · {asset.file.path}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {EXTERNAL_MATERIAL_LABEL_OPTIONS.map((option) => {
                        const checked = assetLabels.includes(option.id)
                        return (
                          <label
                            key={option.id}
                            className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs ${
                              checked
                                ? "bg-background text-foreground"
                                : "bg-muted/20 text-muted-foreground"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                onAssetLabelsChange(
                                  asset.id,
                                  checked
                                    ? assetLabels.filter(
                                        (label) => label !== option.id
                                      )
                                    : [...assetLabels, option.id]
                                )
                              }
                            />
                            {option.label}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRemoveAsset(asset.id)}
                  >
                    移除
                  </Button>
                </div>
              )
            })
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              自动生成的火柴人图已合并到上方分镜行；这里仅显示导入的炎灵录屏、成品展示、BGM、音效和封面素材。
            </div>
          )}
        </div>
      </div>
      {previewAsset?.previewUrl ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-4 backdrop-blur"
          role="dialog"
          aria-modal="true"
          aria-label={previewAsset.displayName}
          onClick={() => setPreviewAssetId("")}
        >
          <Button
            variant="outline"
            size="icon"
            className="absolute top-4 right-4"
            aria-label="关闭图片预览"
            onClick={() => setPreviewAssetId("")}
          >
            <X className="size-4" />
          </Button>
          <button
            type="button"
            className="grid max-h-[calc(100svh-5rem)] max-w-[calc(100vw-2rem)] place-items-center"
            onClick={() => setPreviewAssetId("")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewAsset.previewUrl}
              alt={previewAsset.displayName}
              className="max-h-[calc(100svh-5rem)] max-w-[calc(100vw-2rem)] rounded-lg border bg-background object-contain shadow-2xl"
            />
          </button>
        </div>
      ) : null}
    </section>
  )
}

function TimelineAssemblyPanel({
  voice,
  timeline,
  storyboardCount,
  assetCount,
  ttsSettings,
  taskVoicePresetId,
  ttsStatus,
  onAssembleTimeline,
  onSaveTtsSettings,
  onTaskVoicePresetChange,
  onCheckTtsSettings,
}: {
  voice: VoicePlan | null
  timeline: VideoTimeline | null
  storyboardCount: number
  assetCount: number
  ttsSettings: VideoTtsSettings
  taskVoicePresetId: VideoTtsVoicePresetId | ""
  ttsStatus: string
  onAssembleTimeline: () => void
  onSaveTtsSettings: (settings: VideoTtsSettings) => void
  onTaskVoicePresetChange: (value: VideoTtsVoicePresetId | "") => void
  onCheckTtsSettings: (settings?: VideoTtsSettings) => void
}) {
  const timelineSeconds = timeline ? Math.round(timeline.durationMs / 1000) : 0
  const selectedVoice = resolveVideoTtsVoiceSelection({
    settings: ttsSettings,
    taskVoicePresetId,
  })
  return (
    <section className="rounded-lg border bg-background p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">配音字幕和统一时间线</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            批准脚本后生成任务级配音文件引用、字幕 cue 和 renderer 共用的
            VideoTimeline。
          </p>
        </div>
        <Button onClick={onAssembleTimeline}>
          <Clock3 className="size-4" />
          生成时间线
        </Button>
      </div>

      <div className="grid gap-4">
        <TtsSettingsEditor
          key={`${ttsSettings.engine}:${ttsSettings.projectPath}:${ttsSettings.launchCommand}:${ttsSettings.launchArgs.join("\u0000")}:${ttsSettings.referenceAudioPath}:${ttsSettings.manualAudioPath}:${ttsSettings.cloudProfileId}`}
          settings={ttsSettings}
          taskVoicePresetId={taskVoicePresetId}
          status={ttsStatus}
          onSave={onSaveTtsSettings}
          onTaskVoicePresetChange={onTaskVoicePresetChange}
          onCheck={onCheckTtsSettings}
        />

        <div className="grid grid-cols-5 gap-3 max-xl:grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
          <TimelineMetric label="分镜" value={`${storyboardCount}`} />
          <TimelineMetric label="素材" value={`${assetCount}`} />
          <TimelineMetric
            label="字幕"
            value={`${voice?.subtitles.length || 0}`}
          />
          <TimelineMetric
            label="时长"
            value={timeline ? `${timelineSeconds}s` : "--"}
          />
          <TimelineMetric label="音色" value={selectedVoice.label} />
        </div>

        {voice || timeline ? (
          <div className="grid gap-4">
            {voice?.audio ? (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  配音文件
                </div>
                <div className="truncate font-mono text-xs text-muted-foreground">
                  {voice.audio.path}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  TTS 未返回 timestamps 时，当前版本使用脚本句子级 fallback
                  timing；用户仍可手动改脚本后重新生成。
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-4 max-lg:grid-cols-1">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  字幕预览
                </div>
                <div className="grid gap-2">
                  {(voice?.subtitles || []).slice(0, 5).map((cue) => (
                    <div
                      key={cue.id}
                      className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 text-xs"
                    >
                      <span className="font-mono text-muted-foreground">
                        {Math.round(cue.startMs / 1000)}-
                        {Math.round(cue.endMs / 1000)}s
                      </span>
                      <span className="truncate">{cue.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Timeline tracks
                </div>
                <div className="grid gap-2">
                  {(timeline?.tracks || []).map((track) => (
                    <div
                      key={track.id}
                      className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-xs"
                    >
                      <span className="font-medium">{track.type}</span>
                      <span className="font-mono text-muted-foreground">
                        {track.clips.length} clips
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
            完成脚本、分镜和素材后生成统一时间线；缺少真实 TTS
            对齐数据时会保留可编辑的句子级时间码。
          </div>
        )}
      </div>
    </section>
  )
}

function TtsSettingsEditor({
  settings,
  taskVoicePresetId,
  status,
  onSave,
  onTaskVoicePresetChange,
  onCheck,
}: {
  settings: VideoTtsSettings
  taskVoicePresetId: VideoTtsVoicePresetId | ""
  status: string
  onSave: (settings: VideoTtsSettings) => void
  onTaskVoicePresetChange: (value: VideoTtsVoicePresetId | "") => void
  onCheck: (settings?: VideoTtsSettings) => void
}) {
  const [draft, setDraft] = useState(settings)
  const launchPlan = createVideoTtsLaunchPlan(draft)
  const selectedVoice = resolveVideoTtsVoiceSelection({
    settings: draft,
    taskVoicePresetId,
  })
  const chooseAudioFile = async (
    field: "referenceAudioPath" | "manualAudioPath"
  ) => {
    const result = await window.promptCenterDesktop?.selectAudioFile?.()
    if (!result) return
    if (result.error) {
      setDraft((current) => ({ ...current }))
      return
    }
    if (result.canceled || !result.filePath) return
    setDraft((current) => ({
      ...current,
      [field]: result.filePath || "",
      embedModelInPackage: false,
    }))
  }

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">配音 TTS</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            本地 IndexTTS2、云端 TTS 和手动音频共用同一套任务时间线；安装包只保存路径和 Profile，不内置模型或音频文件。
          </p>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-1">
        <label className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            TTS 模式
          </span>
          <select
            value={draft.engine}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                engine: event.target.value as VideoTtsSettings["engine"],
                embedModelInPackage: false,
              }))
            }
            className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
          >
            <option value="local_indextts2">本地 IndexTTS2</option>
            <option value="cloud_tts">云端 TTS</option>
            <option value="manual_audio">手动音频</option>
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            全局默认音色
          </span>
          <select
            value={draft.defaultVoicePresetId}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                defaultVoicePresetId: event.target
                  .value as VideoTtsVoicePresetId,
                embedModelInPackage: false,
              }))
            }
            className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
          >
            {COMMON_VIDEO_TTS_VOICE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            任务临时音色
          </span>
          <select
            value={taskVoicePresetId}
            onChange={(event) =>
              onTaskVoicePresetChange(
                event.target.value as VideoTtsVoicePresetId | ""
              )
            }
            className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
          >
            <option value="">使用全局默认</option>
            {COMMON_VIDEO_TTS_VOICE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <TextField
          label="IndexTTS2 工程目录"
          value={draft.projectPath}
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              projectPath: value,
              embedModelInPackage: false,
            }))
          }
        />
        <TextField
          label="启动命令"
          value={draft.launchCommand}
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              launchCommand: value,
              embedModelInPackage: false,
            }))
          }
        />
        <div className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            参考音频 / 音色样本
          </span>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <input
              value={draft.referenceAudioPath}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  referenceAudioPath: event.target.value,
                  embedModelInPackage: false,
                }))
              }
              className="h-9 min-w-0 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
              placeholder="可选：选择 wav/mp3/m4a"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => chooseAudioFile("referenceAudioPath")}
            >
              <FolderOpen className="size-4" />
              选择音频
            </Button>
          </div>
        </div>
        <div className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            手动配音文件
          </span>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <input
              value={draft.manualAudioPath}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  manualAudioPath: event.target.value,
                  embedModelInPackage: false,
                }))
              }
              className="h-9 min-w-0 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
              placeholder="手动音频模式使用"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => chooseAudioFile("manualAudioPath")}
            >
              <FolderOpen className="size-4" />
              选择音频
            </Button>
          </div>
        </div>
      </div>
      <div className="rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
        当前音色：{selectedVoice.label} · {selectedVoice.description} · 云端 TTS 使用设置里的 {apiProfileServiceLabels.cloud_tts} Profile。
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => onSave(draft)}>
          <Save className="size-4" />
          保存 TTS 配置
        </Button>
        <Button variant="outline" onClick={() => onCheck(draft)}>
          <Search className="size-4" />
          检测配置
        </Button>
        <span className="text-xs text-muted-foreground">
          云端 TTS 可用于低配电脑；真实合成接口按 Profile 地址、模型名和 Key 发起。
        </span>
      </div>
      <div className="truncate rounded-md border bg-background px-2 py-1.5 font-mono text-xs text-muted-foreground">
        {draft.engine === "cloud_tts"
          ? `cloud_tts profile=${launchPlan.cloudProfileId || "active"} reference=${launchPlan.referenceAudioPath || "none"}`
          : draft.engine === "manual_audio"
            ? `manual_audio file=${launchPlan.manualAudioPath || "none"}`
            : launchPlan.manualCommand}
      </div>
    </div>
  )
}

function TimelineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
    </div>
  )
}

function RenderExportPanel({
  engines,
  requestedEngine,
  plan,
  hasTimeline,
  aiDirectorStatus,
  generatingAiDirector,
  onEngineChange,
  onGenerateAiDirectorPlan,
  onPrepareExport,
}: {
  engines: RenderEngineOption[]
  requestedEngine: RenderEngineId
  plan: JianyingDraftPlan | null
  hasTimeline: boolean
  aiDirectorStatus: string
  generatingAiDirector: boolean
  onEngineChange: (engine: RenderEngineId) => void
  onGenerateAiDirectorPlan: () => void
  onPrepareExport: () => void
}) {
  return (
    <section className="rounded-lg border bg-background p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">剪映草稿</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            先由剪辑决策模型生成 AI 精剪方案，再导入到剪映可编辑草稿；MP4 导出不是默认输出。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={!hasTimeline || generatingAiDirector}
            onClick={onGenerateAiDirectorPlan}
          >
            <Sparkles className="size-4" />
            {generatingAiDirector ? "AI 精剪中" : "生成 AI 剪辑决策"}
          </Button>
          <Button disabled={!hasTimeline} onClick={onPrepareExport}>
            <FileVideo className="size-4" />
            生成剪映草稿
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span>AI 剪辑决策</span>
          <span className="min-w-0 truncate font-mono">{aiDirectorStatus}</span>
        </div>

        <div className="grid grid-cols-4 gap-2 max-xl:grid-cols-2 max-sm:grid-cols-1">
          {engines.map((engine) => {
            const active = requestedEngine === engine.id
            const unavailable = engine.status !== "available"
            return (
              <button
                key={engine.id}
                type="button"
                className={`grid min-h-32 gap-2 rounded-lg border p-3 text-left transition ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-muted/30 hover:bg-muted"
                }`}
                onClick={() => onEngineChange(engine.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium">{engine.label}</div>
                  <span className="rounded-md border bg-background/70 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {engine.status}
                  </span>
                </div>
                <div className="text-xs leading-5 opacity-80">
                  {engine.description}
                </div>
                {unavailable ? (
                  <div className="text-xs leading-5 opacity-80">
                    {engine.disabledReason}
                  </div>
                ) : null}
              </button>
            )
          })}
        </div>

        {!hasTimeline ? (
          <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
            先生成统一时间线，再创建剪映草稿。
          </div>
        ) : null}

        {plan ? (
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">{plan.message}</div>
              <StatusBadge status={plan.status} />
            </div>
            <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-2 text-xs max-sm:grid-cols-1">
              <span className="text-muted-foreground">预览/输出路径</span>
              <span className="min-w-0 truncate font-mono">
                {plan.previewPath}
              </span>
              <span className="text-muted-foreground">草稿命令</span>
              <span className="min-w-0 truncate font-mono">
                {plan.command || "等待剪映草稿计划"}
              </span>
            </div>
            {plan.requiredConfirmations.length ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                需要确认：{plan.requiredConfirmations.join("、")}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function PublishPanel({
  draft,
  autoPublishEnabled,
  onGenerateDraft,
  onUpdateDraft,
  onUpdateAccount,
  onConfirmPublish,
  onRiskPause,
}: {
  draft: PublishDraft | null
  autoPublishEnabled: boolean
  onGenerateDraft: () => void
  onUpdateDraft: (patch: Partial<PublishDraft>) => void
  onUpdateAccount: (patch: Partial<PublishAccount>) => void
  onConfirmPublish: () => void
  onRiskPause: () => void
}) {
  return (
    <section className="rounded-lg border bg-background p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">发布确认</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            标题、话题、简介、封面和账号必须由用户确认后才会交给授权浏览器
            Profile 执行。
          </p>
        </div>
        <Button variant="outline" onClick={onGenerateDraft}>
          <Save className="size-4" />
          生成草稿
        </Button>
      </div>

      {!draft ? (
        <div className="grid min-h-60 place-items-center rounded-lg border border-dashed bg-muted/30 p-6 text-center">
          <div>
            <UploadCloud className="mx-auto mb-3 size-8 text-muted-foreground" />
            <div className="font-medium">等待渲染输出</div>
            <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
              渲染完成后会生成可编辑的发布草稿。这里可以先生成一份本地草稿验证确认门和风险暂停流程。
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
            <TextField
              label="标题"
              value={draft.title}
              onChange={(value) => onUpdateDraft({ title: value })}
            />
            <TextField
              label="封面文件"
              value={draft.coverImagePath}
              onChange={(value) => onUpdateDraft({ coverImagePath: value })}
            />
            <TextField
              label="话题"
              value={draft.topics.join("、")}
              onChange={(value) =>
                onUpdateDraft({
                  topics: value
                    .split(/[、,，\s]+/u)
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
            />
            <TextField
              label="授权浏览器 Profile"
              value={draft.account.browserProfileId}
              onChange={(value) =>
                onUpdateAccount({ browserProfileId: value.trim() })
              }
            />
            <TextField
              label="发布账号"
              value={draft.account.displayName}
              onChange={(value) => onUpdateAccount({ displayName: value })}
            />
            <label className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                账号授权状态
              </span>
              <select
                value={draft.account.authorized ? "yes" : "no"}
                onChange={(event) =>
                  onUpdateAccount({ authorized: event.target.value === "yes" })
                }
                className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
              >
                <option value="yes">已由用户授权</option>
                <option value="no">未授权</option>
              </select>
            </label>
          </div>

          <label className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              简介
            </span>
            <textarea
              value={draft.intro}
              onChange={(event) => onUpdateDraft({ intro: event.target.value })}
              className="min-h-24 rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onConfirmPublish}>
              {autoPublishEnabled ? (
                <UploadCloud className="size-4" />
              ) : (
                <Lock className="size-4" />
              )}
              确认并准备发布
            </Button>
            <Button variant="outline" onClick={onRiskPause}>
              <AlertTriangle className="size-4" />
              记录风控暂停
            </Button>
            <StatusBadge status={draft.status} />
          </div>

          {draft.pauseReason || draft.reason ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {draft.pauseReason || draft.reason}
            </div>
          ) : null}

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              发布记录
            </div>
            <div className="grid gap-2">
              {draft.publishLog.slice(-5).map((entry) => (
                <div
                  key={`${entry.at}-${entry.kind}-${entry.message}`}
                  className="grid grid-cols-[120px_120px_minmax(0,1fr)] gap-2 text-xs max-md:grid-cols-1"
                >
                  <span className="font-mono text-muted-foreground">
                    {entry.at.slice(0, 19).replace("T", " ")}
                  </span>
                  <span>{entry.kind}</span>
                  <span className="min-w-0">{entry.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function ApiProfilesPanel({
  store,
  onSaveProfile,
  onSelectProfile,
}: {
  store: ApiProfileStore
  onSaveProfile: (profile: ApiProfile) => void
  onSelectProfile: (service: ApiProfileService, profileId: string) => void
}) {
  const [editingService, setEditingService] =
    useState<ApiProfileService>("text_model")
  const activeProfile = resolveApiProfile(store, editingService)

  return (
    <section className="rounded-lg border bg-background p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">API Profile</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            文本、图片和剪辑决策已接入运行时主备切换；云端 TTS、视频解析和发布辅助目前是配置预留。Key
            只用于对应请求，不写入任务日志或导出摘要。
          </p>
        </div>
        <Settings className="size-5 text-muted-foreground" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="grid content-start gap-2">
          {API_PROFILE_SERVICES.map((service) => {
            const profile = resolveApiProfile(store, service)
            const active = service === editingService
            return (
              <button
                key={service}
                type="button"
                className={`rounded-lg border px-3 py-2 text-left transition ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-muted/30 hover:bg-muted"
                }`}
                onClick={() => setEditingService(service)}
              >
                <div className="flex items-center justify-between gap-2 text-sm font-medium">
                  <span>{apiProfileServiceLabels[service]}</span>
                  <span className="text-[11px] opacity-75">
                    {profile.apiKey.trim() ? "已配置" : "未配置"}
                  </span>
                </div>
                <div className="mt-1 truncate text-xs opacity-80">
                  {profile.label}
                </div>
              </button>
            )
          })}
        </div>

        <ApiProfileEditor
          key={`${editingService}:${activeProfile.id}`}
          activeProfile={activeProfile}
          editingService={editingService}
          store={store}
          onSaveProfile={onSaveProfile}
          onSelectProfile={onSelectProfile}
        />
      </div>
    </section>
  )
}

function ApiProfileEditor({
  activeProfile,
  editingService,
  store,
  onSaveProfile,
  onSelectProfile,
}: {
  activeProfile: ApiProfile
  editingService: ApiProfileService
  store: ApiProfileStore
  onSaveProfile: (profile: ApiProfile) => void
  onSelectProfile: (service: ApiProfileService, profileId: string) => void
}) {
  const [draft, setDraft] = useState<ApiProfile>(activeProfile)

  const saveDraft = () => {
    onSaveProfile({
      ...draft,
      service: editingService,
      id: draft.id.trim() || `${editingService}-custom`,
      label: draft.label.trim() || apiProfileServiceLabels[editingService],
      model: draft.model.trim(),
      apiBaseUrl: draft.apiBaseUrl.trim(),
      apiKey: draft.apiKey.trim(),
    })
  }

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-4">
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <TextField
          label="Profile ID"
          value={draft.id}
          onChange={(value) =>
            setDraft((current) => ({ ...current, id: value }))
          }
        />
        <TextField
          label="显示名称"
          value={draft.label}
          onChange={(value) =>
            setDraft((current) => ({ ...current, label: value }))
          }
        />
        <TextField
          label="API 地址"
          value={draft.apiBaseUrl}
          onChange={(value) =>
            setDraft((current) => ({ ...current, apiBaseUrl: value }))
          }
        />
        <TextField
          label="模型名"
          value={draft.model}
          onChange={(value) =>
            setDraft((current) => ({ ...current, model: value }))
          }
        />
        <label className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            API Key
          </span>
          <input
            value={draft.apiKey}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                apiKey: event.target.value,
              }))
            }
            className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
            type="password"
            placeholder="sk-..."
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={saveDraft}>
          <Save className="size-4" />
          保存 Profile
        </Button>
        <select
          value={store.activeProfileByService[editingService]}
          onChange={(event) =>
            onSelectProfile(editingService, event.target.value)
          }
          className="h-9 min-w-56 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
          aria-label={`${apiProfileServiceLabels[editingService]} Profile`}
        >
          {store.profiles[editingService].map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          当前请求会使用所选 Profile 的地址和 Key。
        </span>
      </div>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
      />
    </label>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex min-h-8 items-center rounded-lg border bg-muted px-2.5 text-xs text-muted-foreground">
      状态：{status}
    </span>
  )
}
