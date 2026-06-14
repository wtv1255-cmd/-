import type { ApiProfileRequestContext } from "@/lib/api-profiles"
import type { VideoAsset, VideoAssetKind } from "@/lib/video-domain"

export type VideoAssetCategoryOption = {
  kind: VideoAssetKind
  label: string
  accepts: string
}

export type CreateImportedVideoAssetInput = {
  taskId: string
  kind: VideoAssetKind
  filename: string
  bytes?: number
  mimeType?: string
  durationMs?: number
  tags?: string[]
}

export type BuildVideoImageGenerationRequestInput = {
  profile: ApiProfileRequestContext
  prompt: string
  negativePrompt: string
  model?: string
}

export type VideoImageGenerationRequest = {
  endpoint: "/api/codex/images/generations"
  model: string
  prompt: string
  negativePrompt: string
  apiBaseUrl: string
  apiKey: string
  profileId: string
}

export type VideoAssetLogEntry = {
  kind: "image_generation_request"
  profileId: string
  apiBaseUrl: string
  model: string
  promptLength: number
  apiKey?: never
}

const VIDEO_TASK_FILE_ROOT = "%APPDATA%/她火/tasks"

export const VIDEO_ASSET_CATEGORY_OPTIONS: VideoAssetCategoryOption[] = [
  { kind: "stickman_image", label: "火柴人图", accepts: "image/*" },
  { kind: "yanling_clip", label: "炎灵录屏", accepts: "video/*" },
  { kind: "showcase_clip", label: "成品展示", accepts: "video/*" },
  { kind: "bgm", label: "BGM", accepts: "audio/*" },
  { kind: "sfx", label: "音效", accepts: "audio/*" },
  { kind: "cover_image", label: "封面图", accepts: "image/*" },
]

function cleanText(value: unknown, fallback = "") {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
  return text || fallback
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

function cleanNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0
}

export function createImportedVideoAsset({
  taskId,
  kind,
  filename,
  bytes,
  mimeType,
  durationMs,
  tags = [],
}: CreateImportedVideoAssetInput): VideoAsset {
  const safeTaskId = cleanSegment(taskId, "task")
  const safeFilename = cleanSegment(filename, "asset.bin")
  return {
    id: `${kind}_${safeFilename}_${Date.now()}`,
    kind,
    displayName: safeFilename,
    file: {
      id: `${kind}_${safeFilename}`,
      taskId: safeTaskId,
      kind,
      filename: safeFilename,
      path: `${VIDEO_TASK_FILE_ROOT}/${safeTaskId}/${kind}/${safeFilename}`,
      bytes: cleanNumber(bytes),
      mimeType: cleanText(mimeType, "application/octet-stream"),
      storage: "app_user_data_task_dir",
    },
    tags: tags.map((tag) => cleanText(tag)).filter(Boolean),
    durationMs: durationMs === undefined ? undefined : cleanNumber(durationMs),
  }
}

export function buildVideoImageGenerationRequest({
  profile,
  prompt,
  negativePrompt,
  model = "gpt-image-2-2K",
}: BuildVideoImageGenerationRequestInput): VideoImageGenerationRequest {
  return {
    endpoint: "/api/codex/images/generations",
    model,
    prompt: cleanText(prompt, "黑白火柴人简笔线稿，白底黑线"),
    negativePrompt: cleanText(negativePrompt, "复杂背景，写实人物，水印"),
    apiBaseUrl: profile.apiBaseUrl,
    apiKey: profile.apiKey,
    profileId: profile.profileId,
  }
}

export function createVideoAssetLogEntry(
  request: VideoImageGenerationRequest
): VideoAssetLogEntry {
  return {
    kind: "image_generation_request",
    profileId: request.profileId,
    apiBaseUrl: request.apiBaseUrl,
    model: request.model,
    promptLength: request.prompt.length,
  }
}

export function removeVideoAssetById(assets: VideoAsset[], assetId: string) {
  return assets.filter((asset) => asset.id !== assetId)
}

export function serializeVideoAssetsForSnapshot(assets: VideoAsset[]) {
  return JSON.stringify(assets, (key, value) => {
    if (key === "blob" || key === "dataUrl" || key === "arrayBuffer") {
      return undefined
    }
    return value
  })
}
