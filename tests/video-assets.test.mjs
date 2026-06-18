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

test("video asset categories cover image clip audio cover and brand sticker assets", async () => {
  const { VIDEO_ASSET_CATEGORY_OPTIONS } = await importVideoAssetsModule()
  assert.deepEqual(
    VIDEO_ASSET_CATEGORY_OPTIONS.map((item) => item.kind),
    [
      "stickman_image",
      "yanling_clip",
      "showcase_clip",
      "brand_sticker",
      "bgm",
      "sfx",
      "cover_image",
    ]
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
      model: "gpt-image-2-4K",
      apiKey: fixtureCredential,
    },
    prompt: "黑白火柴人白底黑线，震惊表情",
    negativePrompt: "复杂背景",
  })
  const logEntry = createVideoAssetLogEntry(request)

  assert.equal(request.apiBaseUrl, "https://image.example.com/v1")
  assert.equal(request.model, "gpt-image-2-4K")
  assert.equal(request.apiKey, fixtureCredential)
  assert.equal(JSON.stringify(logEntry).includes(fixtureCredential), false)
  assert.equal(logEntry.profileId, "image-main")
})

test("stickman storyboard image generation retries transient failures", async () => {
  const { generateStickmanStoryboardAsset } = await importVideoAssetsModule()
  let attempts = 0
  const result = await generateStickmanStoryboardAsset({
    taskId: "task_01",
    shot: {
      id: "shot_01",
      startMs: 0,
      endMs: 2000,
      voiceText: "开头",
      visualType: "stickman",
      visualDescription: "火柴人震惊",
      prompt: "黑白火柴人震惊表情",
      negativePrompt: "复杂背景",
      assetIds: [],
      status: "needs_asset",
    },
    profile: {
      service: "image_generation",
      profileId: "image-main",
      apiBaseUrl: "https://image.example.com/v1",
      model: "gpt-image-2-4K",
      apiKey: "fixture",
    },
    requestImages: async () => {
      attempts += 1
      if (attempts < 3) throw new Error("HTTP 502")
      return [{ id: "img_01", dataUrl: "data:image/png;base64,AA==", mimeType: "image/png" }]
    },
    wait: async () => {},
  })

  assert.equal(attempts, 3)
  assert.equal(result.asset.kind, "stickman_image")
  assert.equal(result.asset.file.filename, "01_shot_01_0-2s_stickman.png")
  assert.deepEqual(result.asset.tags, ["shot_01", "generated_image", "image-main"])
  assert.equal(result.image.dataUrl, "data:image/png;base64,AA==")
})

test("image generation presets default to vertical 9:16 with advanced overrides", async () => {
  const {
    IMAGE_GENERATION_PRESETS,
    normalizeVideoImageGenerationSettings,
    buildVideoImageGenerationRequest,
  } = await importVideoAssetsModule()
  const settings = normalizeVideoImageGenerationSettings({
    presetId: "vertical_9_16",
    advanced: {
      size: "1024x1792",
      quality: "high",
      styleStrength: 68,
    },
  })
  const request = buildVideoImageGenerationRequest({
    profile: {
      service: "image_generation",
      profileId: "image-main",
      apiBaseUrl: "https://image.example.com/v1",
      model: "gpt-image-2-4K",
      apiKey: "fixture",
    },
    prompt: "黑白火柴人震惊表情",
    negativePrompt: "复杂背景",
    settings,
  })

  assert.equal(IMAGE_GENERATION_PRESETS[0].id, "vertical_9_16")
  assert.equal(settings.aspectRatio, "9:16")
  assert.equal(settings.size, "1024x1792")
  assert.equal(settings.quality, "high")
  assert.equal(settings.styleStrength, 68)
  assert.equal(request.aspectRatio, "9:16")
  assert.equal(request.size, "1024x1792")
})

test("per-shot generation plan skips successful shots unless regenerate is explicit", async () => {
  const {
    createPerShotImageGenerationPlan,
    toggleVideoAssetPreviewExpansion,
  } = await importVideoAssetsModule()
  const shots = [
    { id: "shot_01", status: "ready", assetIds: ["asset_01"] },
    { id: "shot_02", status: "needs_asset", assetIds: [] },
    { id: "shot_03", status: "ready", assetIds: ["asset_03"] },
  ]
  const fillPlan = createPerShotImageGenerationPlan({
    shots,
    action: "fill_failed",
  })
  const regeneratePlan = createPerShotImageGenerationPlan({
    shots,
    action: "regenerate",
    shotId: "shot_03",
  })

  assert.deepEqual(
    fillPlan.targets.map((shot) => shot.id),
    ["shot_02"]
  )
  assert.deepEqual(
    regeneratePlan.targets.map((shot) => shot.id),
    ["shot_03"]
  )
  assert.equal(regeneratePlan.preserveSuccessfulAssets, true)
  assert.deepEqual(toggleVideoAssetPreviewExpansion([], "asset_03"), ["asset_03"])
  assert.deepEqual(toggleVideoAssetPreviewExpansion(["asset_03"], "asset_03"), [])
})

test("per-shot generation plan can regenerate every stickman shot", async () => {
  const { createPerShotImageGenerationPlan } = await importVideoAssetsModule()
  const shots = [
    { id: "shot_01", status: "ready", assetIds: ["asset_01"] },
    { id: "shot_02", status: "needs_asset", assetIds: [] },
    { id: "shot_03", status: "ready", assetIds: ["asset_03"] },
  ]

  const regenerateAllPlan = createPerShotImageGenerationPlan({
    shots,
    action: "regenerate_all",
  })

  assert.deepEqual(
    regenerateAllPlan.targets.map((shot) => shot.id),
    ["shot_01", "shot_02", "shot_03"]
  )
  assert.equal(regenerateAllPlan.preserveSuccessfulAssets, false)
})

test("regeneration batch clears old generated images and marks targets missing first", async () => {
  const { prepareStickmanRegenerationBatch } = await importVideoAssetsModule()
  const shot01Asset = {
    id: "old_asset_01",
    kind: "stickman_image",
    displayName: "old-01.png",
    file: { path: "old-01.png" },
    tags: ["shot_01", "generated_image"],
  }
  const shot02Asset = {
    id: "old_asset_02",
    kind: "stickman_image",
    displayName: "old-02.png",
    file: { path: "old-02.png" },
    tags: ["shot_02", "generated_image"],
  }
  const externalAsset = {
    id: "manual_cover",
    kind: "cover_image",
    displayName: "cover.png",
    file: { path: "cover.png" },
    tags: ["shot_01"],
  }

  const prepared = prepareStickmanRegenerationBatch({
    shots: [
      { id: "shot_01", status: "ready", assetIds: ["old_asset_01"] },
      { id: "shot_02", status: "ready", assetIds: ["old_asset_02"] },
      { id: "shot_03", status: "ready", assetIds: ["manual_asset"] },
    ],
    assets: [shot01Asset, shot02Asset, externalAsset],
    targetShotIds: ["shot_01", "shot_03"],
  })

  assert.deepEqual(
    prepared.assets.map((asset) => asset.id),
    ["old_asset_02", "manual_cover"]
  )
  assert.deepEqual(
    prepared.shots.map((shot) => [shot.id, shot.status, shot.assetIds]),
    [
      ["shot_01", "needs_asset", []],
      ["shot_02", "ready", ["old_asset_02"]],
      ["shot_03", "needs_asset", []],
    ]
  )
  assert.deepEqual(prepared.removedAssetIds, ["old_asset_01"])
})

test("removing a generated stickman asset marks its shot missing again", async () => {
  const { removeVideoAssetFromInventory } = await importVideoAssetsModule()
  const generatedAsset = {
    id: "asset_01",
    kind: "stickman_image",
    displayName: "shot-01.png",
    file: { path: "shot-01.png" },
    tags: ["shot_01", "generated_image"],
  }
  const manualAsset = {
    id: "asset_manual",
    kind: "cover_image",
    displayName: "cover.png",
    file: { path: "cover.png" },
    tags: ["shot_01"],
  }

  const removal = removeVideoAssetFromInventory({
    shots: [
      { id: "shot_01", status: "ready", assetIds: ["asset_01", "asset_manual"] },
      { id: "shot_02", status: "ready", assetIds: ["asset_02"] },
    ],
    assets: [generatedAsset, manualAsset],
    assetId: "asset_01",
  })

  assert.deepEqual(
    removal.assets.map((asset) => asset.id),
    ["asset_manual"]
  )
  assert.deepEqual(removal.affectedShotIds, ["shot_01"])
  assert.deepEqual(
    removal.shots.map((shot) => [shot.id, shot.status, shot.assetIds]),
    [
      ["shot_01", "needs_asset", ["asset_manual"]],
      ["shot_02", "ready", ["asset_02"]],
    ]
  )
})

test("manual external material labels stay explicit and placeholders are task scoped", async () => {
  const {
    EXTERNAL_MATERIAL_LABEL_OPTIONS,
    createExternalMaterialPlaceholderAsset,
    createImportedVideoAsset,
    normalizeExternalMaterialLabels,
  } = await importVideoAssetsModule()
  const labels = normalizeExternalMaterialLabels([
    "tool_demo",
    "filename-guessed-hook",
    "proof",
    "tool_demo",
  ])
  const asset = createImportedVideoAsset({
    taskId: "task_01",
    kind: "yanling_clip",
    filename: "dramatic-proof-demo.mp4",
    tags: labels,
  })
  const placeholder = createExternalMaterialPlaceholderAsset({
    taskId: "task_01",
    labelId: "product_proof",
    shotId: "shot_03",
  })

  assert.equal(placeholder.id, "placeholder_product_proof_shot_03")
  assert.deepEqual(
    EXTERNAL_MATERIAL_LABEL_OPTIONS.map((option) => option.id),
    [
      "tool_demo",
      "real_drama_clip",
      "emotion_boost",
      "opening_hook",
      "ending_conversion",
      "product_proof",
      "doubao_icon",
      "yanling_icon",
      "jianying_icon",
    ]
  )
  assert.deepEqual(asset.tags, ["tool_demo"])
  assert.equal(placeholder.kind, "showcase_clip")
  assert.match(placeholder.displayName, /占位/)
  assert.deepEqual(placeholder.tags, [
    "external_material_placeholder",
    "product_proof",
    "shot_03",
  ])
})

test("product icon labels persist on brand sticker assets without polluting generated shot image labels", async () => {
  const {
    createImportedVideoAsset,
    getExternalMaterialLabels,
    serializeVideoAssetsForSnapshot,
  } = await importVideoAssetsModule()
  const brandSticker = createImportedVideoAsset({
    taskId: "task_01",
    kind: "brand_sticker",
    filename: "doubao-icon.png",
    mimeType: "image/png",
    tags: ["doubao_icon", "yanling_icon", "unknown-product-label"],
  })
  const generatedShotImage = createImportedVideoAsset({
    taskId: "task_01",
    kind: "stickman_image",
    filename: "shot-01.png",
    mimeType: "image/png",
    tags: ["generated_image", "shot_01"],
  })
  const serialized = serializeVideoAssetsForSnapshot([brandSticker])

  assert.equal(brandSticker.kind, "brand_sticker")
  assert.deepEqual(getExternalMaterialLabels(brandSticker), [
    "doubao_icon",
    "yanling_icon",
  ])
  assert.equal(serialized.includes("doubao_icon"), true)
  assert.equal(serialized.includes("yanling_icon"), true)
  assert.equal(serialized.includes("unknown-product-label"), true)
  assert.deepEqual(getExternalMaterialLabels(generatedShotImage), [])
})

test("stickman storyboard image generation stops immediately on insufficient balance", async () => {
  const { generateStickmanStoryboardAsset } = await importVideoAssetsModule()
  let attempts = 0

  await assert.rejects(
    () =>
      generateStickmanStoryboardAsset({
        taskId: "task_01",
        shot: {
          id: "shot_01",
          startMs: 0,
          endMs: 2000,
          voiceText: "开头",
          visualType: "stickman",
          visualDescription: "火柴人震惊",
          prompt: "黑白火柴人震惊表情",
          negativePrompt: "复杂背景",
          assetIds: [],
          status: "needs_asset",
        },
        profile: {
          service: "image_generation",
          profileId: "image-main",
          apiBaseUrl: "https://image.example.com/v1",
          model: "gpt-image-2-4K",
          apiKey: "fixture",
        },
        requestImages: async () => {
          attempts += 1
          throw new Error("余额不足，请充值")
        },
        wait: async () => {},
      }),
    /余额不足/
  )

  assert.equal(attempts, 1)
})

test("stickman image queue runs up to the configured concurrency", async () => {
  const { runStickmanImageGenerationQueue } = await importVideoAssetsModule()
  let active = 0
  let maxActive = 0

  const result = await runStickmanImageGenerationQueue({
    items: Array.from({ length: 20 }, (_, index) => index + 1),
    concurrency: 8,
    worker: async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
    },
  })

  assert.equal(maxActive, 8)
  assert.equal(result.completed, 20)
  assert.equal(result.failed, 0)
})

test("stickman image queue stops dispatching after stop is requested", async () => {
  const { runStickmanImageGenerationQueue } = await importVideoAssetsModule()
  let stopRequested = false
  const started = []

  const result = await runStickmanImageGenerationQueue({
    items: [1, 2, 3, 4, 5, 6],
    concurrency: 3,
    shouldStop: () => stopRequested,
    worker: async (item) => {
      started.push(item)
      if (item === 1) {
        stopRequested = true
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 5))
    },
  })

  assert.deepEqual(started, [1])
  assert.equal(result.stopped, true)
  assert.equal(result.completed, started.length)
})

test("stickman image queue stops dispatching after insufficient balance", async () => {
  const { runStickmanImageGenerationQueue } = await importVideoAssetsModule()
  const started = []

  const result = await runStickmanImageGenerationQueue({
    items: [1, 2, 3, 4, 5],
    concurrency: 2,
    worker: async (item) => {
      started.push(item)
      if (item === 1) throw new Error("余额不足，请充值")
      await new Promise((resolve) => setTimeout(resolve, 5))
    },
  })

  assert.deepEqual(started.sort(), [1, 2])
  assert.equal(result.stopped, true)
  assert.equal(result.failed, 1)
  assert.match(result.fatalError.message, /余额不足/)
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
