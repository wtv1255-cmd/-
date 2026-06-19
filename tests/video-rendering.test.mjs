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

async function importRenderingModule() {
  const sourcePath = path.join(projectRoot, "lib", "video-rendering.ts")
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
  const outDir = path.join(tmpdir(), "ta-huo-video-rendering-tests")
  await mkdir(outDir, { recursive: true })
  const compiledPath = path.join(outDir, `video-rendering-${Date.now()}.mjs`)
  await writeFile(compiledPath, output.outputText, "utf8")
  return import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`)
}

const readyTimeline = {
  taskId: "task_01",
  durationMs: 45000,
  tracks: [
    {
      id: "visual",
      type: "visual",
      clips: [
        {
          id: "shot_01_visual",
          assetId: "stickman_01",
          startMs: 0,
          durationMs: 15000,
        },
        {
          id: "shot_02_visual",
          assetId: "placeholder_opening_hook_shot_02",
          startMs: 15000,
          durationMs: 15000,
        },
      ],
    },
    {
      id: "voice",
      type: "voice",
      clips: [
        {
          id: "voice_main",
          assetId: "voice_audio_voice.wav",
          startMs: 0,
          durationMs: 45000,
        },
      ],
    },
    {
      id: "subtitle",
      type: "subtitle",
      clips: [
        {
          id: "subtitle_01",
          assetId: "subtitle_01",
          startMs: 0,
          durationMs: 15000,
          text: "小白也能一键生成短视频",
        },
      ],
    },
  ],
}

test("Jianying draft plan is the primary editable output instead of MP4 export", async () => {
  const { createJianyingDraftPlan } = await importRenderingModule()
  const plan = createJianyingDraftPlan({
    taskId: "task_01",
    timeline: readyTimeline,
    createdAt: "2026-06-18T09:00:00.000Z",
  })

  assert.equal(plan.status, "ready")
  assert.equal(plan.defaultOutputKind, "jianying_draft")
  assert.equal(plan.mp4ExportDefault, false)
  assert.equal(plan.output.kind, "jianying_draft")
  assert.equal(plan.output.file.mimeType, "application/vnd.jianying.draft+json")
  assert.match(
    plan.output.file.path,
    /tasks\/task_01\/jianying_drafts\/task_01-20260618-090000$/
  )
  assert.doesNotMatch(plan.previewPath, /\.mp4$/)
  assert.match(plan.command, /ta-huo-create-jianying-draft/)
})

test("Jianying draft plan carries the selected 16:9 canvas to native creation", async () => {
  const { createJianyingDraftPlan } = await importRenderingModule()
  const plan = createJianyingDraftPlan({
    taskId: "task_01",
    timeline: readyTimeline,
    canvasAspectRatio: "16:9",
  })

  assert.deepEqual(plan.canvas, {
    aspectRatio: "16:9",
    width: 1920,
    height: 1080,
  })
})

test("AI director plan preserves locks and creates editable placeholders", async () => {
  const { createJianyingDraftPlan } = await importRenderingModule()
  const plan = createJianyingDraftPlan({
    taskId: "task_01",
    timeline: readyTimeline,
    createdAt: "2026-06-18T09:00:00.000Z",
    lockedShotIds: ["shot_01"],
    lockedTrackIds: ["voice"],
  })
  const lockedVisual = plan.aiDirector.clips.find(
    (clip) => clip.id === "shot_01_visual"
  )
  const placeholderVisual = plan.aiDirector.clips.find(
    (clip) => clip.id === "shot_02_visual"
  )
  const voiceClip = plan.aiDirector.clips.find(
    (clip) => clip.id === "voice_main"
  )
  const subtitleClip = plan.aiDirector.clips.find(
    (clip) => clip.id === "subtitle_01"
  )

  assert.equal(lockedVisual.locked, true)
  assert.equal(lockedVisual.aiEditable, false)
  assert.equal(lockedVisual.assetId, "stickman_01")
  assert.equal(lockedVisual.transition, "locked")
  assert.equal(placeholderVisual.placeholder, true)
  assert.match(placeholderVisual.replacementHint, /剪映中替换/)
  assert.equal(voiceClip.locked, true)
  assert.equal(subtitleClip.emphasisSubtitle, true)
  assert.deepEqual(plan.aiDirector.trackOrder, [
    "visual",
    "voice",
    "subtitle",
  ])
})

test("AI director model plan can override editable clip decisions without changing locked clips", async () => {
  const { createJianyingDraftPlan, createModelAiDirectorPlan } =
    await importRenderingModule()
  const basePlan = createJianyingDraftPlan({
    taskId: "task_01",
    timeline: readyTimeline,
    createdAt: "2026-06-18T09:00:00.000Z",
    lockedShotIds: ["shot_01"],
  })
  const modelPlan = createModelAiDirectorPlan({
    fallbackPlan: basePlan.aiDirector,
    modelText: JSON.stringify({
      trackOrder: ["visual", "subtitle", "voice"],
      clips: [
        {
          id: "shot_01_visual",
          transition: "flash_cut",
          zoom: "fast_in",
          replacementHint: "should not override locked clip",
        },
        {
          id: "shot_02_visual",
          transition: "match_cut",
          zoom: "slow_out",
          replacementHint: "替换为产品操作录屏",
        },
        {
          id: "subtitle_01",
          emphasisSubtitle: true,
          text: "前三秒加粗高亮",
        },
      ],
    }),
  })
  const lockedVisual = modelPlan.clips.find((clip) => clip.id === "shot_01_visual")
  const editableVisual = modelPlan.clips.find((clip) => clip.id === "shot_02_visual")
  const subtitle = modelPlan.clips.find((clip) => clip.id === "subtitle_01")

  assert.deepEqual(modelPlan.trackOrder, ["visual", "subtitle", "voice"])
  assert.equal(lockedVisual.transition, "locked")
  assert.equal(lockedVisual.zoom, "none")
  assert.equal(editableVisual.transition, "match_cut")
  assert.equal(editableVisual.zoom, "slow_out")
  assert.equal(editableVisual.replacementHint, "替换为产品操作录屏")
  assert.equal(subtitle.emphasisSubtitle, true)
  assert.equal(subtitle.text, "前三秒加粗高亮")
})

test("AI director request is sanitized and model parse falls back on invalid output", async () => {
  const {
    buildAiDirectorGenerationRequest,
    createJianyingDraftPlan,
    createModelAiDirectorPlan,
  } = await importRenderingModule()
  const basePlan = createJianyingDraftPlan({
    taskId: "task_01",
    timeline: readyTimeline,
    createdAt: "2026-06-18T09:00:00.000Z",
  })
  const request = buildAiDirectorGenerationRequest({
    profile: {
      service: "edit_director",
      profileId: "director-main",
      model: "director-model",
      apiBaseUrl: "https://director.example.com/v1",
      apiKey: "secret-director",
    },
    script: "小白也能一键生成短视频",
    timeline: readyTimeline,
    fallbackPlan: basePlan.aiDirector,
  })
  const fallback = createModelAiDirectorPlan({
    fallbackPlan: basePlan.aiDirector,
    modelText: "not json",
  })
  const serializedLog = JSON.stringify(request.logEntry)

  assert.equal(request.body.model, "director-model")
  assert.equal(request.body.profileId, "director-main")
  assert.equal(request.body.apiKey, "secret-director")
  assert.match(request.body.messages[0].content, /剪辑决策模型/)
  assert.match(request.body.messages[1].content, /VideoTimeline/)
  assert.equal(serializedLog.includes("secret-director"), false)
  assert.deepEqual(fallback, basePlan.aiDirector)
})

test("product board draft plan carries optional brand sticker overlays while non-product stays clean", async () => {
  const { createJianyingDraftPlan } = await importRenderingModule()
  const productPlan = createJianyingDraftPlan({
    taskId: "task_01",
    timeline: readyTimeline,
    createdAt: "2026-06-18T09:00:00.000Z",
    copywritingBoard: "product_conversion",
    materialAssets: [
      {
        id: "doubao_icon_asset",
        kind: "brand_sticker",
        displayName: "doubao-icon.png",
        file: {
          id: "doubao_icon_file",
          taskId: "task_01",
          kind: "brand_sticker",
          filename: "doubao-icon.png",
          path: "%APPDATA%/她火/tasks/task_01/brand_sticker/doubao-icon.png",
          bytes: 2048,
          mimeType: "image/png",
          storage: "app_user_data_task_dir",
        },
        tags: ["doubao_icon"],
      },
      {
        id: "yanling_icon_asset",
        kind: "brand_sticker",
        displayName: "yanling-icon.png",
        file: {
          id: "yanling_icon_file",
          taskId: "task_01",
          kind: "brand_sticker",
          filename: "yanling-icon.png",
          path: "%APPDATA%/她火/tasks/task_01/brand_sticker/yanling-icon.png",
          bytes: 2048,
          mimeType: "image/png",
          storage: "app_user_data_task_dir",
        },
        tags: ["yanling_icon"],
      },
    ],
  })
  const genericPlan = createJianyingDraftPlan({
    taskId: "task_01",
    timeline: readyTimeline,
    copywritingBoard: "generic_rewrite",
    materialAssets: productPlan.materialAssets,
  })

  assert.deepEqual(
    productPlan.brandOverlays.map((overlay) => [
      overlay.labelId,
      overlay.assetId,
      overlay.status,
      overlay.required,
    ]),
    [
      ["doubao_icon", "doubao_icon_asset", "ready", false],
      ["yanling_icon", "yanling_icon_asset", "ready", false],
      ["jianying_icon", undefined, "placeholder", false],
    ]
  )
  assert.match(
    productPlan.brandOverlays[0].replacementHint,
    /手动.*贴片|已导入素材/
  )
  assert.match(productPlan.brandOverlays[2].replacementHint, /可选|不阻塞/)
  assert.deepEqual(genericPlan.brandOverlays, [])
})

test("AI director request carries brand overlay context without asking image model for logos", async () => {
  const { buildAiDirectorGenerationRequest, createJianyingDraftPlan } =
    await importRenderingModule()
  const productPlan = createJianyingDraftPlan({
    taskId: "task_01",
    timeline: readyTimeline,
    copywritingBoard: "product_conversion",
    materialAssets: [
      {
        id: "doubao_icon_asset",
        kind: "brand_sticker",
        displayName: "doubao-icon.png",
        file: {
          id: "doubao_icon_file",
          taskId: "task_01",
          kind: "brand_sticker",
          filename: "doubao-icon.png",
          path: "%APPDATA%/她火/tasks/task_01/brand_sticker/doubao-icon.png",
          bytes: 2048,
          mimeType: "image/png",
          storage: "app_user_data_task_dir",
        },
        tags: ["doubao_icon"],
      },
    ],
  })
  const request = buildAiDirectorGenerationRequest({
    profile: {
      service: "edit_director",
      profileId: "director-main",
      model: "director-model",
      apiBaseUrl: "https://director.example.com/v1",
      apiKey: "secret-director",
    },
    script: "产品引流口播",
    timeline: readyTimeline,
    fallbackPlan: productPlan.aiDirector,
    brandOverlays: productPlan.brandOverlays,
  })
  const payload = JSON.parse(request.body.messages[1].content)

  assert.match(request.body.messages[0].content, /不得.*生成.*logo|不要.*生成.*logo/i)
  assert.deepEqual(
    payload.brandOverlays.map((overlay) => [
      overlay.labelId,
      overlay.assetId,
      overlay.status,
    ]),
    [
      ["doubao_icon", "doubao_icon_asset", "ready"],
      ["yanling_icon", undefined, "placeholder"],
      ["jianying_icon", undefined, "placeholder"],
    ]
  )
  assert.equal(JSON.stringify(request.logEntry).includes("secret-director"), false)
})

test("image asset draft timeline exports generated shot images as a visual track", async () => {
  const { createImageAssetsDraftTimeline } = await importRenderingModule()
  const timeline = createImageAssetsDraftTimeline({
    taskId: "task_01",
    shots: [
      {
        id: "shot_01",
        startMs: 0,
        endMs: 2000,
        visualType: "stickman",
        assetIds: [],
      },
      {
        id: "shot_02",
        startMs: 2000,
        endMs: 4500,
        visualType: "stickman",
        assetIds: ["manual_image_02"],
      },
      {
        id: "shot_03",
        startMs: 4500,
        endMs: 6000,
        visualType: "yanling_clip",
        assetIds: ["clip_03"],
      },
    ],
    assets: [
      {
        id: "generated_image_01",
        kind: "stickman_image",
        tags: ["generated_image", "shot_01"],
      },
      {
        id: "manual_image_02",
        kind: "stickman_image",
        tags: ["manual"],
      },
      {
        id: "clip_03",
        kind: "yanling_clip",
        tags: [],
      },
    ],
  })

  assert.equal(timeline.taskId, "task_01")
  assert.equal(timeline.durationMs, 4500)
  assert.equal(timeline.tracks.length, 1)
  assert.equal(timeline.tracks[0].id, "visual")
  assert.deepEqual(
    timeline.tracks[0].clips.map((clip) => [
      clip.id,
      clip.assetId,
      clip.startMs,
      clip.durationMs,
    ]),
    [
      ["shot_01_visual", "generated_image_01", 0, 2000],
      ["shot_02_visual", "manual_image_02", 2000, 2500],
    ]
  )
})

test("Jianying draft plan repairs stale visual asset ids by shot tag", async () => {
  const { createJianyingDraftPlan } = await importRenderingModule()
  const plan = createJianyingDraftPlan({
    taskId: "task_01",
    timeline: readyTimeline,
    createdAt: "2026-06-18T09:00:00.000Z",
    aiDirectorPlan: {
      trackOrder: ["visual"],
      clips: [
        {
          id: "shot_01_visual",
          trackId: "visual",
          type: "visual",
          assetId: "stickman_image_01_shot_01_0-3s_stickman.png_1781836337937",
          startMs: 0,
          durationMs: 3000,
          locked: false,
          aiEditable: true,
          placeholder: false,
          transition: "soft_cut",
          zoom: "slow_in",
        },
      ],
    },
    materialAssets: [
      {
        id: "stickman_image_01_shot_01_0-3s_stickman.png_1781839938812",
        kind: "stickman_image",
        displayName: "01_shot_01_0-3s_stickman.png",
        file: {
          id: "file_01",
          taskId: "task_01",
          kind: "stickman_image",
          filename: "01_shot_01_0-3s_stickman.png",
          path: "%APPDATA%/她火/tasks/task_01/stickman_image/01_shot_01_0-3s_stickman.png",
          bytes: 2048,
          mimeType: "image/png",
          storage: "app_user_data_task_dir",
        },
        tags: ["shot_01", "generated_image"],
      },
    ],
  })

  assert.equal(
    plan.aiDirector.clips[0].assetId,
    "stickman_image_01_shot_01_0-3s_stickman.png_1781839938812"
  )
})

test("destructive Jianying draft actions require explicit confirmation", async () => {
  const { createJianyingDraftPlan } = await importRenderingModule()
  const plan = createJianyingDraftPlan({
    taskId: "task_01",
    timeline: readyTimeline,
    createdAt: "2026-06-18T09:00:00.000Z",
    requestedActions: [
      "overwrite_existing_draft",
      "delete_old_materials",
      "publish_or_upload",
      "replace_manual_edits",
    ],
    confirmedActions: ["publish_or_upload"],
  })

  assert.equal(plan.status, "needs_confirmation")
  assert.deepEqual(plan.requiredConfirmations, [
    "overwrite_existing_draft",
    "delete_old_materials",
    "replace_manual_edits",
  ])
  assert.match(plan.message, /需要用户确认/)
})

test("render engine options prefer Jianying and keep built-in fallback recoverable", async () => {
  const { createRenderEngineOptions } = await importRenderingModule()
  const engines = createRenderEngineOptions({
    jianyingAvailable: false,
    ffmpegAvailable: true,
    remotionAvailable: false,
    davinciAvailable: false,
  })

  assert.equal(engines[0].id, "jianying")
  assert.equal(
    engines.find((engine) => engine.id === "ffmpeg").status,
    "available"
  )
  assert.equal(
    engines.find((engine) => engine.id === "davinci").status,
    "disabled"
  )
  assert.match(
    engines.find((engine) => engine.id === "jianying").disabledReason,
    /剪映/
  )
})

test("export plan falls back from unavailable Jianying to FFmpeg MP4 output", async () => {
  const { createRenderEngineOptions, createRenderExportPlan } =
    await importRenderingModule()
  const engines = createRenderEngineOptions({
    jianyingAvailable: false,
    ffmpegAvailable: true,
    remotionAvailable: false,
    davinciAvailable: false,
  })
  const plan = createRenderExportPlan({
    taskId: "task_01",
    timeline: readyTimeline,
    requestedEngineId: "jianying",
    engines,
  })

  assert.equal(plan.status, "fallback_ready")
  assert.equal(plan.engineId, "ffmpeg")
  assert.equal(plan.fallbackFrom, "jianying")
  assert.equal(plan.output.kind, "rendered_video")
  assert.equal(
    plan.output.file.path,
    "%APPDATA%/她火/tasks/task_01/rendered_video/task_01-ffmpeg.mp4"
  )
  assert.equal(plan.previewPath, plan.output.file.path)
  assert.match(plan.command, /^ffmpeg -y -hide_banner/)
})

test("DaVinci unavailability is disabled without blocking built-in export", async () => {
  const { createRenderEngineOptions, createRenderExportPlan } =
    await importRenderingModule()
  const engines = createRenderEngineOptions({
    jianyingAvailable: false,
    ffmpegAvailable: true,
    remotionAvailable: true,
    davinciAvailable: false,
  })
  const davinci = engines.find((engine) => engine.id === "davinci")
  const plan = createRenderExportPlan({
    taskId: "task_01",
    timeline: readyTimeline,
    requestedEngineId: "davinci",
    engines,
  })

  assert.equal(davinci.status, "disabled")
  assert.equal(plan.status, "fallback_ready")
  assert.equal(plan.engineId, "ffmpeg")
  assert.equal(plan.fallbackFrom, "davinci")
})
