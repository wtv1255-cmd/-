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
    embedModelInPackage: true,
  })

  assert.equal(settings.projectPath, "D:\\Index-TTS2_ZZDH")
  assert.equal(settings.launchCommand, "webui.py")
  assert.deepEqual(settings.launchArgs, ["--port", "7861"])
  assert.equal(settings.embedModelInPackage, false)
})
