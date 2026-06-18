export type VideoWorkflowStepId =
  | "source"
  | "script"
  | "package"
  | "storyboard"
  | "assets"
  | "voice"
  | "edit"
  | "publish"
  | "record"

export type VideoWorkflowStepState = "active" | "queued" | "locked" | "done"

export type VideoWorkflowStep = {
  id: VideoWorkflowStepId
  title: string
  description: string
  state: VideoWorkflowStepState
}

export type VideoTaskStatus = "draft" | "in_progress" | "paused" | "exported"

export type VideoProductionStepState =
  | "waiting"
  | "running"
  | "success"
  | "failed"
  | "skipped"
  | "needs_manual"

export type VideoProductionStepId =
  | "source"
  | "script"
  | "storyboard"
  | "images"
  | "tts"
  | "subtitles"
  | "timeline"
  | "draft"
  | "publish"
  | "upload"
  | "delete"
  | "overwrite"
  | "manual_edit_replace"

export type VideoProductionStep = {
  id: VideoProductionStepId
  state: VideoProductionStepState
  reason?: string
  assetIds: string[]
  shouldRegenerate: boolean
}

export type VideoRecoverySnapshot = {
  taskId: string
  steps: VideoProductionStep[]
}

export type CreateVideoRecoveryStepInput = Partial<
  Pick<VideoProductionStep, "state" | "reason" | "assetIds">
> & {
  id: VideoProductionStepId
}

export type CreateVideoRecoverySnapshotInput = {
  taskId: string
  steps?: CreateVideoRecoveryStepInput[]
}

export type PlanVideoTaskRecoveryInput = {
  hasApiBackup: boolean
  localTtsAvailable: boolean
}

export type VideoTaskRecoveryPlan = {
  taskId: string
  taskStatus: VideoTaskStatus
  steps: VideoProductionStep[]
  autoResumeStepIds: VideoProductionStepId[]
  manualStepIds: VideoProductionStepId[]
  preservedAssetIds: string[]
  pauseReasons: string[]
  requiresUserConfirmation: boolean
}

export type VideoTask = {
  id: string
  title: string
  status: VideoTaskStatus
  createdAt: string
  updatedAt: string
  workflow: VideoWorkflowStep[]
  snapshotKey?: string
}

export type CreateVideoTaskInput = {
  title?: string
  now?: string
}

export const VIDEO_TASKS_STORAGE_KEY = "ta-huo:video-factory:tasks-v1"

export const VIDEO_WORKFLOW_STEPS: ReadonlyArray<
  Omit<VideoWorkflowStep, "state">
> = [
  {
    id: "source",
    title: "爆款来源",
    description: "关键词搜索、抖音链接、本地视频或手动主题。",
  },
  {
    id: "script",
    title: "脚本生成",
    description: "结构分析、原创改写和可编辑完整文案。",
  },
  {
    id: "package",
    title: "套餐和时长",
    description: "三类套餐、四档时长和素材密度选择。",
  },
  {
    id: "storyboard",
    title: "分镜和提示词",
    description: "分镜时间、画面说明和火柴人图片提示词。",
  },
  {
    id: "assets",
    title: "素材生成和素材库",
    description: "火柴人图、炎灵素材、成品展示、BGM 和音效。",
  },
  {
    id: "voice",
    title: "配音和字幕",
    description: "配音文本、音频、字幕和句子级时间轴。",
  },
  {
    id: "edit",
    title: "剪辑预览和导出",
    description: "统一时间轴、剪映优先和内置渲染兜底。",
  },
  {
    id: "publish",
    title: "发布确认",
    description: "标题、话题、简介、封面和授权账号确认。",
  },
  {
    id: "record",
    title: "任务记录",
    description: "状态、产物路径、人工处理和发布记录。",
  },
]

const safeAutoResumeSteps = new Set<VideoProductionStepId>([
  "images",
  "tts",
  "subtitles",
  "timeline",
  "draft",
])

const destructiveOrPublishSteps = new Set<VideoProductionStepId>([
  "publish",
  "upload",
  "delete",
  "overwrite",
  "manual_edit_replace",
])

function nowIso(now?: string) {
  return now || new Date().toISOString()
}

function normalizeTitle(title?: string) {
  const trimmed = title?.replace(/\s+/g, " ").trim()
  return trimmed || "未命名视频任务"
}

function createWorkflow(): VideoWorkflowStep[] {
  return VIDEO_WORKFLOW_STEPS.map((step, index) => ({
    ...step,
    state: index === 0 ? "active" : "locked",
  }))
}

function normalizeProductionStep(input: CreateVideoRecoveryStepInput): VideoProductionStep {
  const state: VideoProductionStepState =
    input.state === "running" ||
    input.state === "success" ||
    input.state === "failed" ||
    input.state === "skipped" ||
    input.state === "needs_manual"
      ? input.state
      : "waiting"

  return {
    id: input.id,
    state,
    reason: input.reason,
    assetIds: Array.isArray(input.assetIds)
      ? input.assetIds.filter(
          (assetId: unknown): assetId is string => typeof assetId === "string"
        )
      : [],
    shouldRegenerate: false,
  }
}

function shouldPauseForUnavailableDependency(
  step: VideoProductionStep,
  input: PlanVideoTaskRecoveryInput
) {
  if (step.id === "images" && step.state === "failed" && !input.hasApiBackup) {
    return "images:no_api_backup"
  }
  if (step.id === "tts" && step.state === "failed" && !input.localTtsAvailable) {
    return "tts:local_tts_unavailable"
  }
  return ""
}

function shouldAutoResume(step: VideoProductionStep) {
  return (
    safeAutoResumeSteps.has(step.id) &&
    (step.state === "failed" ||
      step.state === "waiting" ||
      step.state === "running")
  )
}

export function createVideoRecoverySnapshot({
  taskId,
  steps = [],
}: CreateVideoRecoverySnapshotInput): VideoRecoverySnapshot {
  return {
    taskId: taskId || "task",
    steps: steps.map(normalizeProductionStep),
  }
}

export function planVideoTaskRecovery(
  snapshot: VideoRecoverySnapshot,
  input: PlanVideoTaskRecoveryInput
): VideoTaskRecoveryPlan {
  const pauseReasons: string[] = []
  const autoResumeStepIds: VideoProductionStepId[] = []
  const manualStepIds: VideoProductionStepId[] = []
  const preservedAssetIds: string[] = []
  const steps = snapshot.steps.map((step) => {
    const dependencyPause = shouldPauseForUnavailableDependency(step, input)
    const manual = destructiveOrPublishSteps.has(step.id)

    if (step.state === "success") {
      preservedAssetIds.push(...step.assetIds)
    }
    if (manual) {
      manualStepIds.push(step.id)
      return { ...step, state: "needs_manual" as const }
    }
    if (dependencyPause) {
      pauseReasons.push(dependencyPause)
      return { ...step, state: "failed" as const }
    }
    if (shouldAutoResume(step)) {
      autoResumeStepIds.push(step.id)
      return { ...step, state: "waiting" as const }
    }

    return step
  })
  const requiresUserConfirmation = manualStepIds.length > 0

  return {
    taskId: snapshot.taskId,
    taskStatus:
      pauseReasons.length || requiresUserConfirmation ? "paused" : "in_progress",
    steps,
    autoResumeStepIds,
    manualStepIds,
    preservedAssetIds: Array.from(new Set(preservedAssetIds)),
    pauseReasons,
    requiresUserConfirmation,
  }
}

export function createVideoTask(input: CreateVideoTaskInput = {}): VideoTask {
  const at = nowIso(input.now)
  return {
    id: `video_${at.replace(/[-:.TZ]/g, "")}`,
    title: normalizeTitle(input.title),
    status: "draft",
    createdAt: at,
    updatedAt: at,
    workflow: createWorkflow(),
    snapshotKey: `snapshot:${`video_${at.replace(/[-:.TZ]/g, "")}`}`,
  }
}

export function sanitizeVideoTask(task: VideoTask): VideoTask {
  return {
    id: String(task.id || `video_${Date.now()}`),
    title: normalizeTitle(task.title),
    status:
      task.status === "in_progress" ||
      task.status === "paused" ||
      task.status === "exported"
        ? task.status
        : "draft",
    createdAt: task.createdAt || nowIso(),
    updatedAt: task.updatedAt || task.createdAt || nowIso(),
    snapshotKey: task.snapshotKey || `snapshot:${task.id}`,
    workflow:
      Array.isArray(task.workflow) && task.workflow.length === 9
        ? task.workflow.map((step, index) => ({
            ...VIDEO_WORKFLOW_STEPS[index],
            state:
              step.state === "done" ||
              step.state === "queued" ||
              step.state === "active"
                ? step.state
                : "locked",
          }))
        : createWorkflow(),
  }
}

export function saveVideoTasks(
  tasks: VideoTask[],
  storage: Storage = window.localStorage
) {
  storage.setItem(
    VIDEO_TASKS_STORAGE_KEY,
    JSON.stringify(tasks.map((task) => sanitizeVideoTask(task)))
  )
}

export function readVideoTasks(storage: Storage = window.localStorage) {
  const raw = storage.getItem(VIDEO_TASKS_STORAGE_KEY)
  if (!raw) return []
  const parsed = JSON.parse(raw) as VideoTask[]
  return Array.isArray(parsed) ? parsed.map(sanitizeVideoTask) : []
}
