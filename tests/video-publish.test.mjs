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

async function importPublishModule() {
  const sourcePath = path.join(projectRoot, "lib", "video-publish.ts")
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
  const outDir = path.join(tmpdir(), "ta-huo-video-publish-tests")
  await mkdir(outDir, { recursive: true })
  const compiledPath = path.join(outDir, `video-publish-${Date.now()}.mjs`)
  await writeFile(compiledPath, output.outputText, "utf8")
  return import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`)
}

const baseDraftInput = {
  taskId: "task_demo",
  renderedVideoPath: "D:/exports/demo.mp4",
  titleSeed: "她火一键做短视频",
  scriptSummary: "小白也能把爆款结构拆成原创短视频。",
  coverImagePath: "D:/exports/cover.png",
  account: {
    id: "douyin-main",
    displayName: "主账号",
    platform: "douyin",
    browserProfileId: "work",
    authorized: true,
  },
}

test("publish drafts are editable and never include credentials", async () => {
  const { createPublishDraft, sanitizePublishDraftForExport } =
    await importPublishModule()

  const draft = createPublishDraft(baseDraftInput)
  const exported = sanitizePublishDraftForExport({
    ...draft,
    internalAccessToken: "should-not-export",
  })

  assert.equal(draft.status, "draft")
  assert.match(draft.title, /她火一键做短视频/)
  assert.ok(draft.topics.includes("她火助手"))
  assert.equal(exported.account.displayName, "主账号")
  assert.equal("internalAccessToken" in exported, false)
  assert.equal(JSON.stringify(exported).includes("should-not-export"), false)
})

test("publish cannot start without confirmation and an authorized browser profile", async () => {
  const { createPublishDraft, startAuthorizedPublish } =
    await importPublishModule()
  const draft = createPublishDraft(baseDraftInput)

  const notConfirmed = startAuthorizedPublish(draft, { confirmed: false })
  const missingProfile = startAuthorizedPublish(
    {
      ...draft,
      account: { ...draft.account, browserProfileId: "" },
    },
    { confirmed: true }
  )
  const unauthorized = startAuthorizedPublish(
    {
      ...draft,
      account: { ...draft.account, authorized: false },
    },
    { confirmed: true }
  )

  assert.equal(notConfirmed.status, "needs_confirmation")
  assert.equal(missingProfile.status, "blocked")
  assert.equal(missingProfile.manualActionRequired, true)
  assert.match(missingProfile.reason, /浏览器 Profile/)
  assert.equal(unauthorized.status, "blocked")
  assert.match(unauthorized.reason, /未授权/)
})

test("risk controls pause publishing and preserve the exported video path", async () => {
  const {
    createPublishDraft,
    recordPublishAutomationResult,
    startAuthorizedPublish,
  } = await importPublishModule()
  const draft = createPublishDraft(baseDraftInput)
  const pending = startAuthorizedPublish(draft, { confirmed: true })

  const paused = recordPublishAutomationResult(pending, {
    kind: "captcha",
    message: "页面出现验证码",
  })

  assert.equal(paused.status, "paused_for_manual_action")
  assert.equal(paused.manualActionRequired, true)
  assert.equal(paused.renderedVideoPath, "D:/exports/demo.mp4")
  assert.match(paused.pauseReason, /验证码/)
  assert.equal(paused.publishLog.at(-1).kind, "captcha")
})
