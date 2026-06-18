import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)

async function readVideoPage() {
  return readFile(path.join(projectRoot, "app", "video", "page.tsx"), "utf8")
}

test("video factory uses seven top modules instead of one long wall", async () => {
  const source = await readVideoPage()
  const labels = [
    "任务总览",
    "文案",
    "分镜",
    "素材",
    "配音字幕",
    "剪辑草稿",
    "设置",
  ]

  for (const label of labels) {
    assert.match(source, new RegExp(`label: "${label}"`))
  }

  assert.match(source, /aria-label="视频工厂模块"/)
  assert.match(source, /useState<VideoFactoryModuleId>\("overview"\)/)
  assert.match(source, /activeModule === "overview"/)
  assert.match(source, /activeModule === "script"/)
  assert.match(source, /activeModule === "storyboard"/)
  assert.match(source, /activeModule === "assets"/)
  assert.match(source, /activeModule === "voice"/)
  assert.match(source, /activeModule === "draft"/)
  assert.match(source, /activeModule === "settings"/)
})
