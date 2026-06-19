import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import ts from "typescript"

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)

async function importVideoAnalysisModule() {
  const sourcePath = path.join(projectRoot, "lib", "video-analysis.ts")
  const source = await readFile(sourcePath, "utf8")
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      strict: true,
    },
    fileName: sourcePath,
  })
  const outDir = path.join(tmpdir(), "ta-huo-video-analysis-tests")
  await mkdir(outDir, { recursive: true })
  const compiledPath = path.join(outDir, `video-analysis-${Date.now()}.mjs`)
  await writeFile(compiledPath, output.outputText, "utf8")
  return import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`)
}

test("manual topic analysis creates structure summary and editable script", async () => {
  const { createManualVideoAnalysisDraft } = await importVideoAnalysisModule()
  const draft = createManualVideoAnalysisDraft({
    topic: "AI 工具帮电商店主一键生成短视频",
    packageId: "stickman_meme",
    durationPreset: "45-60s",
  })

  assert.match(draft.structureSummary.hook, /AI 工具/)
  assert.equal(draft.structureSummary.sections.length, 6)
  assert.equal(draft.sentenceTimeline.length, 6)
  assert.equal(draft.sentenceTimeline[0].startMs, 0)
  assert.match(draft.originalScript, /原创/)
  assert.equal(draft.editable, true)
  assert.equal(draft.status, "ready_for_edit")
})

test("model request uses selected text profile and strips credentials from logs", async () => {
  const {
    buildScriptGenerationRequest,
    createScriptGenerationLogEntry,
  } = await importVideoAnalysisModule()
  const fixtureCredential = "fixture_text_secret"
  const request = buildScriptGenerationRequest({
    profile: {
      service: "text_model",
      profileId: "text-main",
      apiBaseUrl: "https://text.example.com/v1",
      model: "claude-opus-4-6-thinking",
      apiKey: fixtureCredential,
    },
    sourceText: "开头 3 秒制造焦虑，随后演示工具前后对比。",
    durationPreset: "60-90s",
    packageId: "tool_showcase",
  })
  const logEntry = createScriptGenerationLogEntry(request)

  assert.equal(request.apiBaseUrl, "https://text.example.com/v1")
  assert.equal(request.model, "claude-opus-4-6-thinking")
  assert.equal(request.apiKey, fixtureCredential)
  assert.match(JSON.stringify(request.messages), /原创短视频脚本/)
  assert.match(JSON.stringify(request.messages), /严格按以下格式/)
  assert.equal(JSON.stringify(logEntry).includes(fixtureCredential), false)
  assert.equal(logEntry.profileId, "text-main")
})

test("model response can become an editable original script draft", async () => {
  const { createModelVideoAnalysisDraft } = await importVideoAnalysisModule()
  const draft = createModelVideoAnalysisDraft({
    sourceText: "原文：每天熬夜剪视频，结果播放只有几十。",
    modelText:
      "【原创脚本 · 火柴人爆梗 · 45-60s】\n开头：别再硬剪了，先把爆点拆出来。\n痛点：你以为差的是软件，其实差的是节奏。\n演示：三秒钩子、十秒反差、最后给结果。\n转化：收藏这套火柴人爆款结构。",
  })

  assert.equal(draft.status, "ready_for_edit")
  assert.equal(draft.editable, true)
  assert.match(draft.originalScript, /别再硬剪/)
  assert.match(draft.structureSummary.hook, /别再硬剪/)
  assert.match(draft.structureSummary.rhythm, /45-60s/)
  assert.ok(draft.sentenceTimeline.length >= 4)
})

test("structured model response separates analysis from original script", async () => {
  const { createModelVideoAnalysisDraft } = await importVideoAnalysisModule()
  const draft = createModelVideoAnalysisDraft({
    sourceText: "原文：骨头怎么切、镜头怎么推。",
    modelText: [
      "结构摘要：",
      "开头钩子：先把骨头切法这个冲突扔出来。",
      "痛点放大：新手照着剪却不知道镜头顺序。",
      "结果证明：按三段式做完就能直接出片。",
      "结尾行动：保存这个火柴人结构。",
      "可复用元素：三秒钩子、镜头推进、结尾口播",
      "原创完整脚本：",
      "开头：别再照抄别人的骨头梗，先把镜头顺序换掉。",
      "痛点：你差的不是素材，是让观众看懂的节奏。",
      "证明：三秒抛冲突，十秒拆步骤，最后给成片效果。",
      "转化：收藏这套火柴人爆款结构，下一条直接套。",
    ].join("\n"),
  })

  assert.match(draft.structureSummary.hook, /骨头切法/)
  assert.match(draft.structureSummary.painPoint, /镜头顺序/)
  assert.match(draft.structureSummary.proof, /三段式/)
  assert.match(draft.originalScript, /^开头：别再照抄/)
  assert.equal(draft.originalScript.includes("结构摘要"), false)
  assert.deepEqual(draft.structureSummary.reusableElements, [
    "三秒钩子",
    "镜头推进",
    "结尾口播",
  ])
})

test("pasted script passthrough creates draft without a text model request", async () => {
  const {
    createPastedScriptDraft,
    shouldRequestTextModelForScriptMode,
  } = await importVideoAnalysisModule()
  const script = "开头：别再熬夜剪片。\n演示：把脚本粘进她火，直接生成分镜。\n转化：收藏这个流程。"
  const draft = createPastedScriptDraft({
    script,
    rewriteMode: "original",
    sourceLabel: "用户粘贴脚本",
  })

  assert.equal(shouldRequestTextModelForScriptMode("original"), false)
  assert.equal(draft.status, "ready_for_edit")
  assert.equal(draft.editable, true)
  assert.equal(draft.sourceText, "用户粘贴脚本")
  assert.equal(draft.originalScript, script)
  assert.match(draft.structureSummary.hook, /别再熬夜/)
  assert.equal(draft.sentenceTimeline.length, 3)
})

test("pasted script sentence timeline excludes visual directions and splits paragraphs", async () => {
  const { createPastedScriptDraft } = await importVideoAnalysisModule()
  const draft = createPastedScriptDraft({
    script:
      "【画面：火柴人躺床刷手机】\n豆包加炎灵加剪映，一晚上搞定一部漫剧。第一，把小说丢进去生成全套资产。",
    rewriteMode: "original",
  })

  assert.deepEqual(
    draft.sentenceTimeline.map((cue) => cue.text),
    [
      "豆包加炎灵加剪映，一晚上搞定一部漫剧。",
      "第一，把小说丢进去生成全套资产。",
    ]
  )
})

test("rewrite strengths expose A B C channels with B as full auto default", async () => {
  const {
    SCRIPT_REWRITE_MODE_OPTIONS,
    buildScriptGenerationRequest,
    createDefaultScriptWorkflowSettings,
    normalizeScriptWorkflowSettings,
    shouldRequestTextModelForScriptMode,
  } = await importVideoAnalysisModule()

  assert.deepEqual(
    SCRIPT_REWRITE_MODE_OPTIONS.map((option) => option.id),
    ["original", "rewrite_a", "rewrite_b", "rewrite_c"]
  )
  assert.equal(createDefaultScriptWorkflowSettings().fullAutoRewriteMode, "rewrite_b")
  assert.equal(
    normalizeScriptWorkflowSettings({ fullAutoRewriteMode: "rewrite_c" })
      .fullAutoRewriteMode,
    "rewrite_c"
  )
  assert.equal(shouldRequestTextModelForScriptMode("rewrite_a"), true)
  assert.equal(shouldRequestTextModelForScriptMode("rewrite_b"), true)
  assert.equal(shouldRequestTextModelForScriptMode("rewrite_c"), true)

  const request = buildScriptGenerationRequest({
    profile: {
      service: "text_model",
      profileId: "text-main",
      apiBaseUrl: "https://text.example.com/v1",
      model: "claude-opus-4-6-thinking",
      apiKey: "fixture_text_secret",
    },
    sourceText: "开头：别再熬夜剪片。\n演示：把脚本粘进她火，直接生成分镜。",
    durationPreset: "45-60s",
    packageId: "stickman_meme",
    rewriteMode: "rewrite_c",
  })

  const prompt = JSON.stringify(request.messages)
  assert.match(prompt, /C 档/)
  assert.match(prompt, /强重构/)
  assert.match(prompt, /不要直接复述来源文案/)
})

test("product conversion board locks product terms and downgrades risky copy", async () => {
  const { buildScriptGenerationRequest } = await importVideoAnalysisModule()
  const request = buildScriptGenerationRequest({
    profile: {
      service: "text_model",
      profileId: "text-main",
      apiBaseUrl: "https://text.example.com/v1",
      model: "claude-opus-4-6-thinking",
      apiKey: "fixture_text_secret",
    },
    sourceText:
      "豆包加炎灵加剪映，一晚上搞定一部漫剧，日入八百，新手直接抄作业。",
    durationPreset: "60-90s",
    packageId: "tool_showcase",
    rewriteMode: "rewrite_b",
    copywritingBoard: "product_conversion",
    conversionTheme: "豆包 + 炎灵 + 剪映",
  })

  const prompt = JSON.stringify(request.messages)
  assert.match(prompt, /文案板子/)
  assert.match(prompt, /产品引流/)
  assert.match(prompt, /引流产品\/主题：豆包 \+ 炎灵 \+ 剪映/)
  assert.match(prompt, /锁定产品词：豆包、炎灵、剪映/)
  assert.match(prompt, /五段式口播/)
  assert.match(prompt, /钩子/)
  assert.match(prompt, /可信经历/)
  assert.match(prompt, /三步流程/)
  assert.match(prompt, /方法价值/)
  assert.match(prompt, /评论区行动/)
  assert.match(prompt, /口语化/)
  assert.match(prompt, /短句/)
  assert.match(prompt, /日入|月入/)
  assert.match(prompt, /保证|稳赚/)
  assert.match(prompt, /加微信|加群/)
  assert.match(prompt, /粗口/)
})

test("generic rewrite board does not force product terms or brand overlays", async () => {
  const { buildScriptGenerationRequest } = await importVideoAnalysisModule()
  const request = buildScriptGenerationRequest({
    profile: {
      service: "text_model",
      profileId: "text-main",
      apiBaseUrl: "https://text.example.com/v1",
      model: "claude-opus-4-6-thinking",
      apiKey: "fixture_text_secret",
    },
    sourceText: "普通剧情号复盘一个高反差故事，结尾提醒观众关注后续。",
    durationPreset: "45-60s",
    packageId: "stickman_meme",
    rewriteMode: "rewrite_b",
    copywritingBoard: "generic_rewrite",
  })

  const prompt = JSON.stringify(request.messages)
  assert.match(prompt, /文案板子/)
  assert.match(prompt, /通用洗稿/)
  assert.doesNotMatch(prompt, /豆包|炎灵|剪映/)
  assert.doesNotMatch(prompt, /引流产品|产品图标|品牌贴片|logo/)
})

test("model failure returns manual edit fallback without blocking workflow", async () => {
  const { createScriptGenerationFailureDraft } = await importVideoAnalysisModule()
  const draft = createScriptGenerationFailureDraft({
    sourceText: "没有可用转写，用户只提供主题。",
    reason: "接口超时",
  })

  assert.equal(draft.status, "needs_manual_edit")
  assert.equal(draft.editable, true)
  assert.match(draft.originalScript, /没有可用转写/)
  assert.match(draft.failureReason, /接口超时/)
})
