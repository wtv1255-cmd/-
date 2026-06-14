import assert from "node:assert/strict"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)

async function importRendererModule() {
  const modulePath = path.join(projectRoot, "electron", "video-renderer.mjs")
  return import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`)
}

const readyTimeline = {
  taskId: "task_01",
  durationMs: 1200,
  tracks: [
    {
      id: "visual",
      type: "visual",
      clips: [
        {
          id: "clip_01",
          assetId: "asset_01",
          startMs: 0,
          durationMs: 1200,
        },
      ],
    },
  ],
}

test("ffmpeg renderer creates a real task-scoped MP4 file", async () => {
  const { renderTimelineWithFfmpeg } = await importRendererModule()
  const userDataDir = await mkdtemp(path.join(tmpdir(), "ta-huo-render-ok-"))

  try {
    const result = await renderTimelineWithFfmpeg({
      userDataDir,
      taskId: "task_01",
      timeline: readyTimeline,
      outputFilename: "demo.mp4",
    })
    const fileStat = await stat(result.filePath)

    assert.equal(result.ok, true)
    assert.equal(result.mimeType, "video/mp4")
    assert.match(result.filePath, /task_01[\\/]rendered_video[\\/]demo\.mp4$/)
    assert.ok(fileStat.size > 0)
    assert.ok(result.bytes > 0)
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
  }
})

test("ffmpeg renderer constrains output filenames inside task directory", async () => {
  const { renderTimelineWithFfmpeg } = await importRendererModule()
  const userDataDir = await mkdtemp(path.join(tmpdir(), "ta-huo-render-safe-"))

  try {
    const result = await renderTimelineWithFfmpeg({
      userDataDir,
      taskId: "../task:bad",
      timeline: readyTimeline,
      outputFilename: "../escape?.mp4",
    })

    assert.equal(result.ok, true)
    assert.equal(
      path.relative(userDataDir, result.filePath).startsWith(".."),
      false
    )
    assert.match(
      result.filePath,
      /task-bad[\\/]rendered_video[\\/]escape-.mp4$/
    )
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
  }
})

test("ffmpeg renderer returns recoverable failure for empty timelines", async () => {
  const { renderTimelineWithFfmpeg } = await importRendererModule()
  const userDataDir = await mkdtemp(path.join(tmpdir(), "ta-huo-render-fail-"))

  try {
    const result = await renderTimelineWithFfmpeg({
      userDataDir,
      taskId: "task_01",
      timeline: { taskId: "task_01", durationMs: 0, tracks: [] },
      outputFilename: "empty.mp4",
    })

    assert.equal(result.ok, false)
    assert.match(result.error, /VideoTimeline/)
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
  }
})
