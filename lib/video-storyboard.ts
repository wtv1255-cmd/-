import type {
  StoryboardShot,
  VideoAsset,
  VideoDurationPreset,
  VideoPackageId,
  VideoVisualType,
} from "@/lib/video-domain"
import type { CopywritingBoardId } from "@/lib/video-analysis"

export type VideoPackageOption = {
  id: VideoPackageId
  label: string
  description: string
}

export type VideoDurationOption = {
  id: VideoDurationPreset
  label: string
  targetMs: number
}

export type CreateStoryboardFromScriptInput = {
  script: string
  packageIds: VideoPackageId[]
  durationPreset: VideoDurationPreset
  copywritingBoard?: CopywritingBoardId
  conversionTheme?: string
}

export type DeleteStoryboardShotAndReindexInput = {
  shotId: string
  shots: StoryboardShot[]
  assets?: VideoAsset[]
}

export type DeleteStoryboardShotAndReindexResult = {
  shots: StoryboardShot[]
  assets: VideoAsset[]
  removedAssetIds: string[]
  shotIdMap: Record<string, string>
  deletedShot?: StoryboardShot
}

export type StickmanPromptEditorDraft = {
  shotId: string
  prompt: string
  negativePrompt: string
  editable: boolean
}

export type CreateStickmanPromptEditorDraftInput = {
  shotId: string
  voiceText: string
  visualDescription: string
}

export const VIDEO_PACKAGE_OPTIONS: VideoPackageOption[] = [
  {
    id: "stickman_meme",
    label: "火柴人表情包",
    description: "黑白火柴人吐槽/解说，穿插录屏和成品展示。",
  },
  {
    id: "tool_showcase",
    label: "工具展示",
    description: "炎灵操作录屏为主，强调一键生成和流程跑通。",
  },
  {
    id: "cinematic_showcase",
    label: "成品大片",
    description: "电影感 AI 成品展示，可作为开头钩子或结尾转化。",
  },
]

export const VIDEO_DURATION_OPTIONS: VideoDurationOption[] = [
  { id: "30-45s", label: "30-45 秒", targetMs: 45000 },
  { id: "45-60s", label: "45-60 秒", targetMs: 60000 },
  { id: "60-90s", label: "60-90 秒", targetMs: 90000 },
  { id: "120s", label: "120 秒", targetMs: 120000 },
]

function cleanText(value: unknown, fallback: string) {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
  return text || fallback
}

function splitScript(script: string) {
  const lines = script
    .split(/\n+/)
    .map((line) => cleanText(line, ""))
    .filter(Boolean)
  return lines.length ? lines : ["开头钩子", "演示过程", "结果证明", "结尾转化"]
}

function readVisualDirectionLine(value: string) {
  const match = value
    .trim()
    .match(/^[【\[]\s*(画面|镜头|场景|视觉|分镜)\s*[:：]\s*(.+?)[】\]]?$/u)
  return match?.[2]?.trim() || ""
}

function splitVoiceLine(line: string, maxChars = 46) {
  const sentenceChunks = line
    .split(/(?<=[。！？!?；;])\s*/u)
    .map((item) => cleanText(item, ""))
    .filter(Boolean)
  const chunks = sentenceChunks.length ? sentenceChunks : [line]

  return chunks.flatMap((chunk) => {
    if (Array.from(chunk).length <= maxChars) return [chunk]
    const softChunks = chunk
      .split(/(?<=[，,、])\s*/u)
      .map((item) => cleanText(item, ""))
      .filter(Boolean)
    if (softChunks.length <= 1) return [chunk]

    const merged: string[] = []
    let current = ""
    for (const item of softChunks) {
      const next = `${current}${item}`
      if (current && Array.from(next).length > maxChars) {
        merged.push(current)
        current = item
      } else {
        current = next
      }
    }
    if (current) merged.push(current)
    return merged
  })
}

function parseScriptChannels(script: string) {
  type ScriptChannelSegment = {
    voiceText: string
    visualDescription?: string
  }
  const segments: ScriptChannelSegment[] = []
  let pendingVisualDescription = ""

  for (const line of splitScript(script)) {
    const visualDescription = readVisualDirectionLine(line)
    if (visualDescription) {
      pendingVisualDescription = pendingVisualDescription
        ? `${pendingVisualDescription}；${visualDescription}`
        : visualDescription
      continue
    }

    const chunks = splitVoiceLine(line)

    for (const [index, voiceText] of chunks.entries()) {
      segments.push({
        voiceText,
        visualDescription:
          index === 0 ? pendingVisualDescription || undefined : undefined,
      })
    }
    pendingVisualDescription = ""
  }

  if (!segments.length) {
    return splitScript(script).map(
      (line): ScriptChannelSegment => ({ voiceText: line })
    )
  }
  if (pendingVisualDescription) {
    const previous = segments[segments.length - 1]
    previous.visualDescription = previous.visualDescription
      ? `${previous.visualDescription}；${pendingVisualDescription}`
      : pendingVisualDescription
  }

  return segments
}

function resolveDurationMs(preset: VideoDurationPreset) {
  return (
    VIDEO_DURATION_OPTIONS.find((option) => option.id === preset)?.targetMs ||
    60000
  )
}

function resolvePackageIds(packageIds: VideoPackageId[]) {
  const valid = packageIds.filter((id) =>
    VIDEO_PACKAGE_OPTIONS.some((option) => option.id === id)
  )
  return valid.length ? valid : (["stickman_meme"] satisfies VideoPackageId[])
}

function visualTypeForPackage(
  packageIds: VideoPackageId[],
  index: number
): VideoVisualType {
  const packageId = packageIds[index % packageIds.length]
  if (packageId === "tool_showcase") return "yanling_clip"
  if (packageId === "cinematic_showcase") return "showcase_clip"
  return "stickman"
}

const IMAGE_SCENE_NEGATIVE_PROMPT =
  "复杂背景，写实人物，版权角色，低清晰度，水印，logo，品牌标志，产品图标，字幕，文字，App UI 文案，对话框，聊天气泡，语音气泡，大段文字"

function stripTextAndBrandTerms(value: string) {
  return value
    .replace(/豆包|炎灵|剪映/g, "工具流程节点")
    .replace(/logo|图标|字幕|文字|对白|对话框|气泡/gi, "画面元素")
}

function buildSceneIntent(
  voiceText: string,
  board: CopywritingBoardId | undefined,
  visualType: VideoVisualType
) {
  const scene = stripTextAndBrandTerms(cleanText(voiceText, "短视频场景"))
  if (board === "product_conversion") {
    if (visualType === "yanling_clip") {
      return `产品工作流中的工具流程操作场景，表现创作者整理素材和生成画面资产的动作，不画具体产品 logo 或界面文字：${scene}`
    }
    return `产品工作流中的创作步骤场景，表现人物决策、素材整理或剪辑交付意图，不画具体产品 logo 或品牌图标：${scene}`
  }

  return scene
}

function buildPrompt(
  voiceText: string,
  visualType: VideoVisualType,
  board?: CopywritingBoardId,
  visualDescription?: string
) {
  const sceneIntent = buildSceneIntent(
    visualDescription || voiceText,
    board,
    visualType
  )
  const commonConstraint =
    "只描述可生成的画面场景，不要文字、不要字幕、不要对话框、不要气泡、不要 logo、不要品牌标志"
  if (visualType === "stickman") {
    return `黑白火柴人简笔线稿，白底黑线，表情包吐槽感，${commonConstraint}，画面表达：${sceneIntent}`
  }
  if (visualType === "yanling_clip") {
    return `干净的工具操作流程镜头，突出一键生成的动作节奏，${commonConstraint}，画面表达：${sceneIntent}`
  }
  return `电影感 AI 成品展示镜头，干净构图，展示结果对比，${commonConstraint}，画面表达：${sceneIntent}`
}

function shotIdForIndex(index: number) {
  return `shot_${String(index + 1).padStart(2, "0")}`
}

function isGeneratedStickmanAssetForShot(asset: VideoAsset, shotId: string) {
  return (
    asset.kind === "stickman_image" &&
    Boolean(asset.tags?.includes("generated_image")) &&
    Boolean(asset.tags?.includes(shotId))
  )
}

export function createStoryboardFromScript({
  script,
  packageIds,
  durationPreset,
  copywritingBoard = "generic_rewrite",
}: CreateStoryboardFromScriptInput): StoryboardShot[] {
  const segments = parseScriptChannels(script)
  const resolvedPackages = resolvePackageIds(packageIds)
  const totalMs = resolveDurationMs(durationPreset)
  const stepMs = Math.floor(totalMs / segments.length)

  return segments.map((segment, index) => {
    const visualType = visualTypeForPackage(resolvedPackages, index)
    const startMs = index * stepMs
    const endMs =
      index === segments.length - 1 ? totalMs : (index + 1) * stepMs
    const packageLabel = VIDEO_PACKAGE_OPTIONS.find(
      (option) => option.id === resolvedPackages[index % resolvedPackages.length]
    )?.label
    const visualDescription =
      segment.visualDescription || `${packageLabel}：${segment.voiceText}`

    return {
      id: shotIdForIndex(index),
      startMs,
      endMs,
      voiceText: segment.voiceText,
      visualType,
      visualDescription,
      prompt: buildPrompt(
        segment.voiceText,
        visualType,
        copywritingBoard,
        visualDescription
      ),
      negativePrompt: IMAGE_SCENE_NEGATIVE_PROMPT,
      assetIds: [],
      status: "draft",
    }
  })
}

export function deleteStoryboardShotAndReindex({
  shotId,
  shots,
  assets = [],
}: DeleteStoryboardShotAndReindexInput): DeleteStoryboardShotAndReindexResult {
  const deletedShot = shots.find((shot) => shot.id === shotId)
  if (!deletedShot) {
    return {
      shots,
      assets,
      removedAssetIds: [],
      shotIdMap: Object.fromEntries(shots.map((shot) => [shot.id, shot.id])),
    }
  }

  const shotIdMap: Record<string, string> = {}
  let cursorMs = 0
  const nextShots = shots
    .filter((shot) => shot.id !== shotId)
    .map((shot, index) => {
      const nextId = shotIdForIndex(index)
      const durationMs = Math.max(0, shot.endMs - shot.startMs)
      const nextShot = {
        ...shot,
        id: nextId,
        startMs: cursorMs,
        endMs: cursorMs + durationMs,
      }
      cursorMs = nextShot.endMs
      shotIdMap[shot.id] = nextId
      return nextShot
    })
  const removedAssetIds: string[] = []
  const nextAssets = assets
    .filter((asset) => {
      const remove = isGeneratedStickmanAssetForShot(asset, shotId)
      if (remove) removedAssetIds.push(asset.id)
      return !remove
    })
    .map((asset) => {
      if (
        asset.kind !== "stickman_image" ||
        !asset.tags?.includes("generated_image")
      ) {
        return asset
      }

      const nextTags = asset.tags.map((tag) => shotIdMap[tag] || tag)
      return { ...asset, tags: nextTags }
    })

  return {
    shots: nextShots,
    assets: nextAssets,
    removedAssetIds,
    shotIdMap,
    deletedShot,
  }
}

export function createStickmanPromptEditorDraft({
  shotId,
  voiceText,
  visualDescription,
}: CreateStickmanPromptEditorDraftInput): StickmanPromptEditorDraft {
  return {
    shotId: cleanText(shotId, "shot_01"),
    prompt: `黑白火柴人简笔线稿，白底黑线，极简线条，夸张表情，${cleanText(
      visualDescription,
      "火柴人解释视频主题"
    )}，只描述画面场景，不要文字、不要字幕、不要对话框、不要气泡、不要 logo、不要品牌标志，口播含义仅供理解：${cleanText(voiceText, "短视频口播")}`,
    negativePrompt: IMAGE_SCENE_NEGATIVE_PROMPT,
    editable: true,
  }
}
