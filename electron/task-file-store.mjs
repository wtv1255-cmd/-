import fs from "node:fs/promises"
import path from "node:path"

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

function toBuffer(data) {
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data))
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  }
  return Buffer.from(data || [])
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
