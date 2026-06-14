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
  | "fallback_ready"
  | "blocked_no_timeline"
  | "blocked_no_engine"

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
