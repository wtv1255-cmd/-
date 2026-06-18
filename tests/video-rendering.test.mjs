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
