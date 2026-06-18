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

async function importTaskModule() {
  const sourcePath = path.join(projectRoot, "lib", "video-task.ts")
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
  const outDir = path.join(tmpdir(), "ta-huo-video-task-tests")
  await mkdir(outDir, { recursive: true })
  const compiledPath = path.join(outDir, `video-task-${Date.now()}.mjs`)
  await writeFile(compiledPath, output.outputText, "utf8")
  return import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`)
}

test("new video tasks expose the complete stage-one workflow shell", async () => {
  const { createVideoTask, VIDEO_WORKFLOW_STEPS } = await importTaskModule()
  const task = createVideoTask({ title: "小白也能做短视频" })

  assert.equal(task.title, "小白也能做短视频")
  assert.equal(task.status, "draft")
  assert.deepEqual(
    VIDEO_WORKFLOW_STEPS.map((step) => step.id),
    [
      "source",
      "script",
      "package",
      "storyboard",
      "assets",
      "voice",
      "edit",
      "publish",
      "record",
    ]
  )
  assert.deepEqual(
    task.workflow.map((step) => step.title),
    [
      "爆款来源",
      "脚本生成",
      "套餐和时长",
      "分镜和提示词",
      "素材生成和素材库",
      "配音和字幕",
      "剪辑预览和导出",
      "发布确认",
      "任务记录",
    ]
  )
  assert.equal(task.workflow[0].state, "active")
  assert.equal(task.workflow.at(-1).state, "locked")
})

test("video task list persistence sanitizes user visible task state", async () => {
  const {
    createVideoTask,
    saveVideoTasks,
    readVideoTasks,
    VIDEO_TASKS_STORAGE_KEY,
  } = await importTaskModule()
  const storage = new Map()
  const browserStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  }
  const task = createVideoTask({ title: "  " })

  saveVideoTasks([task], browserStorage)

  assert.equal(task.title, "未命名视频任务")
  assert.equal(storage.has(VIDEO_TASKS_STORAGE_KEY), true)
  assert.equal(readVideoTasks(browserStorage)[0].workflow.length, 9)
})

test("production step recovery auto-resumes safe failed work and preserves successful assets", async () => {
  const {
    createVideoRecoverySnapshot,
    planVideoTaskRecovery,
  } = await importTaskModule()
  const snapshot = createVideoRecoverySnapshot({
    taskId: "task_recover",
    steps: [
      { id: "images", state: "success", assetIds: ["img_01", "img_02"] },
      { id: "tts", state: "failed", reason: "local tts crashed" },
      { id: "subtitles", state: "waiting" },
      { id: "timeline", state: "waiting" },
      { id: "draft", state: "waiting" },
    ],
  })
  const recovery = planVideoTaskRecovery(snapshot, {
    hasApiBackup: true,
    localTtsAvailable: true,
  })

  assert.deepEqual(recovery.autoResumeStepIds, [
    "tts",
    "subtitles",
    "timeline",
    "draft",
  ])
  assert.deepEqual(recovery.preservedAssetIds, ["img_01", "img_02"])
  assert.equal(recovery.requiresUserConfirmation, false)
  assert.equal(
    recovery.steps.find((step) => step.id === "images").shouldRegenerate,
    false
  )
})

test("recovery pauses when no API backup or local TTS is available", async () => {
  const {
    createVideoRecoverySnapshot,
    planVideoTaskRecovery,
  } = await importTaskModule()
  const snapshot = createVideoRecoverySnapshot({
    taskId: "task_recover",
    steps: [
      { id: "images", state: "failed", reason: "all image profiles failed" },
      { id: "tts", state: "failed", reason: "missing local tts project" },
    ],
  })
  const recovery = planVideoTaskRecovery(snapshot, {
    hasApiBackup: false,
    localTtsAvailable: false,
  })

  assert.deepEqual(recovery.autoResumeStepIds, [])
  assert.deepEqual(recovery.pauseReasons, [
    "images:no_api_backup",
    "tts:local_tts_unavailable",
  ])
  assert.equal(recovery.taskStatus, "paused")
})

test("destructive recovery actions require manual confirmation", async () => {
  const {
    createVideoRecoverySnapshot,
    planVideoTaskRecovery,
  } = await importTaskModule()
  const snapshot = createVideoRecoverySnapshot({
    taskId: "task_recover",
    steps: [
      { id: "publish", state: "waiting" },
      { id: "overwrite", state: "waiting" },
      { id: "delete", state: "waiting" },
      { id: "manual_edit_replace", state: "waiting" },
    ],
  })
  const recovery = planVideoTaskRecovery(snapshot, {
    hasApiBackup: true,
    localTtsAvailable: true,
  })

  assert.equal(recovery.requiresUserConfirmation, true)
  assert.deepEqual(recovery.manualStepIds, [
    "publish",
    "overwrite",
    "delete",
    "manual_edit_replace",
  ])
  assert.equal(recovery.taskStatus, "paused")
})
