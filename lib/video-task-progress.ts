export type VideoTaskRunStage =
  | "source"
  | "script"
  | "storyboard"
  | "images"
  | "voice"
  | "subtitles"
  | "timeline"
  | "edit_decision"
  | "draft"
  | "quality_check"
  | "publish"

export type VideoTaskRunState =
  | "queued"
  | "running"
  | "success"
  | "retrying"
  | "fallback"
  | "warning"
  | "failed"
  | "needs_manual"
  | "artifact"

export type VideoTaskRunEvent = {
  id: string
  taskId: string
  at: string
  stage: VideoTaskRunStage
  state: VideoTaskRunState
  message: string
  current?: number
  total?: number
  progress?: number
  artifact?: {
    kind: string
    path: string
    label: string
  }
  error?: {
    code: string
    message: string
    retryable: boolean
  }
}

export type VideoTaskRunSummary = {
  taskId: string
  state: VideoTaskRunState
  stage: VideoTaskRunStage
  message: string
  progress: number
  current?: number
  total?: number
  successCount: number
  failureCount: number
  needsManual: boolean
  latestArtifact?: VideoTaskRunEvent["artifact"]
  updatedAt: string
}

export type CreateVideoTaskRunEventInput = Partial<VideoTaskRunEvent> &
  Pick<VideoTaskRunEvent, "taskId" | "stage" | "state" | "message">

export const MAX_VIDEO_TASK_RUN_EVENTS = 200

export const VIDEO_TASK_RUN_STAGE_WEIGHTS: Record<VideoTaskRunStage, number> = {
  source: 15,
  script: 15,
  storyboard: 15,
  images: 25,
  voice: 20,
  subtitles: 20,
  timeline: 10,
  edit_decision: 10,
  draft: 10,
  quality_check: 5,
  publish: 5,
}

const WEIGHTED_STAGE_ORDER: VideoTaskRunStage[] = [
  "source",
  "script",
  "storyboard",
  "images",
  "voice",
  "subtitles",
  "timeline",
  "edit_decision",
  "draft",
  "quality_check",
  "publish",
]

const SUMMARY_WEIGHTED_TOTAL = 100

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function clampCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : undefined
}

function sanitizeProgressText(value: unknown) {
  return String(value || "")
    .replace(
      /\b(api[-_ ]?key|authorization|token|secret|cookie|password)\b\s*[:=]\s*\S+/giu,
      "[已隐藏]"
    )
    .replace(/\s+/gu, " ")
    .trim()
}

function eventProgress(event: VideoTaskRunEvent) {
  if (typeof event.progress === "number") return clamp01(event.progress)
  if (typeof event.current === "number" && typeof event.total === "number") {
    return event.total > 0 ? clamp01(event.current / event.total) : 0
  }
  if (event.state === "success" || event.state === "artifact") return 1
  if (event.state === "failed" || event.state === "needs_manual") return 0
  if (event.state === "running") return 0.05
  return 0
}

function progressFromEvents(events: VideoTaskRunEvent[]) {
  const latestByStage = new Map<VideoTaskRunStage, VideoTaskRunEvent>()
  for (const event of events) {
    latestByStage.set(event.stage, event)
  }

  let weightedProgress = 0
  for (const stage of WEIGHTED_STAGE_ORDER) {
    const event = latestByStage.get(stage)
    if (!event) continue
    weightedProgress +=
      VIDEO_TASK_RUN_STAGE_WEIGHTS[stage] * eventProgress(event)
  }

  return clamp01(weightedProgress / SUMMARY_WEIGHTED_TOTAL)
}

export function createVideoTaskRunEvent(
  input: CreateVideoTaskRunEventInput
): VideoTaskRunEvent {
  const current = clampCount(input.current)
  const total = clampCount(input.total)
  const now = new Date().toISOString()

  return {
    id:
      typeof input.id === "string" && input.id
        ? input.id
        : `evt_${now.replace(/\D/gu, "").slice(0, 17)}_${Math.random()
            .toString(36)
            .slice(2, 7)}`,
    taskId: sanitizeProgressText(input.taskId) || "task",
    at: typeof input.at === "string" && input.at ? input.at : now,
    stage: input.stage,
    state: input.state,
    message: sanitizeProgressText(input.message),
    ...(current !== undefined ? { current } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(typeof input.progress === "number"
      ? { progress: clamp01(input.progress) }
      : {}),
    ...(input.artifact
      ? {
          artifact: {
            kind: sanitizeProgressText(input.artifact.kind),
            path: sanitizeProgressText(input.artifact.path),
            label: sanitizeProgressText(input.artifact.label),
          },
        }
      : {}),
    ...(input.error
      ? {
          error: {
            code: sanitizeProgressText(input.error.code),
            message: sanitizeProgressText(input.error.message),
            retryable: Boolean(input.error.retryable),
          },
        }
      : {}),
  }
}

export function appendVideoTaskRunEvent(
  events: VideoTaskRunEvent[],
  event: VideoTaskRunEvent
) {
  return [...events, event].slice(-MAX_VIDEO_TASK_RUN_EVENTS)
}

export function createVideoTaskRunSummary(
  events: VideoTaskRunEvent[]
): VideoTaskRunSummary {
  const latest = events.at(-1)
  const latestProgress = latest ? progressFromEvents(events) : 0
  const latestArtifact = [...events].reverse().find((event) => event.artifact)
    ?.artifact
  const latestWithCount = [...events]
    .reverse()
    .find((event) => event.current !== undefined || event.total !== undefined)

  return {
    taskId: latest?.taskId || "",
    state: latest?.state || "queued",
    stage: latest?.stage || "source",
    message: latest?.message || "暂无运行日志",
    progress: latestProgress,
    current: latestWithCount?.current,
    total: latestWithCount?.total,
    successCount: events.filter((event) => event.state === "success").length,
    failureCount: events.filter((event) => event.state === "failed").length,
    needsManual: events.some((event) => event.state === "needs_manual"),
    latestArtifact,
    updatedAt: latest?.at || new Date().toISOString(),
  }
}
