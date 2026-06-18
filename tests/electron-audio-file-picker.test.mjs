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
  assert.match(mainSource, /showOpenDialog/)
  assert.match(mainSource, /extensions: \["wav", "mp3", "m4a", "flac", "aac", "ogg"\]/)
  assert.match(preloadSource, /selectAudioFile/)
  assert.match(preloadSource, /ta-huo:select-audio-file/)
  assert.match(themeProviderSource, /selectAudioFile/)
  assert.match(themeProviderSource, /filePath/)
})
