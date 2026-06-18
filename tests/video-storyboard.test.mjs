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

test("storyboard image prompts avoid text logo and dialogue while preserving product workflow intent", async () => {
  const { createStoryboardFromScript } = await importStoryboardModule()
  const shots = createStoryboardFromScript({
    script:
      "第一步，把小说丢进豆包拆成脚本。\n第二步，用炎灵生成画面资产。\n第三步，导入剪映完成精剪。",
    packageIds: ["stickman_meme", "tool_showcase"],
    durationPreset: "45-60s",
    copywritingBoard: "product_conversion",
    conversionTheme: "豆包 + 炎灵 + 剪映",
  })
  const joinedPrompts = shots.map((shot) => shot.prompt).join("\n")
  const joinedNegative = shots.map((shot) => shot.negativePrompt).join("\n")

  assert.match(joinedPrompts, /产品工作流|工具流程/)
  assert.match(joinedPrompts, /不画.*logo|不要.*logo/i)
  assert.match(joinedNegative, /logo/i)
  assert.match(joinedNegative, /字幕|文字/)
  assert.match(joinedNegative, /对话框|气泡/)
  assert.doesNotMatch(joinedPrompts, /豆包|炎灵|剪映/)
  assert.doesNotMatch(joinedPrompts, /品牌贴片|绘制.*图标/)
})

test("non product storyboard does not inject product names or overlay requirements", async () => {
  const { createStoryboardFromScript } = await importStoryboardModule()
  const shots = createStoryboardFromScript({
    script: "开头展示焦虑。\n中段展示三步习惯。\n结尾提醒收藏。",
    packageIds: ["stickman_meme"],
    durationPreset: "30-45s",
    copywritingBoard: "generic_rewrite",
  })
  const positivePromptPayload = JSON.stringify(
    shots.map((shot) => ({
      voiceText: shot.voiceText,
      visualDescription: shot.visualDescription,
      prompt: shot.prompt,
    }))
  )

  assert.doesNotMatch(positivePromptPayload, /豆包|炎灵|剪映/)
  assert.doesNotMatch(positivePromptPayload, /品牌贴片|产品图标|overlay/)
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
  assert.match(editor.prompt, /不要.*文字|避免.*文字/)
  assert.match(editor.negativePrompt, /复杂背景/)
  assert.match(editor.negativePrompt, /logo/i)
  assert.match(editor.negativePrompt, /字幕|文字/)
  assert.match(editor.negativePrompt, /对话框|气泡/)
  assert.equal(editor.editable, true)
  assert.equal(serialized.includes("canvas"), false)
  assert.equal(serialized.includes("nodeGraph"), false)
})

test("deleting a storyboard shot reindexes later shots and keeps generated image tags aligned", async () => {
  const { deleteStoryboardShotAndReindex } = await importStoryboardModule()
  const result = deleteStoryboardShotAndReindex({
    shotId: "shot_02",
    shots: [
      {
        id: "shot_01",
        startMs: 0,
        endMs: 1000,
        voiceText: "第一句",
        visualType: "stickman",
        visualDescription: "第一张",
        prompt: "prompt 1",
        negativePrompt: "negative",
        assetIds: ["asset_01"],
        status: "ready",
      },
      {
        id: "shot_02",
        startMs: 1000,
        endMs: 2500,
        voiceText: "第二句",
        visualType: "stickman",
        visualDescription: "第二张",
        prompt: "prompt 2",
        negativePrompt: "negative",
        assetIds: ["asset_02"],
        status: "ready",
      },
      {
        id: "shot_03",
        startMs: 2500,
        endMs: 4000,
        voiceText: "第三句",
        visualType: "stickman",
        visualDescription: "第三张",
        prompt: "prompt 3 edited",
        negativePrompt: "negative",
        assetIds: ["asset_03"],
        status: "ready",
      },
    ],
    assets: [
      {
        id: "asset_01",
        kind: "stickman_image",
        displayName: "shot-01.png",
        file: { path: "shot-01.png" },
        tags: ["generated_image", "shot_01"],
      },
      {
        id: "asset_02",
        kind: "stickman_image",
        displayName: "shot-02.png",
        file: { path: "shot-02.png" },
        tags: ["generated_image", "shot_02"],
      },
      {
        id: "asset_03",
        kind: "stickman_image",
        displayName: "shot-03.png",
        file: { path: "shot-03.png" },
        tags: ["generated_image", "shot_03"],
      },
    ],
  })

  assert.deepEqual(
    result.shots.map((shot) => [
      shot.id,
      shot.startMs,
      shot.endMs,
      shot.prompt,
      shot.assetIds,
    ]),
    [
      ["shot_01", 0, 1000, "prompt 1", ["asset_01"]],
      ["shot_02", 1000, 2500, "prompt 3 edited", ["asset_03"]],
    ]
  )
  assert.deepEqual(result.removedAssetIds, ["asset_02"])
  assert.deepEqual(result.shotIdMap, {
    shot_01: "shot_01",
    shot_03: "shot_02",
  })
  assert.deepEqual(
    result.assets.map((asset) => [asset.id, asset.tags]),
    [
      ["asset_01", ["generated_image", "shot_01"]],
      ["asset_03", ["generated_image", "shot_02"]],
    ]
  )
})
