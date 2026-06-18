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

async function importVideoTtsModule() {
  const sourcePath = path.join(projectRoot, "lib", "video-tts.ts")
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
  const outDir = path.join(tmpdir(), "ta-huo-video-tts-tests")
  await mkdir(outDir, { recursive: true })
  const compiledPath = path.join(outDir, `video-tts-${Date.now()}.mjs`)
  await writeFile(compiledPath, output.outputText, "utf8")
  return import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`)
}

test("local IndexTTS config keeps the model as an external path", async () => {
  const {
    createDefaultVideoTtsSettings,
    createVideoTtsLaunchPlan,
    sanitizeVideoTtsSettingsForExport,
  } = await importVideoTtsModule()
  const settings = createDefaultVideoTtsSettings()

  assert.equal(settings.engine, "local_indextts2")
  assert.equal(settings.projectPath, "D:\\Index-TTS2_ZZDH")
  assert.equal(settings.embedModelInPackage, false)

  const launchPlan = createVideoTtsLaunchPlan(settings)
  assert.equal(launchPlan.cwd, "D:\\Index-TTS2_ZZDH")
  assert.equal(launchPlan.command, "启动webui.bat")
  assert.equal(launchPlan.args.length, 0)
  assert.match(launchPlan.manualCommand, /^cd \/d "D:\\Index-TTS2_ZZDH"/)

  const safe = sanitizeVideoTtsSettingsForExport(settings)
  assert.equal(JSON.stringify(safe).includes("checkpoints"), false)
  assert.equal(JSON.stringify(safe).includes("venv"), false)
})

test("video tts settings normalize custom paths without enabling model bundling", async () => {
  const { normalizeVideoTtsSettings } = await importVideoTtsModule()
  const settings = normalizeVideoTtsSettings({
    engine: "local_indextts2",
    projectPath: " D:/Index-TTS2_ZZDH/ ",
    launchCommand: " webui.py ",
    launchArgs: ["--port", "7861"],
    referenceAudioPath: " D:/voices/friend.wav ",
    manualAudioPath: " D:/voice/manual.mp3 ",
    embedModelInPackage: true,
  })

  assert.equal(settings.projectPath, "D:\\Index-TTS2_ZZDH")
  assert.equal(settings.launchCommand, "webui.py")
  assert.deepEqual(settings.launchArgs, ["--port", "7861"])
  assert.equal(settings.referenceAudioPath, "D:\\voices\\friend.wav")
  assert.equal(settings.manualAudioPath, "D:\\voice\\manual.mp3")
  assert.equal(settings.embedModelInPackage, false)
})

test("cloud tts settings normalize profile id and avoid bundling reference audio", async () => {
  const {
    createVideoTtsLaunchPlan,
    normalizeVideoTtsSettings,
    sanitizeVideoTtsSettingsForExport,
  } = await importVideoTtsModule()
  const settings = normalizeVideoTtsSettings({
    engine: "cloud_tts",
    cloudProfileId: " cloud-main ",
    referenceAudioPath: " C:/Users/Administrator/Desktop/音色 样本.wav ",
    manualAudioPath: " ",
    embedModelInPackage: true,
  })
  const launchPlan = createVideoTtsLaunchPlan(settings)
  const safe = sanitizeVideoTtsSettingsForExport(settings)
  const serialized = JSON.stringify(safe)

  assert.equal(settings.engine, "cloud_tts")
  assert.equal(settings.cloudProfileId, "cloud-main")
  assert.equal(
    settings.referenceAudioPath,
    "C:\\Users\\Administrator\\Desktop\\音色 样本.wav"
  )
  assert.equal(settings.manualAudioPath, "")
  assert.equal(launchPlan.cloudProfileId, "cloud-main")
  assert.equal(launchPlan.referenceAudioPath.endsWith("音色 样本.wav"), true)
  assert.equal(serialized.includes("data:audio"), false)
  assert.equal(serialized.includes("base64"), false)
  assert.equal(safe.embedModelInPackage, false)
})

test("voice presets allow global defaults and task-level overrides without bundling voices", async () => {
  const {
    COMMON_VIDEO_TTS_VOICE_PRESETS,
    createDefaultVideoTtsSettings,
    resolveVideoTtsVoiceSelection,
    sanitizeVideoTtsSettingsForExport,
  } = await importVideoTtsModule()
  const settings = createDefaultVideoTtsSettings()
  const taskSelection = resolveVideoTtsVoiceSelection({
    settings,
    taskVoicePresetId: "energetic_female",
  })
  const fallbackSelection = resolveVideoTtsVoiceSelection({
    settings: {
      ...settings,
      defaultVoicePresetId: "calm_male",
      taskVoicePresetId: "storyteller_female",
    },
  })
  const safe = sanitizeVideoTtsSettingsForExport(settings)

  assert.deepEqual(
    COMMON_VIDEO_TTS_VOICE_PRESETS.map((preset) => preset.id),
    [
      "recommended_female",
      "energetic_female",
      "calm_male",
      "storyteller_female",
    ]
  )
  assert.equal(settings.defaultVoicePresetId, "recommended_female")
  assert.equal(taskSelection.id, "energetic_female")
  assert.equal(fallbackSelection.id, "storyteller_female")
  assert.equal(JSON.stringify(safe).includes("voiceModelPath"), false)
  assert.equal(JSON.stringify(safe).includes("checkpoint"), false)
})

test("unavailable local tts pauses only the tts step and preserves existing task content", async () => {
  const { createVideoTtsUnavailablePause } = await importVideoTtsModule()
  const task = {
    id: "task_01",
    workflow: [
      { id: "script", state: "done" },
      { id: "storyboard", state: "done" },
      { id: "assets", state: "done" },
      { id: "voice", state: "active" },
      { id: "edit", state: "locked" },
    ],
    voice: { text: "原脚本", subtitles: [] },
    storyboard: [{ id: "shot_01" }],
    assets: [{ id: "asset_01" }],
  }
  const paused = createVideoTtsUnavailablePause({
    task,
    reason: "missing checkpoints",
  })

  assert.equal(paused.workflow.find((step) => step.id === "voice").state, "queued")
  assert.equal(paused.workflow.find((step) => step.id === "script").state, "done")
  assert.deepEqual(paused.voice, task.voice)
  assert.deepEqual(paused.storyboard, task.storyboard)
  assert.deepEqual(paused.assets, task.assets)
  assert.match(paused.ttsStatus, /missing checkpoints/)
})
