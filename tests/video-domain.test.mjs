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

async function importVideoDomainModule() {
  const sourcePath = path.join(projectRoot, "lib", "video-domain.ts")
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
  const outDir = path.join(tmpdir(), "ta-huo-video-domain-tests")
  await mkdir(outDir, { recursive: true })
  const compiledPath = path.join(outDir, `video-domain-${Date.now()}.mjs`)
  await writeFile(compiledPath, output.outputText, "utf8")
  return import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`)
}

test("video task snapshots persist metadata and local file references only", async () => {
  const {
    createVideoTaskSnapshot,
    createTaskFileRef,
    createStoryboardShot,
    createTimeline,
    serializeVideoTaskSnapshot,
    VIDEO_TASK_INDEX_STORAGE_KEY,
  } = await importVideoDomainModule()

  const sourceVideo = createTaskFileRef({
    taskId: "task_01",
    kind: "source_video",
    filename: "demo.mp4",
    bytes: 1024,
    mimeType: "video/mp4",
  })
  const shot = createStoryboardShot({
    id: "shot_01",
    startMs: 0,
    endMs: 3000,
    voiceText: "小白也能一键做视频",
    visualType: "stickman",
    prompt: "白底黑线火柴人，惊讶表情",
  })
  const timeline = createTimeline({
    taskId: "task_01",
    durationMs: 3000,
    tracks: [
      {
        id: "track_visual",
        type: "visual",
        clips: [
          {
            id: "clip_01",
            assetId: "asset_source",
            startMs: 0,
            durationMs: 3000,
          },
        ],
      },
    ],
  })
  const snapshot = createVideoTaskSnapshot({
    id: "task_01",
    title: "测试任务",
    source: {
      mode: "local_upload",
      sourceVideo,
      userTopic: "短视频工具",
    },
    storyboard: [shot],
    assets: [
      {
        id: "asset_source",
        kind: "source_video",
        displayName: "demo.mp4",
        file: sourceVideo,
      },
    ],
    timeline,
  })
  const serialized = serializeVideoTaskSnapshot(snapshot)

  assert.equal(VIDEO_TASK_INDEX_STORAGE_KEY, "ta-huo:video-factory:index-v1")
  assert.equal(snapshot.storyboard[0].prompt, "白底黑线火柴人，惊讶表情")
  assert.equal(snapshot.assets[0].file.path.includes("%APPDATA%/她火/tasks/task_01/"), true)
  assert.equal(serialized.includes("demo.mp4"), true)
  assert.equal(/data:video|base64|Blob|arrayBuffer/i.test(serialized), false)
})

test("domain contracts cover accounts and publish metadata without credentials", async () => {
  const { createPublishTarget, serializeVideoTaskSnapshot } =
    await importVideoDomainModule()
  const target = createPublishTarget({
    accountId: "douyin-main",
    displayName: "主账号",
    browserProfileId: "work",
    title: "她火一键做短视频",
    topics: ["她火助手", "AI短视频"],
    intro: "发布前确认",
  })
  const serialized = serializeVideoTaskSnapshot({
    id: "task_02",
    title: "发布任务",
    status: "draft",
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    workflow: [],
    source: { mode: "manual_text", userTopic: "工具展示" },
    packagePlan: {
      packageIds: ["tool_showcase"],
      durationPreset: "45-60s",
    },
    storyboard: [],
    assets: [],
    voice: { text: "", subtitles: [] },
    timeline: { taskId: "task_02", durationMs: 0, tracks: [] },
    publish: {
      ...target,
      password: "should-not-export",
      cookie: "should-not-export",
    },
    records: [],
  })

  assert.equal(target.platform, "douyin")
  assert.equal(target.authorizedByUser, true)
  assert.equal(serialized.includes("should-not-export"), false)
  assert.equal(/password|cookie/i.test(serialized), false)
})

test("video task snapshots survive storage roundtrip as metadata only", async () => {
  const {
    createTaskFileRef,
    createVideoTaskSnapshot,
    readVideoTaskSnapshot,
    saveVideoTaskSnapshot,
    VIDEO_TASK_SNAPSHOT_STORAGE_PREFIX,
  } = await importVideoDomainModule()
  const storage = new Map()
  const browserStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  }
  const audio = createTaskFileRef({
    taskId: "task_03",
    kind: "voice_audio",
    filename: "voice.wav",
    bytes: 4096,
    mimeType: "audio/wav",
  })
  const snapshot = createVideoTaskSnapshot({
    id: "task_03",
    title: "可恢复任务",
    voice: {
      text: "用户编辑后的配音文本",
      audio,
      subtitles: [
        {
          id: "sub_01",
          startMs: 0,
          endMs: 1200,
          text: "用户编辑后的字幕",
        },
      ],
    },
    timeline: {
      taskId: "task_03",
      durationMs: 1200,
      tracks: [
        {
          id: "voice",
          type: "voice",
          clips: [
            {
              id: "voice_clip",
              assetId: audio.id,
              startMs: 0,
              durationMs: 1200,
            },
          ],
        },
      ],
    },
  })

  saveVideoTaskSnapshot(snapshot, browserStorage)
  const restored = readVideoTaskSnapshot("task_03", browserStorage)
  const raw = storage.get(`${VIDEO_TASK_SNAPSHOT_STORAGE_PREFIX}task_03`)

  assert.equal(restored.title, "可恢复任务")
  assert.equal(restored.voice.text, "用户编辑后的配音文本")
  assert.equal(restored.voice.audio.path.includes("voice_audio/voice.wav"), true)
  assert.equal(restored.timeline.tracks[0].clips[0].assetId, audio.id)
  assert.equal(/data:audio|base64|Blob|arrayBuffer/i.test(raw), false)
})

test("video task snapshots persist production recovery metadata", async () => {
  const {
    createVideoTaskSnapshot,
    readVideoTaskSnapshot,
    saveVideoTaskSnapshot,
  } = await importVideoDomainModule()
  const storage = new Map()
  const browserStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  }
  const snapshot = createVideoTaskSnapshot({
    id: "task_recovery",
    title: "恢复任务",
    recovery: {
      taskId: "task_recovery",
      taskStatus: "paused",
      autoResumeStepIds: ["timeline", "draft"],
      manualStepIds: ["publish"],
      preservedAssetIds: ["img_01", "voice_audio_voice.wav"],
      pauseReasons: ["publish:needs_confirmation"],
      requiresUserConfirmation: true,
      steps: [
        {
          id: "images",
          state: "success",
          assetIds: ["img_01"],
          shouldRegenerate: false,
        },
        {
          id: "publish",
          state: "needs_manual",
          assetIds: [],
          shouldRegenerate: false,
        },
      ],
    },
  })

  saveVideoTaskSnapshot(snapshot, browserStorage)
  const restored = readVideoTaskSnapshot("task_recovery", browserStorage)

  assert.equal(restored.recovery.taskStatus, "paused")
  assert.deepEqual(restored.recovery.autoResumeStepIds, ["timeline", "draft"])
  assert.equal(restored.recovery.requiresUserConfirmation, true)
  assert.equal(restored.recovery.steps[0].shouldRegenerate, false)
})
