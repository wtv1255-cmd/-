import fs from "node:fs/promises"
import path from "node:path"

const MAX_TASK_RUN_EVENTS = 200

const TASK_RUN_STAGE_WEIGHTS = {
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

const TASK_RUN_STAGE_ORDER = [
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

const TASK_RUN_STATES = new Set([
  "queued",
  "running",
  "success",
  "retrying",
  "fallback",
  "warning",
  "failed",
  "needs_manual",
  "artifact",
])

function cleanSegment(value, fallback) {
  const cleaned =
    typeof value === "string"
      ? value
          .trim()
          .replace(/[\\/:*?"<>|]+/g, "-")
          .replace(/\s+/g, "-")
          .replace(/^[.-]+/u, "")
      : ""
  return cleaned || fallback
}

function extensionFromMimeType(mimeType) {
  if (mimeType === "image/jpeg") return ".jpg"
  if (mimeType === "image/webp") return ".webp"
  if (mimeType === "video/mp4") return ".mp4"
  if (mimeType === "audio/mpeg") return ".mp3"
  if (mimeType === "audio/wav") return ".wav"
  return ".png"
}

function cleanFilename(value, mimeType, fallback) {
  const fallbackName = `${fallback}${extensionFromMimeType(mimeType)}`
  const cleaned = cleanSegment(value, fallbackName).replace(/\.+$/u, "")
  return path.extname(cleaned) ? cleaned : `${cleaned}${extensionFromMimeType(mimeType)}`
}

function resolveTaskFilePath({ userDataDir, taskId, kind, filename, mimeType }) {
  const safeTaskId = cleanSegment(taskId, "task")
  const safeKind = cleanSegment(kind, "asset")
  const safeFilename = cleanFilename(filename, mimeType, "asset")
  const outputDir = path.resolve(userDataDir, "tasks", safeTaskId, safeKind)
  const filePath = path.resolve(outputDir, safeFilename)
  const relative = path.relative(outputDir, filePath)

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("文件路径超出任务目录")
  }

  return { outputDir, filePath, filename: safeFilename, taskId: safeTaskId }
}

function resolveTaskCacheDir({ userDataDir, taskId }) {
  const rawTaskId = typeof taskId === "string" ? taskId.trim() : ""
  const safeTaskId = cleanSegment(rawTaskId, "")
  if (!rawTaskId || rawTaskId !== safeTaskId || rawTaskId.includes("..")) {
    throw new Error("任务 ID 包含非法路径字符")
  }

  const tasksDir = path.resolve(userDataDir, "tasks")
  const taskDir = path.resolve(tasksDir, safeTaskId)
  const relative = path.relative(tasksDir, taskDir)

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("任务目录超出缓存根目录")
  }

  return { tasksDir, taskDir, taskId: safeTaskId }
}

function resolveTaskRunLogPaths({ userDataDir, taskId }) {
  const { taskDir, taskId: safeTaskId } = resolveTaskCacheDir({
    userDataDir,
    taskId,
  })
  const logDir = path.resolve(taskDir, "run_logs")
  const relative = path.relative(taskDir, logDir)

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("任务日志目录超出任务目录")
  }

  return {
    taskId: safeTaskId,
    logDir,
    jsonlPath: path.join(logDir, "progress.jsonl"),
    summaryPath: path.join(logDir, "progress-summary.json"),
  }
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function clampCount(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : undefined
}

function sanitizeProgressText(value) {
  return String(value || "")
    .replace(
      /\b(api[-_ ]?key|authorization|token|secret|cookie|password)\b\s*[:=]\s*\S+/giu,
      "[已隐藏]"
    )
    .replace(/\s+/gu, " ")
    .trim()
}

function normalizeTaskRunStage(value) {
  return Object.hasOwn(TASK_RUN_STAGE_WEIGHTS, value) ? value : "source"
}

function normalizeTaskRunState(value) {
  return TASK_RUN_STATES.has(value) ? value : "running"
}

function createTaskRunEvent(input, taskId) {
  const now = new Date().toISOString()
  const current = clampCount(input?.current)
  const total = clampCount(input?.total)
  const artifact = input?.artifact
  const error = input?.error

  return {
    id:
      typeof input?.id === "string" && input.id
        ? input.id
        : `evt_${now.replace(/\D/gu, "").slice(0, 17)}_${Math.random()
            .toString(36)
            .slice(2, 7)}`,
    taskId,
    at: typeof input?.at === "string" && input.at ? input.at : now,
    stage: normalizeTaskRunStage(input?.stage),
    state: normalizeTaskRunState(input?.state),
    message: sanitizeProgressText(input?.message),
    ...(current !== undefined ? { current } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(typeof input?.progress === "number"
      ? { progress: clamp01(input.progress) }
      : {}),
    ...(artifact
      ? {
          artifact: {
            kind: sanitizeProgressText(artifact.kind),
            path: sanitizeProgressText(artifact.path),
            label: sanitizeProgressText(artifact.label),
          },
        }
      : {}),
    ...(error
      ? {
          error: {
            code: sanitizeProgressText(error.code),
            message: sanitizeProgressText(error.message),
            retryable: Boolean(error.retryable),
          },
        }
      : {}),
  }
}

function eventProgress(event) {
  if (typeof event.progress === "number") return clamp01(event.progress)
  if (typeof event.current === "number" && typeof event.total === "number") {
    return event.total > 0 ? clamp01(event.current / event.total) : 0
  }
  if (event.state === "success" || event.state === "artifact") return 1
  if (event.state === "running") return 0.05
  return 0
}

function createTaskRunSummary(events) {
  const latest = events.at(-1)
  const latestByStage = new Map()
  let weightedProgress = 0

  for (const event of events) {
    latestByStage.set(event.stage, event)
  }
  for (const stage of TASK_RUN_STAGE_ORDER) {
    const event = latestByStage.get(stage)
    if (!event) continue
    weightedProgress += TASK_RUN_STAGE_WEIGHTS[stage] * eventProgress(event)
  }

  const latestWithCount = [...events]
    .reverse()
    .find((event) => event.current !== undefined || event.total !== undefined)
  const latestArtifact = [...events].reverse().find((event) => event.artifact)
    ?.artifact

  return {
    taskId: latest?.taskId || "",
    state: latest?.state || "queued",
    stage: latest?.stage || "source",
    message: latest?.message || "暂无运行日志",
    progress: clamp01(weightedProgress / 100),
    current: latestWithCount?.current,
    total: latestWithCount?.total,
    successCount: events.filter((event) => event.state === "success").length,
    failureCount: events.filter((event) => event.state === "failed").length,
    needsManual: events.some((event) => event.state === "needs_manual"),
    latestArtifact,
    updatedAt: latest?.at || new Date().toISOString(),
  }
}

async function readRunEventsFromJsonl(jsonlPath) {
  try {
    const raw = await fs.readFile(jsonlPath, "utf8")
    return raw
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .slice(-MAX_TASK_RUN_EVENTS)
  } catch (error) {
    if (error?.code === "ENOENT") return []
    throw error
  }
}

function toBuffer(data) {
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data))
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  }
  return Buffer.from(data || [])
}

function mimeTypeFromFilename(filename, fallback) {
  const ext = path.extname(String(filename || "")).toLowerCase()
  if (ext === ".mp3") return "audio/mpeg"
  if (ext === ".wav") return "audio/wav"
  if (ext === ".m4a") return "audio/mp4"
  if (ext === ".aac") return "audio/aac"
  if (ext === ".ogg") return "audio/ogg"
  if (ext === ".flac") return "audio/flac"
  return fallback || "application/octet-stream"
}

export async function saveTaskAssetFile({ userDataDir, input }) {
  const mimeType = typeof input?.mimeType === "string" ? input.mimeType : "image/png"
  const data = input?.data
  if (!data) throw new Error("文件数据为空")

  const { outputDir, filePath, filename, taskId } = resolveTaskFilePath({
    userDataDir,
    taskId: input?.taskId,
    kind: input?.kind,
    filename: input?.filename,
    mimeType,
  })
  const bytes = toBuffer(data)

  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(filePath, bytes)

  return {
    ok: true,
    taskId,
    filename,
    filePath,
    bytes: bytes.byteLength,
    mimeType,
    dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
  }
}

export async function copyTaskAssetFile({ userDataDir, input }) {
  const sourcePath = path.resolve(String(input?.sourcePath || ""))
  if (!sourcePath) throw new Error("源文件路径为空")
  const sourceStat = await fs.stat(sourcePath)
  if (!sourceStat.isFile()) throw new Error("源文件不是可读取文件")

  const sourceFilename = path.basename(sourcePath)
  const mimeType =
    typeof input?.mimeType === "string" && input.mimeType
      ? input.mimeType
      : mimeTypeFromFilename(sourceFilename)
  const { outputDir, filePath, filename, taskId } = resolveTaskFilePath({
    userDataDir,
    taskId: input?.taskId,
    kind: input?.kind,
    filename: input?.filename || sourceFilename,
    mimeType,
  })

  await fs.mkdir(outputDir, { recursive: true })
  await fs.copyFile(sourcePath, filePath)

  return {
    ok: true,
    taskId,
    filename,
    filePath,
    bytes: sourceStat.size,
    mimeType,
  }
}

export async function readTaskAssetPreview({ userDataDir, input }) {
  const filePath = path.resolve(String(input?.filePath || ""))
  const tasksDir = path.resolve(userDataDir, "tasks")
  const relative = path.relative(tasksDir, filePath)

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("只能读取任务目录内的素材预览")
  }

  const mimeType = typeof input?.mimeType === "string" ? input.mimeType : "image/png"
  const bytes = await fs.readFile(filePath)
  return {
    ok: true,
    filePath,
    bytes: bytes.byteLength,
    mimeType,
    dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
  }
}

export async function deleteTaskCache({ userDataDir, input }) {
  const { taskDir, taskId } = resolveTaskCacheDir({
    userDataDir,
    taskId: input?.taskId,
  })
  let existed = false

  try {
    const stat = await fs.stat(taskDir)
    existed = stat.isDirectory()
  } catch {
    existed = false
  }

  await fs.rm(taskDir, { force: true, recursive: true })

  return {
    ok: true,
    taskId,
    deletedPath: taskDir,
    existed,
  }
}

export async function appendTaskRunEvent({ userDataDir, input }) {
  const { taskId, logDir, jsonlPath, summaryPath } = resolveTaskRunLogPaths({
    userDataDir,
    taskId: input?.taskId,
  })
  const event = createTaskRunEvent(input, taskId)
  const previousEvents = await readRunEventsFromJsonl(jsonlPath)
  const events = [...previousEvents, event].slice(-MAX_TASK_RUN_EVENTS)
  const summary = createTaskRunSummary(events)

  await fs.mkdir(logDir, { recursive: true })
  await fs.writeFile(
    jsonlPath,
    `${events.map((item) => JSON.stringify(item)).join("\n")}\n`,
    "utf8"
  )
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8")

  return {
    ok: true,
    taskId,
    event,
    summary,
  }
}

export async function readTaskRunEvents({ userDataDir, input }) {
  const { taskId, jsonlPath } = resolveTaskRunLogPaths({
    userDataDir,
    taskId: input?.taskId,
  })
  const events = await readRunEventsFromJsonl(jsonlPath)

  return {
    ok: true,
    taskId,
    events,
  }
}

export async function readTaskRunSummary({ userDataDir, input }) {
  const { taskId, jsonlPath, summaryPath } = resolveTaskRunLogPaths({
    userDataDir,
    taskId: input?.taskId,
  })

  try {
    const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"))
    return {
      ok: true,
      taskId,
      summary,
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
    const events = await readRunEventsFromJsonl(jsonlPath)
    return {
      ok: true,
      taskId,
      summary: createTaskRunSummary(events),
    }
  }
}

export async function clearTaskRunLog({ userDataDir, input }) {
  const { taskId, logDir } = resolveTaskRunLogPaths({
    userDataDir,
    taskId: input?.taskId,
  })

  await fs.rm(logDir, { force: true, recursive: true })

  return {
    ok: true,
    taskId,
  }
}

export function createTaskAssetFileIpcHandler(userDataDir) {
  return async (_event, input) => {
    try {
      return await saveTaskAssetFile({ userDataDir, input })
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "保存任务素材失败",
      }
    }
  }
}

export function createTaskAssetPreviewIpcHandler(userDataDir) {
  return async (_event, input) => {
    try {
      return await readTaskAssetPreview({ userDataDir, input })
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "读取任务素材预览失败",
      }
    }
  }
}

export function createTaskAssetCopyIpcHandler(userDataDir) {
  return async (_event, input) => {
    try {
      return await copyTaskAssetFile({ userDataDir, input })
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "复制任务素材失败",
      }
    }
  }
}

export function createTaskCacheDeleteIpcHandler(userDataDir) {
  return async (_event, input) => {
    try {
      return await deleteTaskCache({ userDataDir, input })
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "删除任务缓存失败",
      }
    }
  }
}

export function createTaskRunEventAppendIpcHandler(userDataDir) {
  return async (_event, input) => {
    try {
      return await appendTaskRunEvent({ userDataDir, input })
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "写入任务进度失败",
      }
    }
  }
}

export function createTaskRunEventsReadIpcHandler(userDataDir) {
  return async (_event, input) => {
    try {
      return await readTaskRunEvents({ userDataDir, input })
    } catch (error) {
      return {
        ok: false,
        events: [],
        error: error instanceof Error ? error.message : "读取任务日志失败",
      }
    }
  }
}

export function createTaskRunSummaryReadIpcHandler(userDataDir) {
  return async (_event, input) => {
    try {
      return await readTaskRunSummary({ userDataDir, input })
    } catch (error) {
      return {
        ok: false,
        summary: null,
        error: error instanceof Error ? error.message : "读取任务进度失败",
      }
    }
  }
}

export function createTaskRunLogClearIpcHandler(userDataDir) {
  return async (_event, input) => {
    try {
      return await clearTaskRunLog({ userDataDir, input })
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "清理任务日志失败",
      }
    }
  }
}
