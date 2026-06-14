import type {
  StoryboardShot,
  VideoDurationPreset,
  VideoPackageId,
  VideoVisualType,
} from "@/lib/video-domain"

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

function buildPrompt(voiceText: string, visualType: VideoVisualType) {
  if (visualType === "stickman") {
    return `黑白火柴人简笔线稿，白底黑线，表情包吐槽感，画面表达：${voiceText}`
  }
  if (visualType === "yanling_clip") {
    return `炎灵工具操作录屏画面，突出一键生成流程，字幕强调：${voiceText}`
  }
  return `电影感 AI 成品展示镜头，干净构图，展示结果对比：${voiceText}`
}

export function createStoryboardFromScript({
  script,
  packageIds,
  durationPreset,
}: CreateStoryboardFromScriptInput): StoryboardShot[] {
  const lines = splitScript(script)
  const resolvedPackages = resolvePackageIds(packageIds)
  const totalMs = resolveDurationMs(durationPreset)
  const stepMs = Math.floor(totalMs / lines.length)

  return lines.map((line, index) => {
    const visualType = visualTypeForPackage(resolvedPackages, index)
    const startMs = index * stepMs
    const endMs = index === lines.length - 1 ? totalMs : (index + 1) * stepMs
    return {
      id: `shot_${String(index + 1).padStart(2, "0")}`,
      startMs,
      endMs,
      voiceText: line,
      visualType,
      visualDescription: `${VIDEO_PACKAGE_OPTIONS.find(
        (option) => option.id === resolvedPackages[index % resolvedPackages.length]
      )?.label}：${line}`,
      prompt: buildPrompt(line, visualType),
      negativePrompt: "复杂背景，写实人物，版权角色，低清晰度，多余文字",
      assetIds: [],
      status: "draft",
    }
  })
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
    )}，口播含义：${cleanText(voiceText, "短视频口播")}`,
    negativePrompt: "复杂背景，真实人脸，彩色厚涂，版权角色，水印，杂乱文字",
    editable: true,
  }
}
