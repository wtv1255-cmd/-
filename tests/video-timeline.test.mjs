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

async function importTimelineModule() {
  const sourcePath = path.join(projectRoot, "lib", "video-timeline.ts")
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
  const outDir = path.join(tmpdir(), "ta-huo-video-timeline-tests")
  await mkdir(outDir, { recursive: true })
  const compiledPath = path.join(outDir, `video-timeline-${Date.now()}.mjs`)
  await writeFile(compiledPath, output.outputText, "utf8")
  return import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`)
}

test("voice plan falls back to sentence timing when tts timestamps are missing", async () => {
  const { createVoicePlanFromScript } = await importTimelineModule()
  const voice = createVoicePlanFromScript({
    taskId: "task_01",
    script: "短句。\n这一句明显更长，用来承载更多口播信息和节奏。",
    durationPreset: "30-45s",
    audioFilename: "voice.wav",
    speechRateCharsPerSecond: 10,
  })

  assert.equal(voice.subtitles.length, 2)
  assert.equal(voice.subtitles[0].startMs, 0)
  assert.ok(
    voice.subtitles[1].endMs - voice.subtitles[1].startMs >
      voice.subtitles[0].endMs - voice.subtitles[0].startMs
  )
  assert.equal(
    voice.subtitles.at(-1).endMs,
    Math.round((3 + 22) * 100)
  )
  assert.equal(voice.audio.filename, "voice.wav")
  assert.equal(
    voice.audio.path,
    "%APPDATA%/她火/tasks/task_01/voice_audio/voice.wav"
  )
})

test("voice plan prefers tts timestamp cues over fallback timing", async () => {
  const { createVoicePlanFromScript } = await importTimelineModule()
  const voice = createVoicePlanFromScript({
    taskId: "task_01",
    script: "这段脚本会被 TTS 时间戳覆盖。\n第二句。",
    durationPreset: "45-60s",
    audioFilename: "tts.wav",
    ttsCues: [
      { text: "TTS 钩子", startMs: 320, endMs: 1820 },
      { text: "TTS 证明", startMs: 2100, endMs: 4300 },
    ],
  })

  assert.deepEqual(
    voice.subtitles.map(({ startMs, endMs, text }) => ({
      startMs,
      endMs,
      text,
    })),
    [
      { startMs: 320, endMs: 1820, text: "TTS 钩子" },
      { startMs: 2100, endMs: 4300, text: "TTS 证明" },
    ]
  )
})

test("timeline aligns visual voice subtitle bgm and sfx tracks", async () => {
  const { createVoicePlanFromScript, createUnifiedVideoTimeline } =
    await importTimelineModule()
  const voice = createVoicePlanFromScript({
    taskId: "task_01",
    script: "开头钩子。\n工具演示。\n结果证明。",
    durationPreset: "30-45s",
    audioFilename: "voice.wav",
  })
  const timeline = createUnifiedVideoTimeline({
    taskId: "task_01",
    voice,
    storyboard: [
      { id: "shot_01", assetIds: ["stickman_01"], startMs: 0, endMs: 15000 },
      { id: "shot_02", assetIds: ["yanling_01"], startMs: 15000, endMs: 30000 },
      {
        id: "shot_03",
        assetIds: ["showcase_01"],
        startMs: 30000,
        endMs: 45000,
      },
    ],
    bgmAssetId: "bgm_01",
    sfxAssetIds: ["sfx_01"],
  })

  assert.equal(timeline.durationMs, 45000)
  assert.deepEqual(
    timeline.tracks.map((track) => track.type),
    ["visual", "voice", "subtitle", "bgm", "sfx"]
  )
  assert.equal(timeline.tracks[0].clips.length, 3)
  assert.equal(timeline.tracks[2].clips.length, 3)
})

test("timeline uses manual external material labels and creates placeholders for missing matches", async () => {
  const { createVoicePlanFromScript, createUnifiedVideoTimeline } =
    await importTimelineModule()
  const voice = createVoicePlanFromScript({
    taskId: "task_01",
    script: "开头钩子。\n工具演示。\n产品证明。",
    durationPreset: "30-45s",
    audioFilename: "voice.wav",
  })
  const timeline = createUnifiedVideoTimeline({
    taskId: "task_01",
    voice,
    storyboard: [
      {
        id: "shot_01",
        assetIds: [],
        startMs: 0,
        endMs: 15000,
        requiredMaterialLabel: "opening_hook",
      },
      {
        id: "shot_02",
        assetIds: [],
        startMs: 15000,
        endMs: 30000,
        requiredMaterialLabel: "tool_demo",
      },
      {
        id: "shot_03",
        assetIds: [],
        startMs: 30000,
        endMs: 45000,
        requiredMaterialLabel: "product_proof",
      },
    ],
    externalAssets: [
      {
        id: "clip_named_hook_but_manual_tool",
        kind: "yanling_clip",
        displayName: "opening-hook-looking-name.mp4",
        tags: ["tool_demo"],
        file: {
          id: "yanling_clip_opening-hook-looking-name.mp4",
          taskId: "task_01",
          kind: "yanling_clip",
          filename: "opening-hook-looking-name.mp4",
          path: "%APPDATA%/她火/tasks/task_01/yanling_clip/opening-hook-looking-name.mp4",
          bytes: 0,
          mimeType: "video/mp4",
          storage: "app_user_data_task_dir",
        },
      },
    ],
  })
  const visualClips = timeline.tracks.find((track) => track.id === "visual").clips

  assert.equal(visualClips[0].assetId, "placeholder_opening_hook_shot_01")
  assert.equal(visualClips[1].assetId, "clip_named_hook_but_manual_tool")
  assert.equal(visualClips[2].assetId, "placeholder_product_proof_shot_03")
})

test("timeline regeneration preserves locked and manually selected visual assets", async () => {
  const { createVoicePlanFromScript, createUnifiedVideoTimeline } =
    await importTimelineModule()
  const voice = createVoicePlanFromScript({
    taskId: "task_01",
    script: "锁定片段。\n手动片段。\n可替换片段。",
    durationPreset: "30-45s",
  })
  const previousTimeline = createUnifiedVideoTimeline({
    taskId: "task_01",
    voice,
    storyboard: [
      { id: "shot_01", assetIds: ["locked_old"], startMs: 0, endMs: 15000 },
      { id: "shot_02", assetIds: ["manual_old"], startMs: 15000, endMs: 30000 },
      { id: "shot_03", assetIds: ["replace_old"], startMs: 30000, endMs: 45000 },
    ],
  })

  const regenerated = createUnifiedVideoTimeline({
    taskId: "task_01",
    voice,
    previousTimeline,
    storyboard: [
      {
        id: "shot_01",
        assetIds: ["new_ai_asset_01"],
        startMs: 0,
        endMs: 15000,
        lockedAssetId: "locked_old",
      },
      {
        id: "shot_02",
        assetIds: ["manual_old"],
        startMs: 15000,
        endMs: 30000,
        assetSelection: "manual",
      },
      {
        id: "shot_03",
        assetIds: ["new_ai_asset_03"],
        startMs: 30000,
        endMs: 45000,
        replaceAsset: true,
      },
    ],
  })
  const visualClips = regenerated.tracks.find((track) => track.id === "visual")
    .clips

  assert.equal(visualClips[0].assetId, "locked_old")
  assert.equal(visualClips[1].assetId, "manual_old")
  assert.equal(visualClips[2].assetId, "new_ai_asset_03")
  assert.deepEqual(
    previousTimeline.tracks.find((track) => track.id === "visual").clips.map(
      (clip) => clip.assetId
    ),
    ["locked_old", "manual_old", "replace_old"]
  )
})

test("duration presets control pacing across short and long modes", async () => {
  const { createVoicePlanFromScript } = await importTimelineModule()
  const short = createVoicePlanFromScript({
    taskId: "task_01",
    script: "一。\n二。\n三。",
    durationPreset: "30-45s",
  })
  const long = createVoicePlanFromScript({
    taskId: "task_01",
    script: "一。\n二。\n三。",
    durationPreset: "120s",
  })

  assert.equal(short.subtitles.at(-1).endMs, 45000)
  assert.equal(long.subtitles.at(-1).endMs, 120000)
  assert.ok(long.subtitles[0].endMs > short.subtitles[0].endMs)
})
