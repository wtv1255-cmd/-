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

async function importApiProfilesModule() {
  const sourcePath = path.join(projectRoot, "lib", "api-profiles.ts")
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
  const outDir = path.join(tmpdir(), "ta-huo-api-profiles-tests")
  await mkdir(outDir, { recursive: true })
  const compiledPath = path.join(outDir, `api-profiles-${Date.now()}.mjs`)
  await writeFile(compiledPath, output.outputText, "utf8")
  return import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`)
}

test("api profile store supports text image video and publish service groups", async () => {
  const {
    API_PROFILE_SERVICES,
    createDefaultApiProfileStore,
    upsertApiProfile,
    resolveApiProfile,
  } = await importApiProfilesModule()
  let store = createDefaultApiProfileStore()
  store = upsertApiProfile(store, {
    id: "text-main",
    service: "text_model",
    label: "文本主模型",
    apiBaseUrl: "https://text.example.com/v1/",
    model: " claude-opus-4-6-thinking ",
    apiKey: " fixture-text-secret ",
  })

  assert.deepEqual(API_PROFILE_SERVICES, [
    "text_model",
    "image_generation",
    "video_parsing",
    "publish_helper",
  ])
  assert.equal(store.activeProfileByService.text_model, "text-main")
  assert.equal(resolveApiProfile(store, "text_model").apiBaseUrl, "https://text.example.com/v1")
  assert.equal(resolveApiProfile(store, "text_model").model, "claude-opus-4-6-thinking")
  assert.equal(resolveApiProfile(store, "text_model").apiKey, "fixture-text-secret")
})

test("api profile export and task logs never include credentials", async () => {
  const {
    createDefaultApiProfileStore,
    upsertApiProfile,
    sanitizeApiProfileStoreForExport,
    createApiProfileLogEntry,
    buildApiProfileRequestContext,
  } = await importApiProfilesModule()
  let store = createDefaultApiProfileStore()
  store = upsertApiProfile(store, {
    id: "video-parser",
    service: "video_parsing",
    label: "视频解析",
    apiBaseUrl: "https://video.example.com/v1",
    apiKey: "fixture-video-secret",
  })
  const requestContext = buildApiProfileRequestContext(store, "video_parsing")
  const exported = sanitizeApiProfileStoreForExport(store)
  const logEntry = createApiProfileLogEntry(store, "video_parsing")
  const exportedText = JSON.stringify(exported)
  const logText = JSON.stringify(logEntry)

  assert.equal(requestContext.apiKey, "fixture-video-secret")
  assert.equal(requestContext.model, "video_parsing-default")
  assert.equal(exportedText.includes("fixture-video-secret"), false)
  assert.equal(logText.includes("fixture-video-secret"), false)
  assert.equal(logEntry.configured, true)
  assert.equal(logEntry.apiKey, undefined)
})

test("api profile store survives local storage roundtrip", async () => {
  const {
    API_PROFILES_STORAGE_KEY,
    createDefaultApiProfileStore,
    readApiProfileStore,
    saveApiProfileStore,
    upsertApiProfile,
  } = await importApiProfilesModule()
  const storage = new Map()
  const browserStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  }
  const store = upsertApiProfile(createDefaultApiProfileStore(), {
    id: "publish-helper",
    service: "publish_helper",
    label: "发布辅助",
    apiBaseUrl: "https://publish.example.com/v1",
    apiKey: "fixture-publish-secret",
  })

  saveApiProfileStore(store, browserStorage)
  const restored = readApiProfileStore(browserStorage)

  assert.equal(storage.has(API_PROFILES_STORAGE_KEY), true)
  assert.equal(restored.activeProfileByService.publish_helper, "publish-helper")
  assert.equal(restored.profiles.publish_helper[0].apiKey, "fixture-publish-secret")
})
