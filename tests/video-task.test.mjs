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

test("video task list persistence keeps recovery execution summary", async () => {
  const {
    createVideoTask,
    saveVideoTasks,
    readVideoTasks,
  } = await importTaskModule()
  const storage = new Map()
  const browserStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  }
  const task = createVideoTask({ title: "恢复续跑" })
  task.recovery = {
    taskId: task.id,
    taskStatus: "paused",
    steps: [
      { id: "images", state: "success", assetIds: ["img_01"] },
      { id: "tts", state: "failed", reason: "local tts unavailable" },
    ],
    autoResumeStepIds: ["tts"],
    manualStepIds: [],
    preservedAssetIds: ["img_01"],
    pauseReasons: ["local tts unavailable"],
    requiresUserConfirmation: false,
    completedStepIds: [],
    failedStepIds: ["tts"],
    pendingStepIds: [],
    skippedStepIds: ["images"],
  }

  saveVideoTasks([task], browserStorage)

  const [restored] = readVideoTasks(browserStorage)
  assert.equal(restored.recovery.taskId, task.id)
  assert.deepEqual(restored.recovery.failedStepIds, ["tts"])
  assert.deepEqual(restored.recovery.preservedAssetIds, ["img_01"])
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

test("recovery executor runs only safe auto-resume steps and skips preserved assets", async () => {
  const {
    createVideoRecoverySnapshot,
    planVideoTaskRecovery,
    executeVideoTaskRecovery,
  } = await importTaskModule()
  const snapshot = createVideoRecoverySnapshot({
    taskId: "task_recover",
    steps: [
      { id: "images", state: "success", assetIds: ["img_01"] },
      { id: "tts", state: "failed", reason: "transient local tts failure" },
      { id: "subtitles", state: "waiting" },
      { id: "publish", state: "waiting" },
    ],
  })
  const recovery = planVideoTaskRecovery(snapshot, {
    hasApiBackup: true,
    localTtsAvailable: true,
  })
  const calls = []
  const result = await executeVideoTaskRecovery(recovery, {
    runStep: async (step) => {
      calls.push(step.id)
      return { ok: true, assetIds: [`${step.id}_asset`] }
    },
  })

  assert.deepEqual(calls, ["tts", "subtitles"])
  assert.deepEqual(result.completedStepIds, ["tts", "subtitles"])
  assert.deepEqual(result.skippedStepIds, ["images", "publish"])
  assert.deepEqual(result.preservedAssetIds, ["img_01"])
  assert.equal(
    result.steps.find((step) => step.id === "tts").state,
    "success"
  )
  assert.equal(
    result.steps.find((step) => step.id === "publish").state,
    "needs_manual"
  )
})

test("recovery executor pauses remaining safe steps after a resume failure", async () => {
  const {
    createVideoRecoverySnapshot,
    planVideoTaskRecovery,
    executeVideoTaskRecovery,
  } = await importTaskModule()
  const recovery = planVideoTaskRecovery(
    createVideoRecoverySnapshot({
      taskId: "task_recover",
      steps: [
        { id: "tts", state: "failed" },
        { id: "subtitles", state: "waiting" },
      ],
    }),
    { hasApiBackup: true, localTtsAvailable: true }
  )
  const result = await executeVideoTaskRecovery(recovery, {
    runStep: async (step) => ({
      ok: step.id !== "tts",
      reason: "tts still unavailable",
    }),
  })

  assert.deepEqual(result.completedStepIds, [])
  assert.deepEqual(result.failedStepIds, ["tts"])
  assert.deepEqual(result.pendingStepIds, ["subtitles"])
  assert.equal(result.taskStatus, "paused")
})
