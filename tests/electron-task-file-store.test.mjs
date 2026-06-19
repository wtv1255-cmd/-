import assert from "node:assert/strict"
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)

async function importTaskFileStoreModule() {
  const modulePath = path.join(projectRoot, "electron", "task-file-store.mjs")
  return import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`)
}

test("task asset files are saved under task-scoped directories with preview data url", async () => {
  const { readTaskAssetPreview, saveTaskAssetFile } =
    await importTaskFileStoreModule()
  const userDataDir = await mkdtemp(path.join(tmpdir(), "ta-huo-task-file-"))

  try {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const result = await saveTaskAssetFile({
      userDataDir,
      input: {
        taskId: "../video:01",
        kind: "stickman_image",
        filename: "../shot_01?.png",
        mimeType: "image/png",
        data: bytes.buffer,
      },
    })
    const stored = await readFile(result.filePath)
    const preview = await readTaskAssetPreview({
      userDataDir,
      input: {
        filePath: result.filePath,
        mimeType: result.mimeType,
      },
    })

    assert.equal(result.ok, true)
    assert.equal(path.relative(userDataDir, result.filePath).startsWith(".."), false)
    assert.match(result.filePath, /video-01[\\/]stickman_image[\\/]shot_01-.png$/)
    assert.deepEqual([...stored], [1, 2, 3, 4])
    assert.equal(result.dataUrl, "data:image/png;base64,AQIDBA==")
    assert.equal(preview.dataUrl, "data:image/png;base64,AQIDBA==")
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
  }
})

test("task asset preview refuses files outside the task directory", async () => {
  const { readTaskAssetPreview } = await importTaskFileStoreModule()
  const userDataDir = await mkdtemp(path.join(tmpdir(), "ta-huo-task-file-safe-"))

  try {
    await assert.rejects(
      () =>
        readTaskAssetPreview({
          userDataDir,
          input: {
            filePath: path.join(tmpdir(), "outside.png"),
            mimeType: "image/png",
          },
        }),
      /任务目录/
    )
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
  }
})

test("task asset files can be copied from an existing manual audio file", async () => {
  const { copyTaskAssetFile } = await importTaskFileStoreModule()
  const userDataDir = await mkdtemp(path.join(tmpdir(), "ta-huo-task-file-copy-"))
  const sourceDir = await mkdtemp(path.join(tmpdir(), "ta-huo-source-audio-"))
  const sourcePath = path.join(sourceDir, "manual voice.mp3")

  try {
    await writeFile(sourcePath, new Uint8Array([7, 8, 9]))
    const result = await copyTaskAssetFile({
      userDataDir,
      input: {
        taskId: "task_01",
        kind: "voice_audio",
        sourcePath,
        filename: "manual voice.mp3",
        mimeType: "audio/mpeg",
      },
    })
    const stored = await readFile(result.filePath)

    assert.equal(result.ok, true)
    assert.equal(path.relative(userDataDir, result.filePath).startsWith(".."), false)
    assert.match(result.filePath, /task_01[\\/]voice_audio[\\/]manual-voice.mp3$/)
    assert.deepEqual([...stored], [7, 8, 9])
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
    await rm(sourceDir, { force: true, recursive: true })
  }
})

test("deleting a video task removes its app cache without touching Jianying draft roots", async () => {
  const { deleteTaskCache } = await importTaskFileStoreModule()
  const userDataDir = await mkdtemp(path.join(tmpdir(), "ta-huo-task-delete-"))
  const jianyingDraftsRoot = await mkdtemp(path.join(tmpdir(), "ta-huo-jy-drafts-"))
  const taskDir = path.join(userDataDir, "tasks", "task_01")
  const imagePath = path.join(taskDir, "stickman_image", "shot.png")
  const audioPath = path.join(taskDir, "voice_audio", "voice.wav")
  const externalDraftPath = path.join(jianyingDraftsRoot, "task_01")

  try {
    await mkdir(path.dirname(imagePath), { recursive: true })
    await mkdir(path.dirname(audioPath), { recursive: true })
    await mkdir(externalDraftPath, { recursive: true })
    await writeFile(imagePath, new Uint8Array([1, 2, 3]))
    await writeFile(audioPath, new Uint8Array([4, 5, 6]))
    await writeFile(path.join(externalDraftPath, "draft_content.json"), "{}")

    const result = await deleteTaskCache({
      userDataDir,
      input: { taskId: "task_01" },
    })

    assert.equal(result.ok, true)
    assert.equal(result.taskId, "task_01")
    assert.match(result.deletedPath, /tasks[\\/]task_01$/)
    await assert.rejects(() => stat(taskDir), /ENOENT/)
    assert.equal((await stat(externalDraftPath)).isDirectory(), true)
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
    await rm(jianyingDraftsRoot, { force: true, recursive: true })
  }
})

test("task run progress events persist as jsonl and restore a summary", async () => {
  const {
    appendTaskRunEvent,
    readTaskRunEvents,
    readTaskRunSummary,
  } = await importTaskFileStoreModule()
  const userDataDir = await mkdtemp(path.join(tmpdir(), "ta-huo-task-progress-"))

  try {
    const first = await appendTaskRunEvent({
      userDataDir,
      input: {
        taskId: "task_01",
        stage: "script",
        state: "running",
        message: "正在请求文本模型 rewrite_b",
      },
    })
    const second = await appendTaskRunEvent({
      userDataDir,
      input: {
        taskId: "task_01",
        stage: "images",
        state: "running",
        message: "正在生成第 3/12 张火柴人图",
        current: 3,
        total: 12,
      },
    })
    const events = await readTaskRunEvents({
      userDataDir,
      input: { taskId: "task_01" },
    })
    const summary = await readTaskRunSummary({
      userDataDir,
      input: { taskId: "task_01" },
    })
    const jsonl = await readFile(
      path.join(userDataDir, "tasks", "task_01", "run_logs", "progress.jsonl"),
      "utf8"
    )

    assert.equal(first.ok, true)
    assert.equal(second.summary.current, 3)
    assert.equal(events.events.length, 2)
    assert.equal(events.events[1].message, "正在生成第 3/12 张火柴人图")
    assert.equal(summary.summary.stage, "images")
    assert.equal(summary.summary.total, 12)
    assert.equal(jsonl.trim().split(/\r?\n/u).length, 2)
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
  }
})

test("task run progress refuses path traversal task ids", async () => {
  const { appendTaskRunEvent } = await importTaskFileStoreModule()
  const userDataDir = await mkdtemp(
    path.join(tmpdir(), "ta-huo-task-progress-safe-")
  )

  try {
    await assert.rejects(
      () =>
        appendTaskRunEvent({
          userDataDir,
          input: {
            taskId: "../outside",
            stage: "images",
            state: "running",
            message: "bad",
          },
        }),
      /任务 ID/
    )
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
  }
})

test("deleting a video task cache refuses path traversal task ids", async () => {
  const { deleteTaskCache } = await importTaskFileStoreModule()
  const userDataDir = await mkdtemp(path.join(tmpdir(), "ta-huo-task-delete-safe-"))

  try {
    await assert.rejects(
      () =>
        deleteTaskCache({
          userDataDir,
          input: { taskId: "../outside" },
        }),
      /任务 ID/
    )
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
  }
})
