import type { ApiProfileRequestContext } from "@/lib/api-profiles"
import type { CopywritingBoardId } from "@/lib/video-analysis"
import type {
  StoryboardShot,
  TaskFileRef,
  VideoAsset,
  VideoTimeline,
} from "@/lib/video-domain"

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
  zoom?: "none" | "slow_in" | "slow_out" | "fast_in"
  emphasisSubtitle?: boolean
  text?: string
}

export type JianyingDraftMaterialAsset = Pick<
  VideoAsset,
  | "id"
  | "kind"
  | "displayName"
  | "file"
  | "tags"
  | "durationMs"
  | "width"
  | "height"
>

export type JianyingDraftBrandOverlay = {
  id: string
  labelId: "doubao_icon" | "yanling_icon" | "jianying_icon"
  label: string
  assetId?: string
  status: "ready" | "placeholder"
  required: false
  replacementHint: string
  tags: string[]
}

export type JianyingDraftPlan = {
  taskId: string
  status: JianyingDraftPlanStatus
  defaultOutputKind: "jianying_draft"
  mp4ExportDefault: false
  canvas: {
    aspectRatio: "9:16" | "16:9" | "1:1"
    width: number
    height: number
  }
  output: VideoAsset
  previewPath: string
  command: string
  message: string
  aiDirector: {
    trackOrder: string[]
    clips: JianyingDraftDirectorClip[]
  }
  materialAssets: JianyingDraftMaterialAsset[]
  brandOverlays: JianyingDraftBrandOverlay[]
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
  canvasAspectRatio?: JianyingDraftPlan["canvas"]["aspectRatio"]
  createdAt?: string
  lockedShotIds?: string[]
  lockedTrackIds?: string[]
  requestedActions?: JianyingDraftAction[]
  confirmedActions?: JianyingDraftAction[]
  aiDirectorPlan?: JianyingDraftPlan["aiDirector"]
  materialAssets?: JianyingDraftMaterialAsset[]
  copywritingBoard?: CopywritingBoardId
}

export type CreateImageAssetsDraftTimelineInput = {
  taskId: string
  shots: Array<
    Pick<
      StoryboardShot,
      "id" | "startMs" | "endMs" | "visualType" | "assetIds"
    >
  >
  assets: Array<Pick<VideoAsset, "id" | "kind" | "tags">>
  clipDurationMs?: number
}

export type AiDirectorGenerationRequest = {
  endpoint: "/api/codex/chat/completions"
  body: {
    model: string
    messages: Array<{ role: "system" | "user"; content: string }>
    temperature: number
    apiBaseUrl: string
    apiKey: string
    profileId: string
  }
  logEntry: {
    kind: "ai_director_generation_request"
    profileId: string
    apiBaseUrl: string
    model: string
    timelineClipCount: number
    apiKey?: never
  }
}

export type BuildAiDirectorGenerationRequestInput = {
  profile: ApiProfileRequestContext
  script: string
  timeline: VideoTimeline
  fallbackPlan: JianyingDraftPlan["aiDirector"]
  brandOverlays?: JianyingDraftBrandOverlay[]
  model?: string
}

export type CreateModelAiDirectorPlanInput = {
  fallbackPlan: JianyingDraftPlan["aiDirector"]
  modelText: string
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

function cleanText(value: unknown, fallback = "") {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
  return text || fallback
}

function extractShotId(...values: unknown[]) {
  for (const value of values) {
    const match = String(value || "").match(/shot[_-]?(\d+)/iu)
    if (match?.[1]) return `shot_${match[1].padStart(2, "0")}`
  }
  return ""
}

function normalizeAssetKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/_\d{8,}$/u, "") || ""
}

function isVisualDirectorClip(clip: JianyingDraftDirectorClip) {
  return clip.type === "visual" || clip.trackId === "visual"
}

function resolveMaterialAssetForDirectorClip(
  clip: JianyingDraftDirectorClip,
  materialAssets: JianyingDraftMaterialAsset[]
) {
  const exact = materialAssets.find((asset) => asset.id === clip.assetId)
  if (exact) return exact
  if (!isVisualDirectorClip(clip)) return undefined

  const shotId = extractShotId(clip.id, clip.assetId)
  if (shotId) {
    const taggedAsset = materialAssets.find(
      (asset) =>
        asset.kind === "stickman_image" &&
        asset.tags?.includes("generated_image") &&
        asset.tags?.includes(shotId)
    )
    if (taggedAsset) return taggedAsset
  }

  const clipKey = normalizeAssetKey(clip.assetId)
  if (!clipKey) return undefined

  return materialAssets.find((asset) => {
    if (asset.kind !== "stickman_image") return false
    const keys = [
      normalizeAssetKey(asset.id),
      normalizeAssetKey(asset.displayName),
      normalizeAssetKey(asset.file?.filename),
    ].filter(Boolean)
    return keys.some((key) => clipKey === key || clipKey.endsWith(key))
  })
}

function reconcileDirectorMaterialRefs(
  aiDirector: JianyingDraftPlan["aiDirector"],
  materialAssets: JianyingDraftMaterialAsset[]
): JianyingDraftPlan["aiDirector"] {
  if (!materialAssets.length) return aiDirector

  return {
    ...aiDirector,
    clips: aiDirector.clips.map((clip) => {
      const asset = resolveMaterialAssetForDirectorClip(clip, materialAssets)
      return asset && asset.id !== clip.assetId
        ? { ...clip, assetId: asset.id }
        : clip
    }),
  }
}

const productBrandOverlayLabels: Array<
  Pick<JianyingDraftBrandOverlay, "labelId" | "label">
> = [
  { labelId: "doubao_icon", label: "豆包图标" },
  { labelId: "yanling_icon", label: "燕翎图标" },
  { labelId: "jianying_icon", label: "剪映图标" },
]

function resolveDraftCanvas(
  aspectRatio: CreateJianyingDraftPlanInput["canvasAspectRatio"] = "9:16"
): JianyingDraftPlan["canvas"] {
  if (aspectRatio === "16:9") {
    return { aspectRatio, width: 1920, height: 1080 }
  }
  if (aspectRatio === "1:1") {
    return { aspectRatio, width: 1080, height: 1080 }
  }
  return { aspectRatio: "9:16", width: 1080, height: 1920 }
}

function createBrandOverlays({
  copywritingBoard,
  materialAssets,
}: Pick<
  CreateJianyingDraftPlanInput,
  "copywritingBoard" | "materialAssets"
>): JianyingDraftBrandOverlay[] {
  if (copywritingBoard !== "product_conversion") return []

  return productBrandOverlayLabels.map(({ labelId, label }) => {
    const asset = materialAssets?.find(
      (candidate) =>
        candidate.kind === "brand_sticker" &&
        candidate.tags?.includes(labelId)
    )
    const tags = asset?.tags?.length ? asset.tags : [labelId]

    if (asset) {
      return {
        id: `brand_overlay_${labelId}`,
        labelId,
        label,
        assetId: asset.id,
        status: "ready",
        required: false,
        replacementHint: `使用已导入素材 ${asset.displayName || label} 作为手动品牌贴片。`,
        tags,
      }
    }

    return {
      id: `brand_overlay_${labelId}_placeholder`,
      labelId,
      label,
      status: "placeholder",
      required: false,
      replacementHint: `可在剪映中手动补充${label}贴片，缺失不阻塞草稿。`,
      tags: [labelId],
    }
  })
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

function findShotImageAssetId(
  shot: CreateImageAssetsDraftTimelineInput["shots"][number],
  assets: CreateImageAssetsDraftTimelineInput["assets"]
) {
  const generatedAsset = assets.find(
    (asset) =>
      asset.kind === "stickman_image" &&
      asset.tags?.includes("generated_image") &&
      asset.tags?.includes(shot.id)
  )
  if (generatedAsset) return generatedAsset.id

  return shot.assetIds.find((assetId) =>
    assets.some((asset) => asset.id === assetId && asset.kind === "stickman_image")
  )
}

export function createImageAssetsDraftTimeline({
  taskId,
  shots,
  assets,
  clipDurationMs = 2000,
}: CreateImageAssetsDraftTimelineInput): VideoTimeline {
  const clips = shots
    .filter((shot) => shot.visualType === "stickman")
    .map((shot, index) => {
      const assetId = findShotImageAssetId(shot, assets)
      if (!assetId) return null

      const originalDuration = Math.max(0, shot.endMs - shot.startMs)
      const durationMs = originalDuration || Math.max(1000, clipDurationMs)
      const startMs =
        originalDuration > 0
          ? Math.max(0, shot.startMs)
          : index * Math.max(1000, clipDurationMs)

      return {
        id: `${shot.id}_visual`,
        assetId,
        startMs,
        durationMs,
      }
    })
    .filter((clip): clip is NonNullable<typeof clip> => Boolean(clip))

  return {
    taskId,
    durationMs: clips.reduce(
      (maxMs, clip) => Math.max(maxMs, clip.startMs + clip.durationMs),
      0
    ),
    tracks: clips.length
      ? [
          {
            id: "visual",
            type: "visual",
            clips,
          },
        ]
      : [],
  }
}

function parseModelJson(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/iu)
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim())
      } catch {}
    }
    const start = trimmed.indexOf("{")
    const end = trimmed.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1))
      } catch {}
    }
  }
  return null
}

function normalizeModelZoom(value: unknown, fallback: JianyingDraftDirectorClip["zoom"]) {
  return value === "none" ||
    value === "slow_in" ||
    value === "slow_out" ||
    value === "fast_in"
    ? value
    : fallback
}

function normalizeModelTransition(value: unknown, fallback?: string) {
  return cleanText(value, fallback || "soft_cut")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 48)
}

export function createModelAiDirectorPlan({
  fallbackPlan,
  modelText,
}: CreateModelAiDirectorPlanInput): JianyingDraftPlan["aiDirector"] {
  const parsed = parseModelJson(modelText)
  if (!parsed || typeof parsed !== "object") return fallbackPlan

  const rawClips = Array.isArray((parsed as { clips?: unknown }).clips)
    ? ((parsed as { clips: unknown[] }).clips)
    : []
  const modelClipById = new Map(
    rawClips
      .filter((clip): clip is Record<string, unknown> =>
        Boolean(clip && typeof clip === "object" && typeof (clip as { id?: unknown }).id === "string")
      )
      .map((clip) => [String(clip.id), clip])
  )
  const fallbackTrackIds = new Set(fallbackPlan.trackOrder)
  const requestedTrackOrder = Array.isArray(
    (parsed as { trackOrder?: unknown }).trackOrder
  )
    ? (parsed as { trackOrder: unknown[] }).trackOrder
        .map((track) => cleanSegment(track, ""))
        .filter((track) => fallbackTrackIds.has(track))
    : []

  return {
    trackOrder: requestedTrackOrder.length
      ? requestedTrackOrder
      : fallbackPlan.trackOrder,
    clips: fallbackPlan.clips.map((clip) => {
      const modelClip = modelClipById.get(clip.id)
      if (!modelClip || clip.locked) return clip

      return {
        ...clip,
        transition:
          clip.type === "visual"
            ? normalizeModelTransition(modelClip.transition, clip.transition)
            : clip.transition,
        zoom:
          clip.type === "visual"
            ? normalizeModelZoom(modelClip.zoom, clip.zoom)
            : clip.zoom,
        replacementHint: cleanText(
          modelClip.replacementHint,
          clip.replacementHint
        ),
        emphasisSubtitle:
          typeof modelClip.emphasisSubtitle === "boolean"
            ? modelClip.emphasisSubtitle
            : clip.emphasisSubtitle,
        text: cleanText(modelClip.text, clip.text),
      }
    }),
  }
}

export function buildAiDirectorGenerationRequest({
  profile,
  script,
  timeline,
  fallbackPlan,
  brandOverlays = [],
  model = profile.model,
}: BuildAiDirectorGenerationRequestInput): AiDirectorGenerationRequest {
  const clipCount = timeline.tracks.reduce(
    (sum, track) => sum + track.clips.length,
    0
  )
  return {
    endpoint: "/api/codex/chat/completions",
    body: {
      model: cleanText(model, "edit-director-default"),
      temperature: 0.25,
      apiBaseUrl: profile.apiBaseUrl,
      apiKey: profile.apiKey,
      profileId: profile.profileId,
      messages: [
        {
          role: "system",
          content:
            "你是短视频 AI 精剪/剪辑决策模型。只返回 JSON，不要 Markdown。根据脚本、VideoTimeline 和已有草稿方案，决定每个可编辑 clip 的 transition、zoom、replacementHint、emphasisSubtitle、text。不得修改 locked=true 的片段。若提供 brandOverlays，只能引用已有贴片素材或手动贴片意图，不得要求图像模型生成 logo、图标或品牌标识。",
        },
        {
          role: "user",
          content: JSON.stringify({
            script: cleanText(script),
            VideoTimeline: timeline,
            fallbackAiDirector: fallbackPlan,
            brandOverlays,
            outputSchema: {
              trackOrder: ["visual", "subtitle", "voice"],
              clips: [
                {
                  id: "clip id from fallbackAiDirector",
                  transition: "soft_cut | match_cut | flash_cut | locked",
                  zoom: "none | slow_in | slow_out | fast_in",
                  replacementHint: "manual replacement instruction",
                  emphasisSubtitle: true,
                  text: "optional subtitle rewrite",
                },
              ],
            },
          }),
        },
      ],
    },
    logEntry: {
      kind: "ai_director_generation_request",
      profileId: profile.profileId,
      apiBaseUrl: profile.apiBaseUrl,
      model: cleanText(model, "edit-director-default"),
      timelineClipCount: clipCount,
    },
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
  canvasAspectRatio = "9:16",
  createdAt,
  lockedShotIds = [],
  lockedTrackIds = [],
  requestedActions = [],
  confirmedActions = [],
  aiDirectorPlan,
  materialAssets = [],
  copywritingBoard = "generic_rewrite",
}: CreateJianyingDraftPlanInput): JianyingDraftPlan {
  const output = createJianyingDraftAsset(taskId, createdAt)
  const canvas = resolveDraftCanvas(canvasAspectRatio)
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
  const brandOverlays = createBrandOverlays({
    copywritingBoard,
    materialAssets,
  })

  return {
    taskId,
    status,
    defaultOutputKind: "jianying_draft",
    mp4ExportDefault: false,
    canvas,
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
    aiDirector: reconcileDirectorMaterialRefs(
      aiDirectorPlan ||
        createDirectorPlan({
          timeline,
          lockedShotIds,
          lockedTrackIds,
        }),
      materialAssets
    ),
    materialAssets,
    brandOverlays,
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
