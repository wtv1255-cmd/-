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

async function importRenderingModule() {
  const sourcePath = path.join(projectRoot, "lib", "video-rendering.ts")
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
  const outDir = path.join(tmpdir(), "ta-huo-video-rendering-tests")
  await mkdir(outDir, { recursive: true })
  const compiledPath = path.join(outDir, `video-rendering-${Date.now()}.mjs`)
  await writeFile(compiledPath, output.outputText, "utf8")
  return import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`)
}

const readyTimeline = {
  taskId: "task_01",
  durationMs: 45000,
  tracks: [
    {
      id: "visual",
      type: "visual",
      clips: [
        {
          id: "clip_01",
          assetId: "stickman_01",
          startMs: 0,
          durationMs: 15000,
        },
      ],
    },
    {
      id: "subtitle",
      type: "subtitle",
      clips: [
        {
          id: "subtitle_01",
          assetId: "subtitle_01",
          startMs: 0,
          durationMs: 15000,
          text: "小白也能一键生成短视频",
        },
      ],
    },
  ],
}

test("render engine options prefer Jianying and keep built-in fallback recoverable", async () => {
  const { createRenderEngineOptions } = await importRenderingModule()
  const engines = createRenderEngineOptions({
    jianyingAvailable: false,
    ffmpegAvailable: true,
    remotionAvailable: false,
    davinciAvailable: false,
  })

  assert.equal(engines[0].id, "jianying")
  assert.equal(
    engines.find((engine) => engine.id === "ffmpeg").status,
    "available"
  )
  assert.equal(
    engines.find((engine) => engine.id === "davinci").status,
    "disabled"
  )
  assert.match(
    engines.find((engine) => engine.id === "jianying").disabledReason,
    /剪映/
  )
})

test("export plan falls back from unavailable Jianying to FFmpeg MP4 output", async () => {
  const { createRenderEngineOptions, createRenderExportPlan } =
    await importRenderingModule()
  const engines = createRenderEngineOptions({
    jianyingAvailable: false,
    ffmpegAvailable: true,
    remotionAvailable: false,
    davinciAvailable: false,
  })
  const plan = createRenderExportPlan({
    taskId: "task_01",
    timeline: readyTimeline,
    requestedEngineId: "jianying",
    engines,
  })

  assert.equal(plan.status, "fallback_ready")
  assert.equal(plan.engineId, "ffmpeg")
  assert.equal(plan.fallbackFrom, "jianying")
  assert.equal(plan.output.kind, "rendered_video")
  assert.equal(
    plan.output.file.path,
    "%APPDATA%/她火/tasks/task_01/rendered_video/task_01-ffmpeg.mp4"
  )
  assert.equal(plan.previewPath, plan.output.file.path)
  assert.match(plan.command, /^ffmpeg -y -hide_banner/)
})

test("DaVinci unavailability is disabled without blocking built-in export", async () => {
  const { createRenderEngineOptions, createRenderExportPlan } =
    await importRenderingModule()
  const engines = createRenderEngineOptions({
    jianyingAvailable: false,
    ffmpegAvailable: true,
    remotionAvailable: true,
    davinciAvailable: false,
  })
  const davinci = engines.find((engine) => engine.id === "davinci")
  const plan = createRenderExportPlan({
    taskId: "task_01",
    timeline: readyTimeline,
    requestedEngineId: "davinci",
    engines,
  })

  assert.equal(davinci.status, "disabled")
  assert.equal(plan.status, "fallback_ready")
  assert.equal(plan.engineId, "ffmpeg")
  assert.equal(plan.fallbackFrom, "davinci")
})
