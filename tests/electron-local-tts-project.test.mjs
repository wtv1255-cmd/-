import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)

async function importLocalTtsProjectModule() {
  const modulePath = path.join(projectRoot, "electron", "local-tts-project.mjs")
  return import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`)
}

test("local tts project check detects the configured IndexTTS2 directory", async () => {
  const { checkLocalTtsProject } = await importLocalTtsProjectModule()
  const result = checkLocalTtsProject({
    projectPath: "D:/Index-TTS2_ZZDH/",
  })

  assert.equal(result.projectPath, "D:\\Index-TTS2_ZZDH")
  assert.equal(result.ok, true)
  assert.deepEqual(result.missing, [])
})

test("local tts project check reports missing runtime pieces", async () => {
  const { checkLocalTtsProject } = await importLocalTtsProjectModule()
  const projectDir = await mkdtemp(path.join(tmpdir(), "ta-huo-tts-project-"))

  try {
    await writeFile(path.join(projectDir, "webui.py"), "print('webui')", "utf8")
    await mkdir(path.join(projectDir, "checkpoints"))

    const result = checkLocalTtsProject({ projectPath: projectDir })

    assert.equal(result.ok, false)
    assert.equal(result.exists, true)
    assert.deepEqual(result.missing.sort(), ["venv", "启动webui.bat"].sort())
  } finally {
    await rm(projectDir, { force: true, recursive: true })
  }
})
