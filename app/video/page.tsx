"use client"

import { useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  Clock3,
  FileVideo,
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
  readVideoTasks,
  saveVideoTasks,
  type VideoTask,
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
  createApiProfileLogEntry,
  createDefaultApiProfileStore,
  readApiProfileStore,
  resolveApiProfile,
  saveApiProfileStore,
  setActiveApiProfile,
  upsertApiProfile,
  type ApiProfile,
  type ApiProfileService,
  type ApiProfileStore,
} from "@/lib/api-profiles"
import {
  VIDEO_ASSET_CATEGORY_OPTIONS,
  createImportedVideoAsset,
  createVideoAssetLogEntry,
  generateStickmanStoryboardAsset,
  removeVideoAssetById,
  runStickmanImageGenerationQueue,
} from "@/lib/video-assets"
import {
  buildScriptGenerationRequest,
  createModelVideoAnalysisDraft,
  createScriptGenerationFailureDraft,
  createScriptGenerationLogEntry,
  type VideoAnalysisDraft,
} from "@/lib/video-analysis"
import {
  VIDEO_DURATION_OPTIONS,
  VIDEO_PACKAGE_OPTIONS,
  createStoryboardFromScript,
} from "@/lib/video-storyboard"
import {
  createUnifiedVideoTimeline,
  createVoicePlanFromScript,
} from "@/lib/video-timeline"
import {
  createDefaultVideoTtsSettings,
  createVideoTtsLaunchPlan,
  readVideoTtsSettings,
  saveVideoTtsSettings,
  type VideoTtsSettings,
} from "@/lib/video-tts"
import {
  createRenderEngineOptions,
  createRenderExportPlan,
  type RenderEngineId,
  type RenderEngineOption,
  type RenderExportPlan,
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
  video_parsing: "视频解析",
  publish_helper: "发布辅助",
}

const sourceModeLabels: Record<ViralSourceCollectionMode, string> = {
  recent_24_48h: "近 24-48 小时新爆款",
  stable_7d: "近 7 天稳态爆款",
}

export default function VideoFactoryPage() {
  return (
    <LicenseGate feature="video_factory" title="视频工厂">
      <VideoFactoryShell />
    </LicenseGate>
  )
}

function VideoFactoryShell() {
  const license = useLicenseVerification()
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
  const [videoAssets, setVideoAssets] = useState<VideoAsset[]>([])
  const [isGeneratingStickmanImages, setIsGeneratingStickmanImages] =
    useState(false)
  const [stickmanProgress, setStickmanProgress] = useState("")
  const stopStickmanGenerationRef = useRef(false)
  const [voicePlan, setVoicePlan] = useState<VoicePlan | null>(null)
  const [ttsSettings, setTtsSettings] = useState<VideoTtsSettings>(
    createDefaultVideoTtsSettings
  )
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
  const [renderPlan, setRenderPlan] = useState<RenderExportPlan | null>(null)
  const [toast, setToast] = useState("")
  const autoPublishEnabled = hasLicenseFeature(license.result, "auto_publish")
  const activeTask = tasks.find((task) => task.id === activeTaskId) || tasks[0]

  useEffect(() => {
    let alive = true
    Promise.resolve().then(() => {
      if (!alive) return
      try {
        setPublishDraft(readPublishDraft())
        const restoredTasks = readVideoTasks()
        setTasks(restoredTasks)
        setActiveTaskId(restoredTasks[0]?.id || "")
        setApiProfiles(readApiProfileStore())
        setTtsSettings(readVideoTtsSettings())
      } catch {
        setPublishDraft(null)
        setTasks([])
        setActiveTaskId("")
        setApiProfiles(createDefaultApiProfileStore())
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
    Promise.resolve().then(() => {
      if (!alive) return
      if (!activeTask?.id) {
        setAnalysisDraft(null)
        setStoryboardShots([])
        setVideoAssets([])
        setStickmanProgress("")
        setVoicePlan(null)
        setVideoTimeline(null)
        setRenderPlan(null)
        return
      }
      const snapshot = readVideoTaskSnapshot(activeTask.id)
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
      const renderedAsset = snapshot?.assets.find(
        (asset) =>
          asset.kind === "rendered_video" &&
          asset.tags?.includes("render_export_plan")
      )
      setRenderPlan(
        renderedAsset
          ? {
              taskId: activeTask.id,
              engineId: null,
              requestedEngineId: requestedRenderEngine,
              status: "ready",
              output: renderedAsset,
              previewPath: renderedAsset.file.path,
              command: "",
              message: "已恢复上次导出计划。",
            }
          : null
      )
    })
    return () => {
      alive = false
    }
  }, [activeTask?.id, activeTask?.title, requestedRenderEngine])

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
    setTtsSettings(settings)
    saveVideoTtsSettings(settings)
    setTtsStatus("本地 TTS 配置已保存")
    setToast("TTS 路径配置已保存")
  }

  const checkTtsSettings = async (settings = ttsSettings) => {
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
        assets: [
          {
            id: "render_placeholder",
            kind: "rendered_video",
            displayName: "rendered-video-placeholder.mp4",
            file: createTaskFileRef({
              taskId: task.id,
              kind: "rendered_video",
              filename: "rendered-video-placeholder.mp4",
              mimeType: "video/mp4",
            }),
          },
        ],
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

  const generateAnalysisDraft = async () => {
    const request = buildScriptGenerationRequest({
      profile: buildApiProfileRequestContext(apiProfiles, "text_model"),
      sourceText: analysisTopic,
      durationPreset: "45-60s",
      packageId: "stickman_meme",
    })
    const logEntry = createScriptGenerationLogEntry(request)
    let draft: VideoAnalysisDraft

    setIsGeneratingAnalysis(true)
    try {
      if (!request.apiKey) {
        throw new Error("文本模型 Profile 尚未配置 API Key，已切换到手动编辑。")
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
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : `文本模型请求失败：${response.status}`
        )
      }

      const modelText =
        typeof payload?.text === "string" ? payload.text.trim() : ""
      if (!modelText) throw new Error("文本模型没有返回脚本内容")

      draft = createModelVideoAnalysisDraft({
        sourceText: analysisTopic,
        modelText,
      })
    } catch (error) {
      draft = createScriptGenerationFailureDraft({
        sourceText: analysisTopic,
        reason:
          error instanceof Error
            ? error.message
            : "文本模型请求失败，已切换到手动编辑。",
      })
    } finally {
      setIsGeneratingAnalysis(false)
    }

    setAnalysisDraft(draft)
    updateActiveTaskSnapshot((snapshot) => ({
      ...snapshot,
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
          message: `脚本分析：${draft.status} · ${logEntry.profileId} · ${logEntry.sourceLength} 字符`,
        },
      ],
    }))
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
    setStickmanProgress("正在停止，已发出的请求会先返回")
    setToast("已请求停止生成")
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

  const generateStickmanAsset = async () => {
    const stickmanShots = storyboardShots.filter(
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

    stopStickmanGenerationRef.current = false
    setIsGeneratingStickmanImages(true)
    const profile = buildApiProfileRequestContext(apiProfiles, "image_generation")
    let completed = 0
    let failed = 0

    try {
      const result = await runStickmanImageGenerationQueue({
        items: stickmanShots,
        concurrency: STICKMAN_IMAGE_CONCURRENCY,
        shouldStop: () => stopStickmanGenerationRef.current,
        worker: async (shot) => {
          const updateProgress = (extra = "") => {
            const running = Math.min(
              STICKMAN_IMAGE_CONCURRENCY,
              stickmanShots.length - completed - failed
            )
            setStickmanProgress(
              `已完成 ${completed}/${stickmanShots.length} · 运行 ${running} · 失败 ${failed}${extra}`
            )
          }

          try {
            updateProgress(` · ${shot.id}`)
            setToast(`正在生成火柴人图：${shot.id}`)
            const result = await generateStickmanStoryboardAsset({
              taskId: activeTask.id,
              shot,
              profile,
              onAttempt: (attempt, maxAttempts) =>
                setStickmanProgress(
                  `已完成 ${completed}/${stickmanShots.length} · 运行中 · ${shot.id} · 第 ${attempt}/${maxAttempts} 次`
                ),
              requestImages: async (request) => {
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
                    n: 1,
                  }),
                })
                const payload = (await response.json().catch(() => null)) as {
                  images?: unknown
                  error?: unknown
                } | null

                if (!response.ok) {
                  throw new Error(
                    typeof payload?.error === "string"
                      ? payload.error
                      : `图片生成失败：${response.status}`
                  )
                }
                if (!Array.isArray(payload?.images)) {
                  throw new Error("接口没有返回图片")
                }
                return payload.images
              },
            })
            const saved = await window.promptCenterDesktop?.saveTaskAssetFile?.({
              taskId: activeTask.id,
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
            const logEntry = createVideoAssetLogEntry(result.request)
            const record: VideoTaskSnapshot["records"][number] = {
              id: `asset_${shot.id}_${Date.now()}`,
              at: new Date().toISOString(),
              kind: "asset_added",
              message: `火柴人图已生成：${shot.id} · ${logEntry.profileId} · ${result.attempts} 次请求`,
            }
            const isSameShotGeneratedImage = (item: VideoAsset) =>
              item.kind === "stickman_image" &&
              item.tags?.includes("generated_image") &&
              item.tags?.includes(shot.id)

            completed += 1
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
                ...snapshot.assets.filter(
                  (item) => !isSameShotGeneratedImage(item)
                ),
              ],
              records: [...snapshot.records, record],
            }))
            updateProgress()
          } catch (error) {
            failed += 1
            updateProgress(` · ${shot.id} 失败`)
            throw error
          }
        },
      })

      failed = result.failed
      if (result.fatalError) {
        setToast(result.fatalError.message)
        setStickmanProgress(
          `已停止：余额不足 · 已完成 ${completed}/${stickmanShots.length} · 失败 ${failed}`
        )
        return
      }
      if (result.stopped) {
        setToast(`已停止，已生成 ${completed} 张`)
        setStickmanProgress(
          `已停止 · 已完成 ${completed}/${stickmanShots.length} · 失败 ${failed}`
        )
        return
      }
      setToast(
        failed
          ? `已生成 ${completed} 张火柴人图，${failed} 张失败`
          : `已生成 ${completed} 张火柴人图`
      )
      setStickmanProgress(
        failed
          ? `已完成 ${completed}/${stickmanShots.length} · 失败 ${failed}`
          : ""
      )
    } catch (error) {
      setToast(error instanceof Error ? error.message : "生成火柴人图失败")
    } finally {
      stopStickmanGenerationRef.current = false
      setIsGeneratingStickmanImages(false)
    }
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
          : assetImportKind.includes("image")
            ? "image/png"
            : "video/mp4",
    })
    addVideoAsset(asset, `已导入任务素材：${asset.displayName}`)
    setAssetImportName("")
  }

  const removeVideoAsset = (assetId: string) => {
    setVideoAssets((current) => removeVideoAssetById(current, assetId))
    updateActiveTaskSnapshot((snapshot) => ({
      ...snapshot,
      assets: removeVideoAssetById(snapshot.assets, assetId),
    }))
    setToast("已移除任务素材记录")
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

    const voice = createVoicePlanFromScript({
      taskId: activeTask.id,
      script: analysisDraft.originalScript,
      durationPreset: selectedDuration,
      audioFilename: "voice.wav",
    })
    const visualAssets = videoAssets.filter((asset) =>
      ["stickman_image", "yanling_clip", "showcase_clip"].includes(asset.kind)
    )
    const storyboard = storyboardShots.map((shot, index) => ({
      id: shot.id,
      startMs: shot.startMs,
      endMs: shot.endMs,
      assetIds:
        shot.assetIds.length > 0
          ? shot.assetIds
          : [
              visualAssets[index % Math.max(visualAssets.length, 1)]?.id ||
                shot.id,
            ],
    }))
    const timeline = createUnifiedVideoTimeline({
      taskId: activeTask.id,
      voice,
      storyboard,
      bgmAssetId: videoAssets.find((asset) => asset.kind === "bgm")?.id,
      sfxAssetIds: videoAssets
        .filter((asset) => asset.kind === "sfx")
        .map((asset) => asset.id),
    })

    setVoicePlan(voice)
    setVideoTimeline(timeline)
    updateActiveTaskSnapshot((snapshot) => ({
      ...snapshot,
      voice,
      timeline,
      records: [
        ...snapshot.records,
        {
          id: `timeline_${Date.now()}`,
          at: new Date().toISOString(),
          kind: "timeline_assembled",
          message: `时间线已装配：${timeline.durationMs}ms · ${timeline.tracks.length} tracks · TTS timestamps 缺失时使用句子级 fallback timing`,
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

    const plan = createRenderExportPlan({
      taskId: activeTask.id,
      timeline: videoTimeline,
      requestedEngineId: requestedRenderEngine,
      engines: renderEngines,
    })
    const withoutPreviousRenderPlan = (assets: VideoAsset[]) =>
      assets.filter((asset) => !asset.tags?.includes("render_export_plan"))
    const desktopRenderer = window.promptCenterDesktop?.renderVideoWithFfmpeg
    const canUseBuiltInExport =
      plan.engineId === "ffmpeg" &&
      (plan.status === "ready" || plan.status === "fallback_ready") &&
      Boolean(desktopRenderer)
    const renderResult = canUseBuiltInExport
      ? await desktopRenderer?.({
          taskId: activeTask.id,
          timeline: videoTimeline,
          outputFilename: plan.output.file.filename,
        })
      : null
    const renderedOutput =
      renderResult?.ok && renderResult.filePath
        ? {
            ...plan.output,
            file: {
              ...plan.output.file,
              filename: renderResult.filename || plan.output.file.filename,
              path: renderResult.filePath,
              bytes: renderResult.bytes || 0,
              mimeType: renderResult.mimeType || "video/mp4",
            },
          }
        : plan.output
    const nextPlan: RenderExportPlan = {
      ...plan,
      output: renderedOutput,
      previewPath: renderedOutput.file.path,
      status: renderResult?.ok ? "exported" : plan.status,
      message: renderResult?.ok
        ? `FFmpeg 已导出真实 MP4：${renderedOutput.file.filename}`
        : renderResult?.error
          ? `FFmpeg 导出失败：${renderResult.error}`
          : desktopRenderer
            ? plan.message
            : `${plan.message} 当前浏览器环境仅生成导出计划，桌面端会执行 FFmpeg。`,
    }
    const isUsablePlan =
      nextPlan.status === "ready" ||
      nextPlan.status === "fallback_ready" ||
      nextPlan.status === "exported"
    setRenderPlan(nextPlan)

    if (isUsablePlan) {
      setVideoAssets((current) => [
        nextPlan.output,
        ...withoutPreviousRenderPlan(current),
      ])
    }

    updateActiveTaskSnapshot((snapshot) => ({
      ...snapshot,
      assets: isUsablePlan
        ? [nextPlan.output, ...withoutPreviousRenderPlan(snapshot.assets)]
        : snapshot.assets,
      records: [
        ...snapshot.records,
        {
          id: `render_${Date.now()}`,
          at: new Date().toISOString(),
          kind: "render_export_plan",
          message: `${nextPlan.message} 输出引用：${nextPlan.previewPath}`,
        },
      ],
    }))
    setToast(
      renderResult?.ok
        ? "已导出真实 MP4"
        : isUsablePlan
          ? "已生成导出计划和预览路径"
          : "当前没有可用渲染引擎"
    )
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
            <div className="rounded-lg border bg-background p-5">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold tracking-normal">
                    视频工厂任务
                  </h1>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    独立管理单条视频任务，按爆款来源、脚本、套餐、分镜、素材、配音、剪辑、发布和记录推进。
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

            <ScriptAnalysisPanel
              topic={analysisTopic}
              draft={analysisDraft}
              generating={isGeneratingAnalysis}
              onTopicChange={setAnalysisTopic}
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

            <StoryboardPanel
              selectedPackages={selectedPackages}
              selectedDuration={selectedDuration}
              shots={storyboardShots}
              onTogglePackage={togglePackage}
              onDurationChange={setSelectedDuration}
              onGenerateStoryboard={generateStoryboard}
              onUpdateShot={updateStoryboardShot}
            />

            <VideoAssetLibraryPanel
              assets={videoAssets}
              generatingStickman={isGeneratingStickmanImages}
              stickmanProgress={stickmanProgress}
              stickmanShotCount={stickmanShotCount}
              generatedStickmanShotCount={generatedStickmanShotCount}
              importKind={assetImportKind}
              importName={assetImportName}
              onGenerateStickman={generateStickmanAsset}
              onStopStickman={stopStickmanGeneration}
              onImportKindChange={setAssetImportKind}
              onImportNameChange={setAssetImportName}
              onImportAsset={importVideoAsset}
              onRemoveAsset={removeVideoAsset}
            />

            <TimelineAssemblyPanel
              voice={voicePlan}
              timeline={videoTimeline}
              storyboardCount={storyboardShots.length}
              assetCount={videoAssets.length}
              ttsSettings={ttsSettings}
              ttsStatus={ttsStatus}
              onAssembleTimeline={assembleTimeline}
              onSaveTtsSettings={saveTtsSettings}
              onCheckTtsSettings={checkTtsSettings}
            />

            <RenderExportPanel
              engines={renderEngines}
              requestedEngine={requestedRenderEngine}
              plan={renderPlan}
              hasTimeline={Boolean(videoTimeline?.tracks.length)}
              onEngineChange={setRequestedRenderEngine}
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

            <ApiProfilesPanel
              store={apiProfiles}
              onSaveProfile={saveApiProfile}
              onSelectProfile={selectApiProfile}
            />
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
  onTopicChange,
  onGenerateDraft,
  onScriptChange,
}: {
  topic: string
  draft: VideoAnalysisDraft | null
  generating: boolean
  onTopicChange: (value: string) => void
  onGenerateDraft: () => void
  onScriptChange: (value: string) => void
}) {
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
        <label className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            来源转写或手动主题
          </span>
          <textarea
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            className="min-h-24 rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={generating} onClick={onGenerateDraft}>
            <Sparkles className="size-4" />
            {generating ? "生成中" : "生成结构和脚本"}
          </Button>
          <span className="text-xs text-muted-foreground">
            使用当前文本模型 Profile；失败会保留手动编辑入口。
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
}: {
  selectedPackages: VideoPackageId[]
  selectedDuration: VideoDurationPreset
  shots: StoryboardShot[]
  onTogglePackage: (packageId: VideoPackageId) => void
  onDurationChange: (value: VideoDurationPreset) => void
  onGenerateStoryboard: () => void
  onUpdateShot: (shotId: string, patch: Partial<StoryboardShot>) => void
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
                  <span className="rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground">
                    {shot.visualType}
                  </span>
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
  generatingStickman,
  stickmanProgress,
  stickmanShotCount,
  generatedStickmanShotCount,
  importKind,
  importName,
  onGenerateStickman,
  onStopStickman,
  onImportKindChange,
  onImportNameChange,
  onImportAsset,
  onRemoveAsset,
}: {
  assets: VideoAsset[]
  generatingStickman: boolean
  stickmanProgress: string
  stickmanShotCount: number
  generatedStickmanShotCount: number
  importKind: VideoAssetKind
  importName: string
  onGenerateStickman: () => void | Promise<void>
  onStopStickman: () => void
  onImportKindChange: (value: VideoAssetKind) => void
  onImportNameChange: (value: string) => void
  onImportAsset: () => void
  onRemoveAsset: (assetId: string) => void
}) {
  const hasGeneratedStickman = generatedStickmanShotCount > 0
  const hasRemainingStickman =
    stickmanShotCount > 0 && generatedStickmanShotCount < stickmanShotCount

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
        <div className="flex flex-wrap items-end gap-3">
          <Button disabled={generatingStickman} onClick={onGenerateStickman}>
            <ImagePlus className="size-4" />
            {generatingStickman
              ? "生成中"
              : hasRemainingStickman && hasGeneratedStickman
                ? "继续未完成"
                : "生成火柴人图"}
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

        <div className="grid gap-2">
          {assets.length ? (
            assets.map((asset) => (
              <div
                key={asset.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-muted/30 p-3"
              >
                <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                  {asset.kind.includes("image") && asset.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={asset.previewUrl}
                      alt={asset.displayName}
                      className="size-14 rounded-md border object-cover"
                    />
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRemoveAsset(asset.id)}
                >
                  移除
                </Button>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              还没有任务素材。可先记录火柴人图，或导入炎灵录屏、成品展示、BGM、音效和封面。
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function TimelineAssemblyPanel({
  voice,
  timeline,
  storyboardCount,
  assetCount,
  ttsSettings,
  ttsStatus,
  onAssembleTimeline,
  onSaveTtsSettings,
  onCheckTtsSettings,
}: {
  voice: VoicePlan | null
  timeline: VideoTimeline | null
  storyboardCount: number
  assetCount: number
  ttsSettings: VideoTtsSettings
  ttsStatus: string
  onAssembleTimeline: () => void
  onSaveTtsSettings: (settings: VideoTtsSettings) => void
  onCheckTtsSettings: (settings?: VideoTtsSettings) => void
}) {
  const timelineSeconds = timeline ? Math.round(timeline.durationMs / 1000) : 0
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
          key={`${ttsSettings.projectPath}:${ttsSettings.launchCommand}:${ttsSettings.launchArgs.join("\u0000")}`}
          settings={ttsSettings}
          status={ttsStatus}
          onSave={onSaveTtsSettings}
          onCheck={onCheckTtsSettings}
        />

        <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
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
  status,
  onSave,
  onCheck,
}: {
  settings: VideoTtsSettings
  status: string
  onSave: (settings: VideoTtsSettings) => void
  onCheck: (settings?: VideoTtsSettings) => void
}) {
  const [draft, setDraft] = useState(settings)
  const launchPlan = createVideoTtsLaunchPlan(draft)

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">本地 TTS 路径</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            使用本机已安装的 IndexTTS2 工程；安装包只保存路径配置，不内置模型文件。
          </p>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_160px] gap-3 max-lg:grid-cols-1">
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
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => onSave(draft)}>
          <Save className="size-4" />
          保存 TTS 配置
        </Button>
        <Button variant="outline" onClick={() => onCheck(draft)}>
          <Search className="size-4" />
          检测路径
        </Button>
        <span className="text-xs text-muted-foreground">
          模型目录保持外置，后续生成配音时从该路径启动本地服务或导入音频。
        </span>
      </div>
      <div className="truncate rounded-md border bg-background px-2 py-1.5 font-mono text-xs text-muted-foreground">
        {launchPlan.manualCommand}
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
  onEngineChange,
  onPrepareExport,
}: {
  engines: RenderEngineOption[]
  requestedEngine: RenderEngineId
  plan: RenderExportPlan | null
  hasTimeline: boolean
  onEngineChange: (engine: RenderEngineId) => void
  onPrepareExport: () => void
}) {
  return (
    <section className="rounded-lg border bg-background p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">剪辑预览和导出</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            所有引擎都消费同一条 VideoTimeline；剪映不可用时可切到内置 FFmpeg
            兜底，DaVinci 未检测到时保持禁用。
          </p>
        </div>
        <Button disabled={!hasTimeline} onClick={onPrepareExport}>
          <FileVideo className="size-4" />
          准备导出
        </Button>
      </div>

      <div className="grid gap-4">
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
            先生成统一时间线，再准备渲染导出计划。
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
              <span className="text-muted-foreground">渲染命令</span>
              <span className="min-w-0 truncate font-mono">
                {plan.command || "等待可用引擎"}
              </span>
            </div>
            {plan.fallbackFrom ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                已从 {plan.fallbackFrom} 自动切换到 {plan.engineId}
                ；原引擎状态保留，任务素材和时间线未被改写。
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
            文本、图片、视频解析和发布辅助分别选择本机保存的用户 API。Key
            只用于请求，不写入任务日志或导出摘要。
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
