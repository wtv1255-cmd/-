import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
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
