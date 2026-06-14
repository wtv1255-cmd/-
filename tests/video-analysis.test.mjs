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
      apiKey: fixtureCredential,
    },
    sourceText: "开头 3 秒制造焦虑，随后演示工具前后对比。",
    durationPreset: "60-90s",
    packageId: "tool_showcase",
  })
  const logEntry = createScriptGenerationLogEntry(request)

  assert.equal(request.apiBaseUrl, "https://text.example.com/v1")
  assert.equal(request.apiKey, fixtureCredential)
  assert.match(JSON.stringify(request.messages), /原创短视频脚本/)
  assert.equal(JSON.stringify(logEntry).includes(fixtureCredential), false)
  assert.equal(logEntry.profileId, "text-main")
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
