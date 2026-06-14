import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

const MAX_RENDER_SECONDS = 180

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

function cleanMp4Filename(value, fallback) {
  const cleaned = cleanSegment(value, fallback).replace(/\.+$/u, "")
  return cleaned.toLowerCase().endsWith(".mp4") ? cleaned : `${cleaned}.mp4`
}

function resolveTaskOutputPath({ userDataDir, taskId, outputFilename }) {
  const safeTaskId = cleanSegment(taskId, "task")
  const safeFilename = cleanMp4Filename(outputFilename, `${safeTaskId}.mp4`)
  const baseDir = path.resolve(userDataDir, "tasks", safeTaskId)
  const outputDir = path.resolve(baseDir, "rendered_video")
  const filePath = path.resolve(outputDir, safeFilename)
  const relative = path.relative(outputDir, filePath)

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("输出路径超出任务目录")
  }

  return { outputDir, filePath, filename: safeFilename, taskId: safeTaskId }
}

function assertRenderableTimeline(timeline) {
  if (
    !timeline ||
    typeof timeline !== "object" ||
    !Array.isArray(timeline.tracks) ||
    timeline.tracks.length === 0 ||
    !Number.isFinite(Number(timeline.durationMs)) ||
    Number(timeline.durationMs) <= 0
  ) {
    throw new Error("VideoTimeline 尚未准备好，无法导出 MP4")
  }
}

function runProcess(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
    })
    let stderr = ""

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    child.on("error", (error) => {
      resolve({ ok: false, stderr: error.message, code: -1 })
    })
    child.on("close", (code) => {
      resolve({ ok: code === 0, stderr, code: code ?? 0 })
    })
  })
}

function buildFfmpegArgs({ durationSeconds, filePath }) {
  return [
    "-y",
    "-hide_banner",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=1080x1920:r=30",
    "-t",
    String(durationSeconds),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    filePath,
  ]
}

export async function renderTimelineWithFfmpeg({
  userDataDir,
  taskId,
  timeline,
  outputFilename,
  ffmpegPath = "ffmpeg",
}) {
  try {
    assertRenderableTimeline(timeline)
    const {
      outputDir,
      filePath,
      filename,
      taskId: safeTaskId,
    } = resolveTaskOutputPath({
      userDataDir,
      taskId,
      outputFilename,
    })
    await fs.mkdir(outputDir, { recursive: true })

    const durationSeconds = Math.max(
      1,
      Math.min(MAX_RENDER_SECONDS, Number(timeline.durationMs) / 1000)
    )
    const args = buildFfmpegArgs({ durationSeconds, filePath })
    const result = await runProcess(ffmpegPath, args)
    if (!result.ok) {
      return {
        ok: false,
        error: result.stderr || `FFmpeg exited with ${result.code}`,
        filePath,
      }
    }

    const stats = await fs.stat(filePath)
    return {
      ok: true,
      taskId: safeTaskId,
      filename,
      filePath,
      bytes: stats.size,
      mimeType: "video/mp4",
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function createVideoRendererIpcHandler(userDataDir) {
  return async (_event, input) =>
    renderTimelineWithFfmpeg({
      userDataDir,
      taskId: input?.taskId,
      timeline: input?.timeline,
      outputFilename: input?.outputFilename,
    })
}
