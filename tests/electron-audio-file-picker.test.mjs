import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)

test("desktop bridge exposes an audio picker for tts voice samples and manual audio", async () => {
  const [mainSource, preloadSource, themeProviderSource] = await Promise.all([
    readFile(path.join(projectRoot, "electron", "main.mjs"), "utf8"),
    readFile(path.join(projectRoot, "electron", "preload.cjs"), "utf8"),
    readFile(path.join(projectRoot, "components", "theme-provider.tsx"), "utf8"),
  ])

  assert.match(mainSource, /ta-huo:select-audio-file/)
  assert.match(mainSource, /ta-huo:synthesize-local-tts/)
  assert.match(mainSource, /ta-huo:copy-task-asset-file/)
  assert.match(mainSource, /ta-huo:delete-task-cache/)
  assert.match(mainSource, /ta-huo:append-task-run-event/)
  assert.match(mainSource, /ta-huo:read-task-run-events/)
  assert.match(mainSource, /ta-huo:read-task-run-summary/)
  assert.match(mainSource, /ta-huo:clear-task-run-log/)
  assert.match(mainSource, /showOpenDialog/)
  assert.match(mainSource, /extensions: \["wav", "mp3", "m4a", "flac", "aac", "ogg"\]/)
  assert.match(preloadSource, /selectAudioFile/)
  assert.match(preloadSource, /ta-huo:select-audio-file/)
  assert.match(preloadSource, /synthesizeLocalTts/)
  assert.match(preloadSource, /ta-huo:synthesize-local-tts/)
  assert.match(preloadSource, /copyTaskAssetFile/)
  assert.match(preloadSource, /ta-huo:copy-task-asset-file/)
  assert.match(preloadSource, /deleteTaskCache/)
  assert.match(preloadSource, /ta-huo:delete-task-cache/)
  assert.match(preloadSource, /appendTaskRunEvent/)
  assert.match(preloadSource, /ta-huo:append-task-run-event/)
  assert.match(preloadSource, /readTaskRunEvents/)
  assert.match(preloadSource, /ta-huo:read-task-run-events/)
  assert.match(preloadSource, /readTaskRunSummary/)
  assert.match(preloadSource, /ta-huo:read-task-run-summary/)
  assert.match(preloadSource, /clearTaskRunLog/)
  assert.match(preloadSource, /ta-huo:clear-task-run-log/)
  assert.match(themeProviderSource, /selectAudioFile/)
  assert.match(themeProviderSource, /copyTaskAssetFile/)
  assert.match(themeProviderSource, /deleteTaskCache/)
  assert.match(themeProviderSource, /appendTaskRunEvent/)
  assert.match(themeProviderSource, /readTaskRunEvents/)
  assert.match(themeProviderSource, /readTaskRunSummary/)
  assert.match(themeProviderSource, /clearTaskRunLog/)
  assert.match(themeProviderSource, /filePath/)
})
