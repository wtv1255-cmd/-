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

async function importProgressModule() {
  const sourcePath = path.join(projectRoot, "lib", "video-task-progress.ts")
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
  const outDir = path.join(tmpdir(), "ta-huo-video-task-progress-tests")
  await mkdir(outDir, { recursive: true })
  const compiledPath = path.join(outDir, `video-task-progress-${Date.now()}.mjs`)
  await writeFile(compiledPath, output.outputText, "utf8")
  return import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`)
}

test("task progress events are sanitized and summarize weighted stage progress", async () => {
  const {
    appendVideoTaskRunEvent,
    createVideoTaskRunEvent,
    createVideoTaskRunSummary,
    VIDEO_TASK_RUN_STAGE_WEIGHTS,
  } = await importProgressModule()

  const scriptEvent = createVideoTaskRunEvent({
    taskId: "video_01",
    stage: "script",
    state: "success",
    message: " 文案生成完成\napiKey=should-not-export ",
    current: 1,
    total: 1,
  })
  const imageEvent = createVideoTaskRunEvent({
    taskId: "video_01",
    stage: "images",
    state: "running",
    message: "正在生成第 3/12 张火柴人图",
    current: 3,
    total: 12,
  })
  const summary = createVideoTaskRunSummary(
    appendVideoTaskRunEvent([scriptEvent], imageEvent)
  )

  assert.equal(VIDEO_TASK_RUN_STAGE_WEIGHTS.images, 25)
  assert.equal(scriptEvent.message.includes("\n"), false)
  assert.equal(/apiKey|should-not-export/i.test(scriptEvent.message), false)
  assert.equal(summary.taskId, "video_01")
  assert.equal(summary.state, "running")
  assert.equal(summary.stage, "images")
  assert.equal(summary.current, 3)
  assert.equal(summary.total, 12)
  assert.equal(summary.successCount, 1)
  assert.equal(summary.failureCount, 0)
  assert.equal(summary.needsManual, false)
  assert.equal(summary.progress > 0.15, true)
  assert.equal(summary.progress < 0.4, true)
})

test("task progress summary tracks failures artifacts and manual blockers", async () => {
  const { createVideoTaskRunEvent, createVideoTaskRunSummary } =
    await importProgressModule()

  const events = [
    createVideoTaskRunEvent({
      taskId: "video_02",
      stage: "voice",
      state: "failed",
      message: "本地 TTS 路径不可用",
      error: {
        code: "tts_path_missing",
        message: "请选择 IndexTTS2 工程目录",
        retryable: false,
      },
    }),
    createVideoTaskRunEvent({
      taskId: "video_02",
      stage: "draft",
      state: "artifact",
      message: "剪映草稿已写入",
      artifact: {
        kind: "jianying_draft",
        path: "D:/JianyingPro Drafts/video_02",
        label: "剪映草稿",
      },
    }),
    createVideoTaskRunEvent({
      taskId: "video_02",
      stage: "voice",
      state: "needs_manual",
      message: "等待选择参考音频",
    }),
  ]
  const summary = createVideoTaskRunSummary(events)

  assert.equal(summary.taskId, "video_02")
  assert.equal(summary.state, "needs_manual")
  assert.equal(summary.stage, "voice")
  assert.equal(summary.failureCount, 1)
  assert.equal(summary.needsManual, true)
  assert.equal(summary.latestArtifact?.path, "D:/JianyingPro Drafts/video_02")
})

test("task progress event history keeps the latest 200 entries", async () => {
  const { appendVideoTaskRunEvent, createVideoTaskRunEvent } =
    await importProgressModule()
  let events = []

  for (let index = 0; index < 205; index += 1) {
    events = appendVideoTaskRunEvent(
      events,
      createVideoTaskRunEvent({
        taskId: "video_03",
        stage: "images",
        state: "running",
        message: `图片 ${index}`,
      })
    )
  }

  assert.equal(events.length, 200)
  assert.equal(events[0].message, "图片 5")
  assert.equal(events.at(-1).message, "图片 204")
})
