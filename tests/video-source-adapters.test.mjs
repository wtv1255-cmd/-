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

async function importSourceAdaptersModule() {
  const sourcePath = path.join(projectRoot, "lib", "video-source-adapters.ts")
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
  const outDir = path.join(tmpdir(), "ta-huo-video-source-adapter-tests")
  await mkdir(outDir, { recursive: true })
  const compiledPath = path.join(outDir, `video-source-adapters-${Date.now()}.mjs`)
  await writeFile(compiledPath, output.outputText, "utf8")
  return import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`)
}

test("source collection supports 24-48h and 7d adapter modes", async () => {
  const {
    VIRAL_SOURCE_COLLECTION_MODES,
    collectViralSourceCandidates,
    createAdapterCandidate,
  } = await importSourceAdaptersModule()
  const adapterCalls = []
  const adapter = {
    id: "fixture-public",
    label: "Fixture public adapter",
    collect: async (request) => {
      adapterCalls.push(request)
      return {
        ok: true,
        adapterId: "fixture-public",
        candidates: [
          createAdapterCandidate({
            id: "candidate-1",
            title: "爆款拆解",
            author: "她火研究员",
            publishedAt: "2026-06-14T09:00:00+08:00",
            durationSeconds: 48,
            metrics: { likes: 12000, comments: 88, favorites: 430, shares: 51 },
          }),
        ],
      }
    },
  }

  assert.deepEqual(VIRAL_SOURCE_COLLECTION_MODES, ["recent_24_48h", "stable_7d"])

  const recent = await collectViralSourceCandidates({
    keyword: "剪映爆款",
    mode: "recent_24_48h",
    adapters: [adapter],
  })
  const stable = await collectViralSourceCandidates({
    keyword: "剪映爆款",
    mode: "stable_7d",
    adapters: [adapter],
  })

  assert.equal(recent.candidates[0].title, "爆款拆解")
  assert.equal(recent.candidates[0].metrics.likes, 12000)
  assert.equal(stable.mode, "stable_7d")
  assert.equal(adapterCalls[0].mode, "recent_24_48h")
  assert.equal(adapterCalls[1].mode, "stable_7d")
})

test("automatic collection failure keeps manual import available", async () => {
  const { collectViralSourceCandidates } = await importSourceAdaptersModule()
  const failed = await collectViralSourceCandidates({
    keyword: "登录态失效",
    mode: "recent_24_48h",
    adapters: [
      {
        id: "authorized-douyin-browser",
        label: "授权抖音浏览器",
        collect: async () => ({
          ok: false,
          adapterId: "authorized-douyin-browser",
          reason: "login_required",
          message: "需要用户重新登录或处理风控",
        }),
      },
    ],
  })

  assert.equal(failed.candidates.length, 0)
  assert.equal(failed.manualImportAvailable, true)
  assert.equal(failed.failures[0].reason, "login_required")
  assert.match(failed.summary, /手动导入/)
})

test("manual link and local upload imports create safe source metadata", async () => {
  const {
    createDouyinLinkSourceCandidate,
    createLocalUploadSourceCandidate,
  } = await importSourceAdaptersModule()

  const linkCandidate = createDouyinLinkSourceCandidate({
    url: " https://www.douyin.com/video/123456 ",
    title: "用户粘贴的爆款链接",
  })
  const localCandidate = createLocalUploadSourceCandidate({
    filename: "demo source.mp4",
    bytes: 1024 * 1024 * 8,
    mimeType: "video/mp4",
    durationSeconds: 61,
  })
  const serialized = JSON.stringify([linkCandidate, localCandidate])

  assert.equal(linkCandidate.sourceKind, "douyin_link")
  assert.equal(linkCandidate.url, "https://www.douyin.com/video/123456")
  assert.equal(localCandidate.sourceKind, "local_upload")
  assert.equal(localCandidate.localFile.filename, "demo-source.mp4")
  assert.equal(serialized.includes("cookie"), false)
  assert.equal(serialized.includes("authorization"), false)
})
