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

async function importVideoAssetsModule() {
  const sourcePath = path.join(projectRoot, "lib", "video-assets.ts")
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
  const outDir = path.join(tmpdir(), "ta-huo-video-assets-tests")
  await mkdir(outDir, { recursive: true })
  const compiledPath = path.join(outDir, `video-assets-${Date.now()}.mjs`)
  await writeFile(compiledPath, output.outputText, "utf8")
  return import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`)
}

test("video asset categories cover image clip audio and cover assets", async () => {
  const { VIDEO_ASSET_CATEGORY_OPTIONS } = await importVideoAssetsModule()
  assert.deepEqual(
    VIDEO_ASSET_CATEGORY_OPTIONS.map((item) => item.kind),
    ["stickman_image", "yanling_clip", "showcase_clip", "bgm", "sfx", "cover_image"]
  )
})

test("imported assets are task scoped file refs without binary payloads", async () => {
  const { createImportedVideoAsset, serializeVideoAssetsForSnapshot } =
    await importVideoAssetsModule()
  const asset = createImportedVideoAsset({
    taskId: "task_01",
    kind: "yanling_clip",
    filename: "demo clip.mp4",
    bytes: 1024 * 1024 * 80,
    mimeType: "video/mp4",
    durationMs: 12000,
  })
  const serialized = serializeVideoAssetsForSnapshot([asset])

  assert.equal(asset.kind, "yanling_clip")
  assert.equal(asset.file.path, "%APPDATA%/她火/tasks/task_01/yanling_clip/demo-clip.mp4")
  assert.equal(serialized.includes("blob"), false)
  assert.equal(serialized.includes("dataUrl"), false)
  assert.equal(serialized.includes("arrayBuffer"), false)
})

test("image generation request uses image profile and sanitized logs", async () => {
  const { buildVideoImageGenerationRequest, createVideoAssetLogEntry } =
    await importVideoAssetsModule()
  const fixtureCredential = "fixture_image_secret"
  const request = buildVideoImageGenerationRequest({
    profile: {
      service: "image_generation",
      profileId: "image-main",
      apiBaseUrl: "https://image.example.com/v1",
      apiKey: fixtureCredential,
    },
    prompt: "黑白火柴人白底黑线，震惊表情",
    negativePrompt: "复杂背景",
  })
  const logEntry = createVideoAssetLogEntry(request)

  assert.equal(request.apiBaseUrl, "https://image.example.com/v1")
  assert.equal(request.apiKey, fixtureCredential)
  assert.equal(JSON.stringify(logEntry).includes(fixtureCredential), false)
  assert.equal(logEntry.profileId, "image-main")
})

test("removing an imported asset does not delete unrelated asset records", async () => {
  const { createImportedVideoAsset, removeVideoAssetById } =
    await importVideoAssetsModule()
  const first = createImportedVideoAsset({
    taskId: "task_01",
    kind: "stickman_image",
    filename: "shot-01.png",
    mimeType: "image/png",
  })
  const second = createImportedVideoAsset({
    taskId: "task_01",
    kind: "bgm",
    filename: "loop.mp3",
    mimeType: "audio/mpeg",
  })

  const remaining = removeVideoAssetById([first, second], first.id)

  assert.deepEqual(
    remaining.map((asset) => asset.id),
    [second.id]
  )
})
