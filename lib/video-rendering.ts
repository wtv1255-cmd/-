import type { TaskFileRef, VideoAsset, VideoTimeline } from "@/lib/video-domain"

export type RenderEngineId = "jianying" | "ffmpeg" | "remotion" | "davinci"

export type RenderEngineStatus = "available" | "unavailable" | "disabled"

export type RenderEngineOption = {
  id: RenderEngineId
  label: string
  description: string
  status: RenderEngineStatus
  disabledReason?: string
}

export type CreateRenderEngineOptionsInput = {
  jianyingAvailable?: boolean
  ffmpegAvailable?: boolean
  remotionAvailable?: boolean
  davinciAvailable?: boolean
}

export type RenderExportPlanStatus =
  | "ready"
  | "exported"
  | "fallback_ready"
  | "blocked_no_timeline"
  | "blocked_no_engine"

export type JianyingDraftAction =
  | "overwrite_existing_draft"
  | "delete_old_materials"
  | "publish_or_upload"
  | "replace_manual_edits"

export type JianyingDraftPlanStatus =
  | "ready"
  | "created"
  | "needs_confirmation"
  | "blocked_no_timeline"

export type JianyingDraftDirectorClip = {
  id: string
  trackId: string
  type: string
  assetId: string
  startMs: number
  durationMs: number
  locked: boolean
  aiEditable: boolean
  placeholder: boolean
  replacementHint?: string
  transition?: string
  zoom?: "none" | "slow_in"
  emphasisSubtitle?: boolean
  text?: string
}

export type JianyingDraftPlan = {
  taskId: string
  status: JianyingDraftPlanStatus
  defaultOutputKind: "jianying_draft"
  mp4ExportDefault: false
  output: VideoAsset
  previewPath: string
  command: string
  message: string
  aiDirector: {
    trackOrder: string[]
    clips: JianyingDraftDirectorClip[]
  }
  requiredConfirmations: JianyingDraftAction[]
}

export type RenderExportPlan = {
  taskId: string
  engineId: RenderEngineId | null
  requestedEngineId: RenderEngineId
  fallbackFrom?: RenderEngineId
  status: RenderExportPlanStatus
  output: VideoAsset
  previewPath: string
  command: string
  message: string
}

export type CreateRenderExportPlanInput = {
  taskId: string
  timeline: VideoTimeline
  requestedEngineId: RenderEngineId
  engines: RenderEngineOption[]
}

export type CreateJianyingDraftPlanInput = {
  taskId: string
  timeline: VideoTimeline
  createdAt?: string
  lockedShotIds?: string[]
  lockedTrackIds?: string[]
  requestedActions?: JianyingDraftAction[]
  confirmedActions?: JianyingDraftAction[]
}

const engineDefinitions: Array<Omit<RenderEngineOption, "status">> = [
  {
    id: "jianying",
    label: "剪映优先",
    description: "生成剪映草稿并在可用环境中触发导出。",
  },
  {
    id: "ffmpeg",
    label: "内置 FFmpeg",
    description: "使用本机 FFmpeg 兜底导出 MP4。",
  },
  {
    id: "remotion",
    label: "内置 Remotion",
    description: "React/Remotion 渲染实验兜底。",
  },
  {
    id: "davinci",
    label: "DaVinci 实验",
    description: "检测到高级引擎授权和本机安装时才启用。",
  },
]

function availabilityFor(
  id: RenderEngineId,
  input: CreateRenderEngineOptionsInput
) {
  if (id === "jianying") return Boolean(input.jianyingAvailable)
  if (id === "ffmpeg") return input.ffmpegAvailable !== false
  if (id === "remotion") return Boolean(input.remotionAvailable)
  return Boolean(input.davinciAvailable)
}

function disabledReasonFor(id: RenderEngineId) {
  if (id === "jianying") return "未检测到可用剪映自动导出环境。"
  if (id === "ffmpeg") return "未检测到本机 FFmpeg。"
  if (id === "remotion") return "Remotion 渲染环境尚未启用。"
  return "未检测到 DaVinci 或未启用高级引擎。"
}

function outputFileRef(taskId: string, engineId: RenderEngineId): TaskFileRef {
  const filename = `${cleanSegment(taskId, "task")}-${engineId}.mp4`
  return {
    id: `rendered_video_${filename}`,
    taskId,
    kind: "rendered_video",
    filename,
    path: `%APPDATA%/她火/tasks/${cleanSegment(taskId, "task")}/rendered_video/${filename}`,
    bytes: 0,
    mimeType: "video/mp4",
    storage: "app_user_data_task_dir",
  }
}

function jianyingDraftFileRef(taskId: string, createdAt?: string): TaskFileRef {
  const safeTaskId = cleanSegment(taskId, "task")
  const timestamp = formatDraftTimestamp(createdAt)
  const filename = `${safeTaskId}-${timestamp}`

  return {
    id: `jianying_draft_${filename}`,
    taskId: safeTaskId,
    kind: "jianying_draft",
    filename,
    path: `%APPDATA%/她火/tasks/${safeTaskId}/jianying_drafts/${filename}`,
    bytes: 0,
    mimeType: "application/vnd.jianying.draft+json",
    storage: "app_user_data_task_dir",
  }
}

function cleanSegment(value: unknown, fallback: string) {
  const cleaned =
    typeof value === "string"
      ? value
          .trim()
          .replace(/[\\/:*?"<>|]+/g, "-")
          .replace(/\s+/g, "-")
      : ""
  return cleaned || fallback
}

function formatDraftTimestamp(createdAt?: string) {
  const date = createdAt ? new Date(createdAt) : new Date()
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  const pad = (value: number) => String(value).padStart(2, "0")

  return [
    safeDate.getUTCFullYear(),
    pad(safeDate.getUTCMonth() + 1),
    pad(safeDate.getUTCDate()),
    "-",
    pad(safeDate.getUTCHours()),
    pad(safeDate.getUTCMinutes()),
    pad(safeDate.getUTCSeconds()),
  ].join("")
}

function createOutputAsset(
  taskId: string,
  engineId: RenderEngineId
): VideoAsset {
  const file = outputFileRef(taskId, engineId)

  return {
    id: `render_${engineId}`,
    kind: "rendered_video",
    displayName: file.filename,
    file,
    tags: [engineId, "render_export_plan"],
  }
}

function createJianyingDraftAsset(taskId: string, createdAt?: string): VideoAsset {
  const file = jianyingDraftFileRef(taskId, createdAt)

  return {
    id: "jianying_draft",
    kind: "jianying_draft",
    displayName: file.filename,
    file,
    tags: ["jianying_draft", "editable_draft_plan"],
  }
}

function buildFfmpegCommand(outputPath: string) {
  return [
    "ffmpeg",
    "-y",
    "-hide_banner",
    "-f",
    "lavfi",
    "-i",
    '"color=c=black:s=1080x1920:r=30"',
    "-t",
    "1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    `"${outputPath}"`,
  ].join(" ")
}

function createDirectorClip({
  trackId,
  trackType,
  clip,
  lockedShotIds,
  lockedTrackIds,
}: {
  trackId: string
  trackType: string
  clip: VideoTimeline["tracks"][number]["clips"][number]
  lockedShotIds: Set<string>
  lockedTrackIds: Set<string>
}): JianyingDraftDirectorClip {
  const shotId = clip.id.replace(/_(visual|voice|subtitle)$/u, "")
  const locked = lockedTrackIds.has(trackId) || lockedShotIds.has(shotId)
  const placeholder =
    trackType === "visual" && clip.assetId.startsWith("placeholder_")

  return {
    id: clip.id,
    trackId,
    type: trackType,
    assetId: clip.assetId,
    startMs: Math.max(0, Math.floor(clip.startMs)),
    durationMs: Math.max(0, Math.floor(clip.durationMs)),
    locked,
    aiEditable: !locked,
    placeholder,
    replacementHint: placeholder
      ? "请在剪映中替换对应缺失素材，占位片段保留原分镜时间段。"
      : undefined,
    transition:
      trackType === "visual" ? (locked ? "locked" : "soft_cut") : undefined,
    zoom: trackType === "visual" && !locked ? "slow_in" : "none",
    emphasisSubtitle: trackType === "subtitle",
    text: clip.text,
  }
}

function createDirectorPlan({
  timeline,
  lockedShotIds = [],
  lockedTrackIds = [],
}: Pick<
  CreateJianyingDraftPlanInput,
  "timeline" | "lockedShotIds" | "lockedTrackIds"
>): JianyingDraftPlan["aiDirector"] {
  const lockedShots = new Set(lockedShotIds)
  const lockedTracks = new Set(lockedTrackIds)
  const orderedTracks = timeline.tracks.filter((track) => track.clips.length)

  return {
    trackOrder: orderedTracks.map((track) => track.id),
    clips: orderedTracks.flatMap((track) =>
      track.clips.map((clip) =>
        createDirectorClip({
          trackId: track.id,
          trackType: track.type,
          clip,
          lockedShotIds: lockedShots,
          lockedTrackIds: lockedTracks,
        })
      )
    ),
  }
}

function missingConfirmations({
  requestedActions = [],
  confirmedActions = [],
}: Pick<
  CreateJianyingDraftPlanInput,
  "requestedActions" | "confirmedActions"
>) {
  const confirmed = new Set(confirmedActions)

  return requestedActions.filter(
    (action) => action !== "publish_or_upload" && !confirmed.has(action)
  )
}

function commandFor(engineId: RenderEngineId, outputPath: string) {
  if (engineId === "ffmpeg") return buildFfmpegCommand(outputPath)
  if (engineId === "jianying") {
    return `python <JY_SKILL_ROOT>/scripts/auto_exporter.py "ta-huo-task" "${outputPath}" --res 1080 --fps 30`
  }
  if (engineId === "remotion") {
    return `npx remotion render TaHuoTimeline "${outputPath}"`
  }
  return `davinci-render --timeline ta-huo --output "${outputPath}"`
}

function findFallbackEngine(engines: RenderEngineOption[]) {
  return (
    engines.find(
      (engine) => engine.id === "ffmpeg" && engine.status === "available"
    ) ||
    engines.find(
      (engine) => engine.id === "remotion" && engine.status === "available"
    ) ||
    engines.find((engine) => engine.status === "available")
  )
}

export function createRenderEngineOptions(
  input: CreateRenderEngineOptionsInput = {}
): RenderEngineOption[] {
  return engineDefinitions.map((engine) => {
    const available = availabilityFor(engine.id, input)
    const disabled = engine.id === "davinci" && !available
    const status: RenderEngineStatus = available
      ? "available"
      : disabled
        ? "disabled"
        : "unavailable"

    return {
      ...engine,
      status,
      disabledReason: available ? undefined : disabledReasonFor(engine.id),
    }
  })
}

export function createJianyingDraftPlan({
  taskId,
  timeline,
  createdAt,
  lockedShotIds = [],
  lockedTrackIds = [],
  requestedActions = [],
  confirmedActions = [],
}: CreateJianyingDraftPlanInput): JianyingDraftPlan {
  const output = createJianyingDraftAsset(taskId, createdAt)
  const requiredConfirmations = missingConfirmations({
    requestedActions,
    confirmedActions,
  })
  const blockedNoTimeline = !timeline.tracks.length || timeline.durationMs <= 0
  const status: JianyingDraftPlanStatus = blockedNoTimeline
    ? "blocked_no_timeline"
    : requiredConfirmations.length
      ? "needs_confirmation"
      : "ready"

  return {
    taskId,
    status,
    defaultOutputKind: "jianying_draft",
    mp4ExportDefault: false,
    output,
    previewPath: output.file.path,
    command: `ta-huo-create-jianying-draft --task "${cleanSegment(
      taskId,
      "task"
    )}" --draft "${output.file.filename}"`,
    message:
      status === "blocked_no_timeline"
        ? "请先生成统一 VideoTimeline。"
        : status === "needs_confirmation"
          ? `需要用户确认：${requiredConfirmations.join("、")}`
          : "剪映可编辑草稿计划已准备，默认不会导出 MP4。",
    aiDirector: createDirectorPlan({
      timeline,
      lockedShotIds,
      lockedTrackIds,
    }),
    requiredConfirmations,
  }
}

export function createRenderExportPlan({
  taskId,
  timeline,
  requestedEngineId,
  engines,
}: CreateRenderExportPlanInput): RenderExportPlan {
  const requested = engines.find((engine) => engine.id === requestedEngineId)
  const selected =
    requested?.status === "available" ? requested : findFallbackEngine(engines)
  const engineId = selected?.id || null
  const output = createOutputAsset(taskId, engineId || requestedEngineId)
  const blockedNoTimeline = !timeline.tracks.length || timeline.durationMs <= 0
  const status: RenderExportPlanStatus = blockedNoTimeline
    ? "blocked_no_timeline"
    : engineId
      ? engineId === requestedEngineId
        ? "ready"
        : "fallback_ready"
      : "blocked_no_engine"

  return {
    taskId,
    engineId,
    requestedEngineId,
    fallbackFrom:
      engineId && engineId !== requestedEngineId
        ? requestedEngineId
        : undefined,
    status,
    output,
    previewPath: output.file.path,
    command: engineId ? commandFor(engineId, output.file.path) : "",
    message:
      status === "fallback_ready"
        ? `${requested?.label || requestedEngineId} 不可用，已切换到 ${selected?.label}。`
        : status === "ready"
          ? `${selected?.label} 已准备导出 MP4。`
          : status === "blocked_no_timeline"
            ? "请先生成统一 VideoTimeline。"
            : "没有可用渲染引擎。",
  }
}
