"use client"

import { useEffect, useState } from "react"
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
  buildVideoImageGenerationRequest,
  createImportedVideoAsset,
  createVideoAssetLogEntry,
  removeVideoAssetById,
} from "@/lib/video-assets"
import {
  buildScriptGenerationRequest,
  createManualVideoAnalysisDraft,
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
  const [voicePlan, setVoicePlan] = useState<VoicePlan | null>(null)
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
        setStoryboardShots([])
        setVideoAssets([])
        setVoicePlan(null)
        setVideoTimeline(null)
        setRenderPlan(null)
        return
      }
      const snapshot = readVideoTaskSnapshot(activeTask.id)
      setStoryboardShots(snapshot?.storyboard || [])
      setVideoAssets(snapshot?.assets || [])
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
  }, [activeTask?.id, requestedRenderEngine])

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

  const generateAnalysisDraft = () => {
    const request = buildScriptGenerationRequest({
      profile: buildApiProfileRequestContext(apiProfiles, "text_model"),
      sourceText: analysisTopic,
      durationPreset: "45-60s",
      packageId: "stickman_meme",
    })
    const logEntry = createScriptGenerationLogEntry(request)
    const draft = request.apiKey
      ? createManualVideoAnalysisDraft({
          topic: analysisTopic,
          packageId: "stickman_meme",
          durationPreset: "45-60s",
        })
      : createScriptGenerationFailureDraft({
          sourceText: analysisTopic,
          reason: "文本模型 Profile 尚未配置 API Key，已切换到手动编辑。",
        })

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
    setToast("已生成可编辑脚本草稿")
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

  const generateStickmanAsset = () => {
    const shot = storyboardShots.find((item) => item.visualType === "stickman")
    if (!activeTask || !shot) {
      setToast("请先生成火柴人分镜")
      return
    }
    const request = buildVideoImageGenerationRequest({
      profile: buildApiProfileRequestContext(apiProfiles, "image_generation"),
      prompt: shot.prompt,
      negativePrompt: shot.negativePrompt,
    })
    const logEntry = createVideoAssetLogEntry(request)
    const asset = createImportedVideoAsset({
      taskId: activeTask.id,
      kind: "stickman_image",
      filename: `${shot.id}-stickman.png`,
      mimeType: "image/png",
      tags: [shot.id, logEntry.profileId],
    })
    addVideoAsset(
      asset,
      `火柴人图任务已记录：${shot.id} · ${logEntry.profileId} · ${logEntry.promptLength} 字符`
    )
    setToast("已记录火柴人图资产")
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

  const prepareRenderExport = () => {
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
    setRenderPlan(plan)

    const isUsablePlan =
      plan.status === "ready" || plan.status === "fallback_ready"
    const withoutPreviousRenderPlan = (assets: VideoAsset[]) =>
      assets.filter((asset) => !asset.tags?.includes("render_export_plan"))

    if (isUsablePlan) {
      setVideoAssets((current) => [
        plan.output,
        ...withoutPreviousRenderPlan(current),
      ])
    }

    updateActiveTaskSnapshot((snapshot) => ({
      ...snapshot,
      assets: isUsablePlan
        ? [plan.output, ...withoutPreviousRenderPlan(snapshot.assets)]
        : snapshot.assets,
      records: [
        ...snapshot.records,
        {
          id: `render_${Date.now()}`,
          at: new Date().toISOString(),
          kind: "render_export_plan",
          message: `${plan.message} 输出引用：${plan.previewPath}`,
        },
      ],
    }))
    setToast(isUsablePlan ? "已生成导出计划和预览路径" : "当前没有可用渲染引擎")
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
                <Button onClick={createTask}>
                  <Sparkles className="size-4" />
                  新建任务
                </Button>
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
              onTopicChange={setAnalysisTopic}
              onGenerateDraft={generateAnalysisDraft}
              onScriptChange={(value) =>
                setAnalysisDraft((current) =>
                  current ? { ...current, originalScript: value } : current
                )
              }
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
              importKind={assetImportKind}
              importName={assetImportName}
              onGenerateStickman={generateStickmanAsset}
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
              onAssembleTimeline={assembleTimeline}
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
  onTopicChange,
  onGenerateDraft,
  onScriptChange,
}: {
  topic: string
  draft: VideoAnalysisDraft | null
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
          <Button onClick={onGenerateDraft}>
            <Sparkles className="size-4" />
            生成结构和脚本
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
  importKind,
  importName,
  onGenerateStickman,
  onImportKindChange,
  onImportNameChange,
  onImportAsset,
  onRemoveAsset,
}: {
  assets: VideoAsset[]
  importKind: VideoAssetKind
  importName: string
  onGenerateStickman: () => void
  onImportKindChange: (value: VideoAssetKind) => void
  onImportNameChange: (value: string) => void
  onImportAsset: () => void
  onRemoveAsset: (assetId: string) => void
}) {
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
          <Button onClick={onGenerateStickman}>
            <ImagePlus className="size-4" />
            记录火柴人图
          </Button>
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
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {asset.displayName}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {asset.kind} · {asset.file.path}
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
  onAssembleTimeline,
}: {
  voice: VoicePlan | null
  timeline: VideoTimeline | null
  storyboardCount: number
  assetCount: number
  onAssembleTimeline: () => void
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
