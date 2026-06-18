import type { ApiProfileRequestContext } from "@/lib/api-profiles"
import type { VideoDurationPreset, VideoPackageId } from "@/lib/video-domain"

export type ViralStructureSection = {
  id: string
  label: string
  summary: string
}

export type ViralStructureSummary = {
  hook: string
  painPoint: string
  proof: string
  conversion: string
  rhythm: string
  reusableElements: string[]
  sections: ViralStructureSection[]
}

export type VideoAnalysisDraftStatus = "ready_for_edit" | "needs_manual_edit"

export type VideoAnalysisDraft = {
  status: VideoAnalysisDraftStatus
  editable: boolean
  sourceText: string
  structureSummary: ViralStructureSummary
  sentenceTimeline: Array<{
    id: string
    startMs: number
    endMs: number
    text: string
  }>
  originalScript: string
  failureReason?: string
}

export type ScriptRewriteMode =
  | "original"
  | "rewrite_a"
  | "rewrite_b"
  | "rewrite_c"

export type ScriptWorkflowMode = "semi_auto" | "full_auto"

export type ScriptRewriteModeOption = {
  id: ScriptRewriteMode
  label: string
  description: string
  advancedOnly: boolean
}

export type ScriptWorkflowSettings = {
  version: 1
  fullAutoRewriteMode: ScriptRewriteMode
}

export type CreateManualVideoAnalysisDraftInput = {
  topic: string
  packageId: VideoPackageId
  durationPreset: VideoDurationPreset
}

export type CreatePastedScriptDraftInput = {
  script: string
  rewriteMode?: ScriptRewriteMode
  sourceLabel?: string
}

export type ScriptGenerationRequest = {
  model: string
  messages: Array<{ role: "system" | "user"; content: string }>
  temperature: number
  apiBaseUrl: string
  apiKey: string
  profileId: string
}

export type BuildScriptGenerationRequestInput = {
  profile: ApiProfileRequestContext
  sourceText: string
  durationPreset: VideoDurationPreset
  packageId: VideoPackageId
  rewriteMode?: ScriptRewriteMode
  model?: string
}

export type ScriptGenerationLogEntry = {
  kind: "script_generation_request"
  profileId: string
  apiBaseUrl: string
  model: string
  sourceLength: number
  apiKey?: never
}

export type CreateScriptGenerationFailureDraftInput = {
  sourceText: string
  reason: string
}

export type CreateModelVideoAnalysisDraftInput = {
  sourceText: string
  modelText: string
}

const structureLabels = [
  ["hook", "开头钩子"],
  ["pain", "痛点放大"],
  ["demo", "演示过程"],
  ["proof", "结果证明"],
  ["conversion", "转化口播"],
  ["close", "结尾行动"],
] as const

export const SCRIPT_WORKFLOW_SETTINGS_STORAGE_KEY =
  "ta-huo:video-script-workflow:v1"

export const SCRIPT_REWRITE_MODE_OPTIONS: ScriptRewriteModeOption[] = [
  {
    id: "original",
    label: "原文直通",
    description: "不调用文本模型，直接用粘贴脚本进入分镜、配音和草稿。",
    advancedOnly: false,
  },
  {
    id: "rewrite_a",
    label: "A 轻改写",
    description: "保留原脚本顺序，只替换表达和口播细节。",
    advancedOnly: true,
  },
  {
    id: "rewrite_b",
    label: "B 平衡改写",
    description: "保留爆款结构，重写钩子、证明和转化表达。",
    advancedOnly: true,
  },
  {
    id: "rewrite_c",
    label: "C 强重构",
    description: "只保留核心意图，重排节奏并生成新的原创脚本。",
    advancedOnly: true,
  },
]

const rewriteInstructions: Record<Exclude<ScriptRewriteMode, "original">, string> = {
  rewrite_a:
    "A 档轻改写：保留原脚本段落顺序和卖点，只替换措辞、节奏连接和口播细节，降低搬运感。",
  rewrite_b:
    "B 档平衡改写：保留可复用爆款结构，重写三秒钩子、痛点证明和转化表达，默认用于全自动流程。",
  rewrite_c:
    "C 档强重构：只保留核心意图和目标用户，重新组织开头、演示、证明和转化顺序，生成新的原创脚本。",
}

function isScriptRewriteMode(value: unknown): value is ScriptRewriteMode {
  return SCRIPT_REWRITE_MODE_OPTIONS.some((option) => option.id === value)
}

export function createDefaultScriptWorkflowSettings(): ScriptWorkflowSettings {
  return {
    version: 1,
    fullAutoRewriteMode: "rewrite_b",
  }
}

export function normalizeScriptWorkflowSettings(
  value: unknown
): ScriptWorkflowSettings {
  const defaults = createDefaultScriptWorkflowSettings()
  if (!value || typeof value !== "object") return defaults

  const raw = value as Partial<ScriptWorkflowSettings>
  return {
    version: 1,
    fullAutoRewriteMode: isScriptRewriteMode(raw.fullAutoRewriteMode)
      ? raw.fullAutoRewriteMode
      : defaults.fullAutoRewriteMode,
  }
}

export function shouldRequestTextModelForScriptMode(mode: ScriptRewriteMode) {
  return mode !== "original"
}

export function saveScriptWorkflowSettings(
  settings: ScriptWorkflowSettings,
  storage: Storage = window.localStorage
) {
  storage.setItem(
    SCRIPT_WORKFLOW_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeScriptWorkflowSettings(settings))
  )
}

export function readScriptWorkflowSettings(
  storage: Storage = window.localStorage
) {
  const raw = storage.getItem(SCRIPT_WORKFLOW_SETTINGS_STORAGE_KEY)
  if (!raw) return createDefaultScriptWorkflowSettings()
  return normalizeScriptWorkflowSettings(JSON.parse(raw))
}

function cleanText(value: unknown, fallback = "") {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
  return text || fallback
}

function cleanScriptText(value: unknown, fallback = "") {
  const text =
    typeof value === "string"
      ? value
          .split(/\r?\n/u)
          .map((line) => line.replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join("\n")
      : ""
  return text || fallback
}

function packageLabel(packageId: VideoPackageId) {
  const labels: Record<VideoPackageId, string> = {
    stickman_meme: "火柴人爆梗",
    tool_showcase: "工具演示",
    cinematic_showcase: "产品大片",
  }
  return labels[packageId] || labels.stickman_meme
}

function buildStructureSummary(sourceText: string): ViralStructureSummary {
  const text = cleanText(sourceText, "用户提供主题")
  return {
    hook: `用「${text}」在前三秒抛出明确收益或冲突。`,
    painPoint: "先说目标用户的低效、成本或错失机会，再给出可视化对比。",
    proof: "用前后对比、步骤拆解和结果画面证明方案有效。",
    conversion: "结尾给出轻量行动指令，引导收藏、评论或试用。",
    rhythm: "3 秒钩子，15 秒痛点和演示，20 秒证明，末尾转化。",
    reusableElements: ["三秒收益钩子", "前后对比", "步骤清单", "结果证明", "行动口播"],
    sections: structureLabels.map(([id, label], index) => ({
      id,
      label,
      summary: `${label}：围绕「${text}」生成第 ${index + 1} 段结构。`,
    })),
  }
}

function buildOriginalScript(
  sourceText: string,
  packageId: VideoPackageId,
  durationPreset: VideoDurationPreset
) {
  const text = cleanText(sourceText, "用户提供主题")
  return [
    `【原创脚本 · ${packageLabel(packageId)} · ${durationPreset}】`,
    `开头：如果你还在手动处理「${text}」，先停一下。`,
    "痛点：同样的素材，别人已经用结构化流程做出连续爆款。",
    "演示：第一步拆钩子，第二步改成自己的案例，第三步补上结果对比。",
    "证明：把原来的搬运冲动变成原创表达，节奏保留，内容重写。",
    "转化：收藏这套流程，下次直接按这个结构生成脚本和分镜。",
  ].join("\n")
}

function readLineAfterLabel(script: string, labels: string[]) {
  const lines = script
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const label of labels) {
    const found = lines.find((line) => line.startsWith(label))
    if (found) return found.replace(label, "").trim()
  }

  return lines.find((line) => !line.startsWith("【")) || ""
}

function findLabeledLine(script: string, labels: string[]) {
  const lines = script
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const label of labels) {
    const found = lines.find((line) => line.startsWith(label))
    if (found) return found.replace(label, "").trim()
  }

  return ""
}

function readReusableElements(script: string) {
  const value = findLabeledLine(script, ["可复用元素：", "复用元素："])
  if (!value) return []
  return value
    .split(/[、,，/｜|]/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

function extractOriginalScript(script: string) {
  const markerMatch = script.match(/(?:原创完整脚本|完整脚本|原创脚本)[:：]\s*/u)
  if (!markerMatch || markerMatch.index === undefined) return script

  const start = markerMatch.index + markerMatch[0].length
  const extracted = script.slice(start).trim()
  return extracted || script
}

function buildStructureSummaryFromScript(
  sourceText: string,
  script: string
): ViralStructureSummary {
  const fallback = buildStructureSummary(sourceText)
  const hook =
    findLabeledLine(script, ["开头钩子："]) ||
    readLineAfterLabel(script, ["开头：", "钩子："])
  const painPoint = readLineAfterLabel(script, ["痛点放大：", "痛点："])
  const demo = readLineAfterLabel(script, ["演示过程：", "演示："])
  const proof = readLineAfterLabel(script, ["结果证明：", "证明："])
  const conversion = readLineAfterLabel(script, [
    "结尾行动：",
    "转化：",
    "结尾：",
    "行动：",
  ])
  const title = script.match(/【(.+?)】/u)?.[1] || ""
  const reusableElements = readReusableElements(script)

  return {
    ...fallback,
    hook: hook || fallback.hook,
    painPoint: painPoint || fallback.painPoint,
    proof: proof || fallback.proof,
    conversion: conversion || fallback.conversion,
    rhythm: title || fallback.rhythm,
    reusableElements: reusableElements.length
      ? reusableElements
      : fallback.reusableElements,
    sections: fallback.sections.map((section) => ({
      ...section,
      summary:
        section.id === "hook" && hook
          ? hook
          : section.id === "pain" && painPoint
            ? painPoint
            : section.id === "proof" && proof
              ? proof
              : section.id === "conversion" && conversion
                ? conversion
                : section.id === "demo" && demo
                  ? demo
                  : section.summary,
    })),
  }
}

function buildSentenceTimeline(script: string) {
  return script
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((text, index) => ({
      id: `sentence_${String(index + 1).padStart(2, "0")}`,
      startMs: index * 7000,
      endMs: (index + 1) * 7000,
      text,
    }))
}

export function createModelVideoAnalysisDraft({
  sourceText,
  modelText,
}: CreateModelVideoAnalysisDraftInput): VideoAnalysisDraft {
  const cleanedSource = cleanText(sourceText, "用户提供来源")
  const modelScript = cleanScriptText(modelText)
  const originalScript = cleanScriptText(extractOriginalScript(modelScript))
  const fallbackScript = buildOriginalScript(
    cleanedSource,
    "stickman_meme",
    "45-60s"
  )
  const script = originalScript || fallbackScript

  return {
    status: "ready_for_edit",
    editable: true,
    sourceText: cleanedSource,
    structureSummary: buildStructureSummaryFromScript(
      cleanedSource,
      modelScript || script
    ),
    sentenceTimeline: buildSentenceTimeline(script),
    originalScript: script,
  }
}

export function createManualVideoAnalysisDraft({
  topic,
  packageId,
  durationPreset,
}: CreateManualVideoAnalysisDraftInput): VideoAnalysisDraft {
  const sourceText = cleanText(topic, "用户手动输入主题")
  const originalScript = buildOriginalScript(sourceText, packageId, durationPreset)
  return {
    status: "ready_for_edit",
    editable: true,
    sourceText,
    structureSummary: buildStructureSummary(sourceText),
    sentenceTimeline: buildSentenceTimeline(originalScript),
    originalScript,
  }
}

export function createPastedScriptDraft({
  script,
  sourceLabel = "用户粘贴脚本",
}: CreatePastedScriptDraftInput): VideoAnalysisDraft {
  const originalScript = cleanScriptText(script, "请粘贴完整脚本。")
  const sourceText = cleanText(sourceLabel, "用户粘贴脚本")
  return {
    status: "ready_for_edit",
    editable: true,
    sourceText,
    structureSummary: buildStructureSummaryFromScript(sourceText, originalScript),
    sentenceTimeline: buildSentenceTimeline(originalScript),
    originalScript,
  }
}

export function buildScriptGenerationRequest({
  profile,
  sourceText,
  durationPreset,
  packageId,
  rewriteMode = "rewrite_b",
  model = profile.model,
}: BuildScriptGenerationRequestInput): ScriptGenerationRequest {
  const cleanedSource = cleanText(sourceText, "无转写内容，按用户主题生成")
  const rewriteInstruction =
    rewriteMode === "original" ? rewriteInstructions.rewrite_b : rewriteInstructions[rewriteMode]
  return {
    model: model.trim() || "claude-opus-4-6-thinking",
    messages: [
      {
        role: "system",
        content:
          "你是她火视频工厂的爆款短视频脚本助手，只做结构分析和原创改写，不能搬运原视频画面或原文案。",
      },
      {
        role: "user",
        content: [
          "请基于以下来源生成原创短视频脚本。",
          `套餐：${packageLabel(packageId)}`,
          `目标时长：${durationPreset}`,
          `改写模式：${rewriteInstruction}`,
          "不要直接复述来源文案，要先提炼结构，再改成一条新的火柴人爆款口播。",
          "严格按以下格式输出，字段名不要改：",
          "结构摘要：",
          "开头钩子：",
          "痛点放大：",
          "演示过程：",
          "结果证明：",
          "结尾行动：",
          "可复用元素：三秒钩子、前后对比、步骤清单",
          "原创完整脚本：",
          `来源内容：${cleanedSource}`,
        ].join("\n"),
      },
    ],
    temperature: 0.35,
    apiBaseUrl: profile.apiBaseUrl,
    apiKey: profile.apiKey,
    profileId: profile.profileId,
  }
}

export function createScriptGenerationLogEntry(
  request: ScriptGenerationRequest
): ScriptGenerationLogEntry {
  const sourceMessage = request.messages.find((message) => message.role === "user")
  return {
    kind: "script_generation_request",
    profileId: request.profileId,
    apiBaseUrl: request.apiBaseUrl,
    model: request.model,
    sourceLength: sourceMessage?.content.length || 0,
  }
}

export function createScriptGenerationFailureDraft({
  sourceText,
  reason,
}: CreateScriptGenerationFailureDraftInput): VideoAnalysisDraft {
  const cleanedSource = cleanText(sourceText, "没有可用转写，用户可手动输入脚本。")
  const originalScript = [
    "【手动编辑脚本】",
    cleanedSource,
    "",
    "模型生成暂不可用，请在这里补齐开头钩子、痛点、演示、证明和转化口播。",
  ].join("\n")
  return {
    status: "needs_manual_edit",
    editable: true,
    sourceText: cleanedSource,
    structureSummary: buildStructureSummary(cleanedSource),
    sentenceTimeline: buildSentenceTimeline(originalScript),
    originalScript,
    failureReason: cleanText(reason, "模型请求失败"),
  }
}
