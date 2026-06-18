import type { ApiProfileRequestContext } from "@/lib/api-profiles"
import type { CodexImageResult } from "@/lib/types/image"
import type {
  StoryboardShot,
  VideoAsset,
  VideoAssetKind,
} from "@/lib/video-domain"

export type VideoAssetCategoryOption = {
  kind: VideoAssetKind
  label: string
  accepts: string
}

export type ExternalMaterialLabelId =
  | "tool_demo"
  | "real_drama_clip"
  | "emotion_boost"
  | "opening_hook"
  | "ending_conversion"
  | "product_proof"

export type ExternalMaterialLabelOption = {
  id: ExternalMaterialLabelId
  label: string
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

export type CreateExternalMaterialPlaceholderAssetInput = {
  taskId: string
  labelId: ExternalMaterialLabelId
  shotId: string
}

export type VideoImageGenerationPresetId =
  | "vertical_9_16"
  | "square_1_1"
  | "landscape_16_9"

export type VideoImageGenerationPreset = {
  id: VideoImageGenerationPresetId
  label: string
  aspectRatio: "9:16" | "1:1" | "16:9"
  size: string
  quality: "auto" | "high" | "medium" | "low"
}

export type VideoImageGenerationSettings = {
  presetId: VideoImageGenerationPresetId
  aspectRatio: VideoImageGenerationPreset["aspectRatio"]
  size: string
  quality: VideoImageGenerationPreset["quality"]
  styleStrength: number
}

export type NormalizeVideoImageGenerationSettingsInput = Partial<
  Pick<VideoImageGenerationSettings, "presetId" | "styleStrength">
> & {
  advanced?: Partial<
    Pick<VideoImageGenerationSettings, "size" | "quality" | "styleStrength">
  >
}

export type BuildVideoImageGenerationRequestInput = {
  profile: ApiProfileRequestContext
  prompt: string
  negativePrompt: string
  settings?: VideoImageGenerationSettings
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
  aspectRatio: VideoImageGenerationSettings["aspectRatio"]
  size: string
  quality: VideoImageGenerationSettings["quality"]
  styleStrength: number
}

export type VideoAssetLogEntry = {
  kind: "image_generation_request"
  profileId: string
  apiBaseUrl: string
  model: string
  promptLength: number
  apiKey?: never
}

export type GenerateStickmanStoryboardAssetInput = {
  taskId: string
  shot: StoryboardShot
  profile: ApiProfileRequestContext
  settings?: VideoImageGenerationSettings
  requestImages: (
    request: VideoImageGenerationRequest
  ) => Promise<CodexImageResult[]>
  wait?: (ms: number) => Promise<void>
  maxAttempts?: number
  onAttempt?: (attempt: number, maxAttempts: number) => void
}

export type GeneratedStickmanStoryboardAsset = {
  asset: VideoAsset
  image: CodexImageResult
  request: VideoImageGenerationRequest
  attempts: number
}

export type RunStickmanImageGenerationQueueInput<T> = {
  items: T[]
  concurrency: number
  worker: (item: T, index: number) => Promise<void>
  shouldStop?: () => boolean
}

export type PerShotImageGenerationAction = "fill_failed" | "regenerate"

export type CreatePerShotImageGenerationPlanInput = {
  shots: Array<Pick<StoryboardShot, "id" | "status" | "assetIds">>
  action: PerShotImageGenerationAction
  shotId?: string
}

export type PerShotImageGenerationPlan = {
  action: PerShotImageGenerationAction
  targets: Array<Pick<StoryboardShot, "id" | "status" | "assetIds">>
  preserveSuccessfulAssets: boolean
}

export type StickmanImageGenerationQueueResult<T> = {
  completed: number
  failed: number
  stopped: boolean
  fatalError?: Error
  errors: Array<{
    item: T
    index: number
    error: Error
  }>
}

const VIDEO_TASK_FILE_ROOT = "%APPDATA%/她火/tasks"

export const IMAGE_GENERATION_PRESETS: VideoImageGenerationPreset[] = [
  {
    id: "vertical_9_16",
    label: "9:16 竖屏",
    aspectRatio: "9:16",
    size: "1024x1792",
    quality: "auto",
  },
  {
    id: "square_1_1",
    label: "1:1 方图",
    aspectRatio: "1:1",
    size: "1024x1024",
    quality: "auto",
  },
  {
    id: "landscape_16_9",
    label: "16:9 横屏",
    aspectRatio: "16:9",
    size: "1792x1024",
    quality: "auto",
  },
]

export const VIDEO_ASSET_CATEGORY_OPTIONS: VideoAssetCategoryOption[] = [
  { kind: "stickman_image", label: "火柴人图", accepts: "image/*" },
  { kind: "yanling_clip", label: "炎灵录屏", accepts: "video/*" },
  { kind: "showcase_clip", label: "成品展示", accepts: "video/*" },
  { kind: "bgm", label: "BGM", accepts: "audio/*" },
  { kind: "sfx", label: "音效", accepts: "audio/*" },
  { kind: "cover_image", label: "封面图", accepts: "image/*" },
]

export const EXTERNAL_MATERIAL_LABEL_OPTIONS: ExternalMaterialLabelOption[] = [
  { id: "tool_demo", label: "工具展示" },
  { id: "real_drama_clip", label: "真实漫剧片段" },
  { id: "emotion_boost", label: "情绪加强" },
  { id: "opening_hook", label: "开头钩子" },
  { id: "ending_conversion", label: "结尾转化" },
  { id: "product_proof", label: "产品证明" },
]

const externalMaterialLabelIds = new Set(
  EXTERNAL_MATERIAL_LABEL_OPTIONS.map((option) => option.id)
)

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

function isExternalMaterialLabelId(
  value: unknown
): value is ExternalMaterialLabelId {
  return (
    typeof value === "string" &&
    externalMaterialLabelIds.has(value as ExternalMaterialLabelId)
  )
}

function isInsufficientBalanceError(error: unknown) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : ""
  return /余额不足|额度不足|balance|insufficient|quota/i.test(message)
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error || "未知错误"))
}

function resolveImagePreset(value: unknown) {
  return (
    IMAGE_GENERATION_PRESETS.find((preset) => preset.id === value) ||
    IMAGE_GENERATION_PRESETS[0]
  )
}

function normalizeImageQuality(
  value: unknown,
  fallback: VideoImageGenerationSettings["quality"]
) {
  return value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "auto"
    ? value
    : fallback
}

function clampStyleStrength(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 50
  return Math.max(0, Math.min(100, Math.floor(number)))
}

export function normalizeVideoImageGenerationSettings(
  input: NormalizeVideoImageGenerationSettingsInput = {}
): VideoImageGenerationSettings {
  const preset = resolveImagePreset(input.presetId)
  return {
    presetId: preset.id,
    aspectRatio: preset.aspectRatio,
    size: cleanText(input.advanced?.size, preset.size),
    quality: normalizeImageQuality(input.advanced?.quality, preset.quality),
    styleStrength: clampStyleStrength(
      input.advanced?.styleStrength ?? input.styleStrength
    ),
  }
}

export async function runStickmanImageGenerationQueue<T>({
  items,
  concurrency,
  worker,
  shouldStop,
}: RunStickmanImageGenerationQueueInput<T>): Promise<
  StickmanImageGenerationQueueResult<T>
> {
  const queueConcurrency = Math.min(
    Math.max(1, Math.floor(concurrency || 1)),
    Math.max(1, items.length)
  )
  const errors: StickmanImageGenerationQueueResult<T>["errors"] = []
  let completed = 0
  let failed = 0
  let nextIndex = 0
  let stopped = false
  let fatalError: Error | undefined

  const runWorker = async () => {
    while (nextIndex < items.length) {
      if (fatalError || shouldStop?.()) {
        stopped = true
        return
      }

      const index = nextIndex
      nextIndex += 1
      const item = items[index]

      try {
        await worker(item, index)
        completed += 1
      } catch (caught) {
        const error = toError(caught)
        failed += 1
        errors.push({ item, index, error })
        if (isInsufficientBalanceError(error)) {
          fatalError = error
          stopped = true
        }
      }
    }
  }

  await Promise.all(Array.from({ length: queueConcurrency }, () => runWorker()))

  return {
    completed,
    failed,
    stopped: stopped || Boolean(fatalError) || Boolean(shouldStop?.()),
    fatalError,
    errors,
  }
}

function imageFilename(shot: StoryboardShot, image: CodexImageResult) {
  const mimeType = cleanText(image.mimeType, "image/png")
  const ext =
    mimeType.includes("jpeg") || mimeType.includes("jpg")
      ? "jpg"
      : mimeType.includes("webp")
        ? "webp"
        : "png"
  const shotNumber = shot.id.match(/\d+/u)?.[0] || "00"
  const startSeconds = Math.round(shot.startMs / 1000)
  const endSeconds = Math.round(shot.endMs / 1000)
  return `${shotNumber.padStart(2, "0")}_${cleanSegment(
    shot.id,
    "shot"
  )}_${startSeconds}-${endSeconds}s_stickman.${ext}`
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

export function normalizeExternalMaterialLabels(values: unknown[]) {
  return Array.from(new Set(values.filter(isExternalMaterialLabelId)))
}

export function getExternalMaterialLabels(asset: Pick<VideoAsset, "tags">) {
  return normalizeExternalMaterialLabels(asset.tags || [])
}

export function createExternalMaterialPlaceholderAsset({
  taskId,
  labelId,
  shotId,
}: CreateExternalMaterialPlaceholderAssetInput): VideoAsset {
  const safeShotId = cleanSegment(shotId, "shot")
  const label =
    EXTERNAL_MATERIAL_LABEL_OPTIONS.find((option) => option.id === labelId)
      ?.label || "外部素材"
  const asset = createImportedVideoAsset({
    taskId,
    kind: "showcase_clip",
    filename: `placeholder_${labelId}_${safeShotId}.mp4`,
    mimeType: "video/mp4",
    tags: ["external_material_placeholder", labelId, safeShotId],
  })
  return {
    ...asset,
    id: `placeholder_${labelId}_${safeShotId}`,
    displayName: `${label}占位 · ${safeShotId}`,
  }
}

export function buildVideoImageGenerationRequest({
  profile,
  prompt,
  negativePrompt,
  settings = normalizeVideoImageGenerationSettings(),
  model = profile.model,
}: BuildVideoImageGenerationRequestInput): VideoImageGenerationRequest {
  const normalizedSettings = normalizeVideoImageGenerationSettings(settings)
  return {
    endpoint: "/api/codex/images/generations",
    model: cleanText(model, "gpt-image-2-2K"),
    prompt: cleanText(prompt, "黑白火柴人简笔线稿，白底黑线"),
    negativePrompt: cleanText(negativePrompt, "复杂背景，写实人物，水印"),
    apiBaseUrl: profile.apiBaseUrl,
    apiKey: profile.apiKey,
    profileId: profile.profileId,
    aspectRatio: normalizedSettings.aspectRatio,
    size: normalizedSettings.size,
    quality: normalizedSettings.quality,
    styleStrength: normalizedSettings.styleStrength,
  }
}

export async function generateStickmanStoryboardAsset({
  taskId,
  shot,
  profile,
  settings,
  requestImages,
  wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
  maxAttempts = 3,
  onAttempt,
}: GenerateStickmanStoryboardAssetInput): Promise<GeneratedStickmanStoryboardAsset> {
  const request = buildVideoImageGenerationRequest({
    profile,
    prompt: shot.prompt || shot.visualDescription || shot.voiceText,
    negativePrompt: shot.negativePrompt,
    settings,
  })
  let lastError: unknown
  const attempts = Math.max(1, Math.floor(maxAttempts))

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      onAttempt?.(attempt, attempts)
      const images = await requestImages(request)
      const image = images[0]
      if (!image) throw new Error("接口没有返回图片")

      return {
        asset: createImportedVideoAsset({
          taskId,
          kind: "stickman_image",
          filename: imageFilename(shot, image),
          mimeType: cleanText(image.mimeType, "image/png"),
          tags: [shot.id, "generated_image", profile.profileId],
        }),
        image,
        request,
        attempts: attempt,
      }
    } catch (error) {
      lastError = error
      if (isInsufficientBalanceError(error) || attempt === attempts) break
      await wait(1200 * attempt)
    }
  }

  throw lastError instanceof Error ? lastError : new Error("生成火柴人图失败")
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

export function createPerShotImageGenerationPlan({
  shots,
  action,
  shotId,
}: CreatePerShotImageGenerationPlanInput): PerShotImageGenerationPlan {
  const targets =
    action === "regenerate"
      ? shots.filter((shot) => shot.id === shotId)
      : shots.filter(
          (shot) => shot.status === "needs_asset" || shot.assetIds.length === 0
        )

  return {
    action,
    targets,
    preserveSuccessfulAssets: true,
  }
}

export function toggleVideoAssetPreviewExpansion(
  expandedAssetIds: string[],
  assetId: string
) {
  return expandedAssetIds.includes(assetId)
    ? expandedAssetIds.filter((id) => id !== assetId)
    : [...expandedAssetIds, assetId]
}

export function serializeVideoAssetsForSnapshot(assets: VideoAsset[]) {
  return JSON.stringify(assets, (key, value) => {
    if (key === "blob" || key === "dataUrl" || key === "arrayBuffer") {
      return undefined
    }
    return value
  })
}
