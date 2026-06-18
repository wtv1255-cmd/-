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

async function importProjectModule(modulePath, outName) {
  const sourcePath = path.join(projectRoot, modulePath)
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
  const outDir = path.join(tmpdir(), "ta-huo-video-script-workflow-tests")
  await mkdir(outDir, { recursive: true })
  const compiledPath = path.join(outDir, `${outName}-${Date.now()}.mjs`)
  await writeFile(compiledPath, output.outputText, "utf8")
  return import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`)
}

test("pasted script can skip parsing and continue to storyboard voice and timeline", async () => {
  const { createPastedScriptDraft } = await importProjectModule(
    "lib/video-analysis.ts",
    "video-analysis"
  )
  const { createStoryboardFromScript } = await importProjectModule(
    "lib/video-storyboard.ts",
    "video-storyboard"
  )
  const { createVoicePlanFromScript, createUnifiedVideoTimeline } =
    await importProjectModule("lib/video-timeline.ts", "video-timeline")

  const draft = createPastedScriptDraft({
    script:
      "开头：别再熬夜剪片。\n演示：粘贴脚本后直接生成分镜。\n证明：字幕和配音按句子时间轴继续。\n转化：收藏这个流程。",
    rewriteMode: "original",
  })
  const storyboard = createStoryboardFromScript({
    script: draft.originalScript,
    packageIds: ["stickman_meme"],
    durationPreset: "45-60s",
  })
  const voice = createVoicePlanFromScript({
    taskId: "task_script_passthrough",
    script: draft.originalScript,
    durationPreset: "45-60s",
  })
  const timeline = createUnifiedVideoTimeline({
    taskId: "task_script_passthrough",
    voice,
    storyboard,
  })

  assert.equal(draft.status, "ready_for_edit")
  assert.equal(storyboard.length, 4)
  assert.equal(voice.subtitles.length, 4)
  assert.equal(timeline.durationMs, 60000)
  assert.deepEqual(
    timeline.tracks.map((track) => track.type),
    ["visual", "voice", "subtitle", "sfx"]
  )
})
