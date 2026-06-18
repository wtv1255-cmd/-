import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import ts from "typescript"

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)

async function importCodexProxyModule() {
  const sourcePath = path.join(projectRoot, "lib", "server", "codex-proxy.ts")
  const source = (await readFile(sourcePath, "utf8")).replace(
    'import { NextResponse } from "next/server"',
    "const NextResponse = { json: (body, init) => ({ body, init }) }"
  )
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
  const outDir = path.join(projectRoot, ".tmp-tests")
  await mkdir(outDir, { recursive: true })
  const compiledPath = path.join(outDir, `codex-proxy-${Date.now()}.mjs`)
  await writeFile(compiledPath, output.outputText, "utf8")
  return import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`)
}

test("openai-compatible v1 image bases use images endpoint payloads", async () => {
  const {
    buildImageJsonPayload,
    resolveImageGenerationPath,
    shouldUseOpenAiImageEndpoint,
  } = await importCodexProxyModule()

  assert.equal(
    resolveImageGenerationPath({
      apiBaseUrl: "https://kfcoding.codes/v1",
      model: "gpt-image-1",
    }),
    "/v1/images/generations"
  )
  assert.equal(
    shouldUseOpenAiImageEndpoint({
      apiBaseUrl: "https://kfcoding.codes/v1",
      model: "gpt-image-1",
    }),
    true
  )

  const result = buildImageJsonPayload({
    apiBaseUrl: "https://kfcoding.codes/v1",
    apiKey: "fixture",
    model: "gpt-image-1",
    prompt: "黑白火柴人，白底黑线",
    size: "1024x1792",
    quality: "high",
  })

  assert.equal("error" in result, false)
  assert.equal(result.payload.model, "gpt-image-1")
  assert.equal(result.payload.size, "1024x1792")
  assert.equal(result.payload.quality, "high")
  assert.equal("aspect_ratio" in result.payload, false)
})

test("openai-compatible image bases normalize gpt-image-2 resolution aliases", async () => {
  const { buildImageJsonPayload, resolveImageGenerationPath } =
    await importCodexProxyModule()

  assert.equal(
    resolveImageGenerationPath({
      apiBaseUrl: "https://kfcoding.codes/v1",
      model: "gpt-image-2-2K",
    }),
    "/v1/images/generations"
  )

  const result = buildImageJsonPayload({
    apiBaseUrl: "https://kfcoding.codes/v1",
    apiKey: "fixture",
    model: "gpt-image-2-2K",
    prompt: "黑白火柴人，白底黑线，竖屏",
    size: "1024x1792",
  })

  assert.equal("error" in result, false)
  assert.equal(result.payload.model, "gpt-image-2")
  assert.equal(result.payload.size, "1024x1792")
  assert.equal("aspect_ratio" in result.payload, false)
})

test("521 image base keeps legacy async video image task route", async () => {
  const { buildImageJsonPayload, resolveImageGenerationPath } =
    await importCodexProxyModule()

  assert.equal(
    resolveImageGenerationPath({
      apiBaseUrl: "https://www.521xxz.com",
      model: "gpt-image-2-2K",
    }),
    "/v1/videos"
  )

  const result = buildImageJsonPayload({
    apiBaseUrl: "https://www.521xxz.com",
    apiKey: "fixture",
    model: "gpt-image-2-2K",
    prompt: "竖屏 9:16 火柴人",
    size: "1024x1792",
  })

  assert.equal("error" in result, false)
  assert.equal(result.payload.model, "gpt-image-2-2K")
  assert.equal(result.payload.aspect_ratio, "9:16")
})
