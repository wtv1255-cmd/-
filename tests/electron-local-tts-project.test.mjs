import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
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

test("local IndexTTS2 synthesis writes cloned narration from reference audio", async () => {
  const { synthesizeLocalTtsWithReference } = await importLocalTtsProjectModule()
  const userDataDir = await mkdtemp(path.join(tmpdir(), "ta-huo-user-data-"))
  const projectDir = await mkdtemp(path.join(tmpdir(), "ta-huo-tts-project-"))
  const referenceAudioPath = path.join(projectDir, "voice-sample.mp3")

  try {
    await writeFile(path.join(projectDir, "webui.py"), "print('webui')", "utf8")
    await writeFile(path.join(projectDir, "启动webui.bat"), "@echo off", "utf8")
    await mkdir(path.join(projectDir, "checkpoints"))
    await mkdir(path.join(projectDir, "venv", "Scripts"), { recursive: true })
    await writeFile(path.join(projectDir, "venv", "Scripts", "python.exe"), "")
    await writeFile(referenceAudioPath, "sample-audio", "utf8")

    const calls = []
    const result = await synthesizeLocalTtsWithReference({
      userDataDir,
      input: {
        taskId: "task_01",
        text: "这是一段需要克隆音色的完整文案。",
        projectPath: projectDir,
        referenceAudioPath,
        outputFilename: "cloned-voice.wav",
        maxTextTokensPerSegment: 88,
      },
      runProcess: async ({ payloadPath }) => {
        const payload = JSON.parse(await readFile(payloadPath, "utf8"))
        calls.push(payload)
        await writeFile(payload.outputPath, "generated voice", "utf8")
        return {
          status: 0,
          stdout: JSON.stringify({ ok: true, durationMs: 4321 }),
          stderr: "",
        }
      },
    })

    assert.equal(result.ok, true)
    assert.equal(result.taskId, "task_01")
    assert.equal(result.filename, "cloned-voice.wav")
    assert.match(result.filePath, /task_01[\\/]voice_audio[\\/]cloned-voice\.wav$/)
    assert.equal(result.mimeType, "audio/wav")
    assert.equal(result.durationMs, 4321)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].text, "这是一段需要克隆音色的完整文案。")
    assert.equal(calls[0].referenceAudioPath, referenceAudioPath)
    assert.equal(calls[0].maxTextTokensPerSegment, 88)
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
    await rm(projectDir, { force: true, recursive: true })
  }
})
