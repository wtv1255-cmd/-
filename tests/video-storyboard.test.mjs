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

async function importStoryboardModule() {
  const sourcePath = path.join(projectRoot, "lib", "video-storyboard.ts")
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
  const outDir = path.join(tmpdir(), "ta-huo-video-storyboard-tests")
  await mkdir(outDir, { recursive: true })
  const compiledPath = path.join(outDir, `video-storyboard-${Date.now()}.mjs`)
  await writeFile(compiledPath, output.outputText, "utf8")
  return import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`)
}

test("storyboard exposes three packages and four duration presets", async () => {
  const { VIDEO_PACKAGE_OPTIONS, VIDEO_DURATION_OPTIONS } =
    await importStoryboardModule()

  assert.deepEqual(
    VIDEO_PACKAGE_OPTIONS.map((item) => item.id),
    ["stickman_meme", "tool_showcase", "cinematic_showcase"]
  )
  assert.deepEqual(
    VIDEO_DURATION_OPTIONS.map((item) => item.id),
    ["30-45s", "45-60s", "60-90s", "120s"]
  )
})

test("combined packages generate ordered editable storyboard shots", async () => {
  const { createStoryboardFromScript } = await importStoryboardModule()
  const shots = createStoryboardFromScript({
    script:
      "开头先抛出痛点。\n演示一键生成流程。\n展示结果对比。\n结尾引导收藏。",
    packageIds: ["stickman_meme", "tool_showcase"],
    durationPreset: "45-60s",
  })

  assert.equal(shots.length, 4)
  assert.equal(shots[0].startMs, 0)
  assert.equal(shots.at(-1).endMs, 60000)
  assert.equal(shots.some((shot) => shot.visualType === "stickman"), true)
  assert.equal(shots.some((shot) => shot.visualType === "yanling_clip"), true)
  assert.equal(shots.every((shot) => shot.status === "draft"), true)
})

test("stickman prompt editor payload is simple and editable", async () => {
  const { createStickmanPromptEditorDraft } = await importStoryboardModule()
  const editor = createStickmanPromptEditorDraft({
    shotId: "shot_01",
    voiceText: "小白也能三步做出短视频",
    visualDescription: "火柴人站在白板前吐槽复杂流程",
  })
  const serialized = JSON.stringify(editor)

  assert.equal(editor.shotId, "shot_01")
  assert.match(editor.prompt, /黑白火柴人/)
  assert.match(editor.negativePrompt, /复杂背景/)
  assert.equal(editor.editable, true)
  assert.equal(serialized.includes("canvas"), false)
  assert.equal(serialized.includes("nodeGraph"), false)
})
