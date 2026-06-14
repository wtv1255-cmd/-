import type { VideoTaskStatus, VideoWorkflowStep } from "@/lib/video-task"

export type VideoSourceMode =
  | "keyword_search"
  | "douyin_link"
  | "local_upload"
  | "manual_text"
  | "history"

export type VideoPackageId =
  | "stickman_meme"
  | "tool_showcase"
  | "cinematic_showcase"

export type VideoDurationPreset = "30-45s" | "45-60s" | "60-90s" | "120s"

export type VideoAssetKind =
  | "source_video"
  | "stickman_image"
  | "yanling_clip"
  | "showcase_clip"
  | "cover_image"
  | "voice_audio"
  | "subtitle_file"
  | "bgm"
  | "sfx"
  | "rendered_video"

export type VideoVisualType =
  | "stickman"
  | "yanling_clip"
  | "showcase_clip"
  | "subtitle_emphasis"
  | "transition"

export type TaskFileRef = {
  id: string
  taskId: string
  kind: VideoAssetKind
  filename: string
  path: string
  bytes: number
  mimeType: string
  storage: "app_user_data_task_dir"
}

export type VideoSource = {
  mode: VideoSourceMode
  keyword?: string
  douyinUrl?: string
  userTopic?: string
  sourceVideo?: TaskFileRef
}

export type VideoPackagePlan = {
  packageIds: VideoPackageId[]
  durationPreset: VideoDurationPreset
}

export type StoryboardShot = {
  id: string
  startMs: number
  endMs: number
  voiceText: string
  visualType: VideoVisualType
  visualDescription: string
  prompt: string
  negativePrompt: string
  assetIds: string[]
  status: "draft" | "ready" | "needs_asset"
}

export type VideoAsset = {
  id: string
  kind: VideoAssetKind
  displayName: string
  file: TaskFileRef
  tags?: string[]
  durationMs?: number
  width?: number
  height?: number
}

export type VoiceSubtitleCue = {
  id: string
  startMs: number
  endMs: number
  text: string
}

export type VoicePlan = {
  text: string
  audio?: TaskFileRef
  subtitles: VoiceSubtitleCue[]
}

export type TimelineTrackType = "visual" | "voice" | "subtitle" | "bgm" | "sfx"

export type TimelineClip = {
  id: string
  assetId: string
  startMs: number
  durationMs: number
  trimStartMs?: number
  volume?: number
  text?: string
}

export type TimelineTrack = {
  id: string
  type: TimelineTrackType
  clips: TimelineClip[]
}

export type VideoTimeline = {
  taskId: string
  durationMs: number
  tracks: TimelineTrack[]
}

export type PublishTarget = {
  platform: "douyin"
  accountId: string
  displayName: string
  browserProfileId: string
  authorizedByUser: boolean
  title: string
  topics: string[]
  intro: string
  cover?: TaskFileRef
}

export type TaskRecord = {
  id: string
  at: string
  kind: string
  message: string
}

export type VideoTaskSnapshot = {
  id: string
  title: string
  status: VideoTaskStatus
  createdAt: string
  updatedAt: string
  workflow: VideoWorkflowStep[]
  source: VideoSource
  packagePlan: VideoPackagePlan
  storyboard: StoryboardShot[]
  assets: VideoAsset[]
  voice: VoicePlan
  timeline: VideoTimeline
  publish?: PublishTarget
  records: TaskRecord[]
}

export type CreateTaskFileRefInput = {
  taskId: string
  kind: VideoAssetKind
  filename: string
  bytes?: number
  mimeType?: string
}

export type CreateStoryboardShotInput = Partial<
  Pick<
    StoryboardShot,
    | "id"
    | "startMs"
    | "endMs"
    | "voiceText"
    | "visualType"
    | "visualDescription"
    | "prompt"
    | "negativePrompt"
    | "assetIds"
    | "status"
  >
>

export type CreateTimelineInput = VideoTimeline

export type CreatePublishTargetInput = {
  accountId: string
  displayName: string
  browserProfileId: string
  title: string
  topics: string[]
  intro: string
  cover?: TaskFileRef
}

export type CreateVideoTaskSnapshotInput = Partial<VideoTaskSnapshot> &
  Pick<VideoTaskSnapshot, "id" | "title">

export const VIDEO_TASK_INDEX_STORAGE_KEY = "ta-huo:video-factory:index-v1"
export const VIDEO_TASK_SNAPSHOT_STORAGE_PREFIX =
  "ta-huo:video-factory:snapshot:"
export const VIDEO_TASK_FILE_ROOT = "%APPDATA%/她火/tasks"

const credentialLikeFields = new Set([
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "cookie",
  "cookies",
  "authorization",
  "apiKey",
  "secret",
])

function nowIso() {
  return new Date().toISOString()
}

function cleanSegment(value: string, fallback: string) {
  const cleaned = value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .trim()
  return cleaned || fallback
}

function normalizeTitle(value: string) {
  return value.replace(/\s+/g, " ").trim() || "未命名视频任务"
}

export function createTaskFileRef(input: CreateTaskFileRefInput): TaskFileRef {
  const filename = cleanSegment(input.filename, "asset.bin")
  const taskId = cleanSegment(input.taskId, "task")
  return {
    id: `${input.kind}_${filename}`,
    taskId,
    kind: input.kind,
    filename,
    path: `${VIDEO_TASK_FILE_ROOT}/${taskId}/${input.kind}/${filename}`,
    bytes: Math.max(0, Math.floor(input.bytes || 0)),
    mimeType: input.mimeType || "application/octet-stream",
    storage: "app_user_data_task_dir",
  }
}

export function createStoryboardShot(
  input: CreateStoryboardShotInput = {}
): StoryboardShot {
  return {
    id: input.id || "shot_01",
    startMs: Math.max(0, Math.floor(input.startMs || 0)),
    endMs: Math.max(0, Math.floor(input.endMs || 0)),
    voiceText: input.voiceText || "",
    visualType: input.visualType || "stickman",
    visualDescription: input.visualDescription || "",
    prompt: input.prompt || "",
    negativePrompt: input.negativePrompt || "",
    assetIds: input.assetIds || [],
    status: input.status || "draft",
  }
}

export function createTimeline(input: CreateTimelineInput): VideoTimeline {
  return {
    taskId: input.taskId,
    durationMs: Math.max(0, Math.floor(input.durationMs)),
    tracks: input.tracks.map((track) => ({
      id: track.id,
      type: track.type,
      clips: track.clips.map((clip) => ({
        ...clip,
        startMs: Math.max(0, Math.floor(clip.startMs)),
        durationMs: Math.max(0, Math.floor(clip.durationMs)),
      })),
    })),
  }
}

export function createPublishTarget(
  input: CreatePublishTargetInput
): PublishTarget {
  return {
    platform: "douyin",
    accountId: input.accountId,
    displayName: input.displayName,
    browserProfileId: input.browserProfileId.trim(),
    authorizedByUser: true,
    title: normalizeTitle(input.title),
    topics: input.topics.map((item) => item.trim()).filter(Boolean),
    intro: input.intro.trim(),
    cover: input.cover,
  }
}

export function createVideoTaskSnapshot(
  input: CreateVideoTaskSnapshotInput
): VideoTaskSnapshot {
  const at = nowIso()
  return {
    id: input.id,
    title: normalizeTitle(input.title),
    status: input.status || "draft",
    createdAt: input.createdAt || at,
    updatedAt: input.updatedAt || at,
    workflow: input.workflow || [],
    source: input.source || { mode: "manual_text" },
    packagePlan: input.packagePlan || {
      packageIds: ["stickman_meme"],
      durationPreset: "45-60s",
    },
    storyboard: input.storyboard || [],
    assets: input.assets || [],
    voice: input.voice || { text: "", subtitles: [] },
    timeline: input.timeline || {
      taskId: input.id,
      durationMs: 0,
      tracks: [],
    },
    publish: input.publish,
    records: input.records || [],
  }
}

export function serializeVideoTaskSnapshot(snapshot: unknown) {
  return JSON.stringify(snapshot, (key, value) => {
    if (credentialLikeFields.has(key)) return undefined
    if (key === "blob" || key === "dataUrl" || key === "arrayBuffer") {
      return undefined
    }
    return value
  })
}

export function saveVideoTaskSnapshot(
  snapshot: VideoTaskSnapshot,
  storage: Storage = window.localStorage
) {
  storage.setItem(
    `${VIDEO_TASK_SNAPSHOT_STORAGE_PREFIX}${snapshot.id}`,
    serializeVideoTaskSnapshot(snapshot)
  )
}

export function readVideoTaskSnapshot(
  taskId: string,
  storage: Storage = window.localStorage
) {
  const raw = storage.getItem(`${VIDEO_TASK_SNAPSHOT_STORAGE_PREFIX}${taskId}`)
  if (!raw) return null
  return createVideoTaskSnapshot(JSON.parse(raw) as VideoTaskSnapshot)
}
