import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)

async function importJianyingDraftModule() {
  const modulePath = path.join(projectRoot, "electron", "jianying-draft.mjs")
  return import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`)
}

const draftPlan = {
  taskId: "task_01",
  output: {
    file: {
      filename: "task_01-20260618-090000",
    },
  },
  aiDirector: {
    trackOrder: ["visual", "voice", "subtitle"],
    clips: [
      {
        id: "shot_01_visual",
        trackId: "visual",
        assetId: "stickman_01",
        startMs: 0,
        durationMs: 15000,
        locked: true,
        placeholder: false,
      },
      {
        id: "shot_02_visual",
        trackId: "visual",
        assetId: "placeholder_opening_hook_shot_02",
        startMs: 15000,
        durationMs: 15000,
        locked: false,
        placeholder: true,
        replacementHint: "请在剪映中替换开头钩子素材",
      },
      {
        id: "subtitle_01",
        trackId: "subtitle",
        assetId: "subtitle_01",
        startMs: 0,
        durationMs: 15000,
        text: "小白也能一键生成短视频",
      },
    ],
  },
  brandOverlays: [
    {
      id: "brand_overlay_doubao_icon",
      labelId: "doubao_icon",
      label: "豆包图标",
      assetId: "doubao_icon_asset",
      status: "ready",
      required: false,
      replacementHint: "使用已导入豆包图标作为手动品牌贴片。",
      tags: ["doubao_icon"],
    },
    {
      id: "brand_overlay_jianying_icon_placeholder",
      labelId: "jianying_icon",
      label: "剪映图标",
      status: "placeholder",
      required: false,
      replacementHint: "可在剪映中手动补充剪映图标贴片，缺失不阻塞草稿。",
      tags: ["jianying_icon"],
    },
  ],
  materialAssets: [
    {
      id: "stickman_01",
      kind: "stickman_image",
      displayName: "01_shot_01_0-2s_stickman.png",
      file: {
        filename: "01_shot_01_0-2s_stickman.png",
        path: "C:\\Users\\Administrator\\AppData\\Roaming\\她火\\tasks\\task_01\\stickman_image\\01_shot_01_0-2s_stickman.png",
        mimeType: "image/png",
        bytes: 1234,
      },
      tags: ["generated_image", "shot_01"],
    },
    {
      id: "doubao_icon_asset",
      kind: "brand_sticker",
      displayName: "doubao-icon.png",
      file: {
        filename: "doubao-icon.png",
        path: "C:\\Users\\Administrator\\AppData\\Roaming\\她火\\tasks\\task_01\\brand_sticker\\doubao-icon.png",
        mimeType: "image/png",
        bytes: 2048,
      },
      tags: ["doubao_icon"],
    },
  ],
}

test("Jianying draft writer creates a task-scoped editable draft package", async () => {
  const { createJianyingDraftPackage } = await importJianyingDraftModule()
  const userDataDir = await mkdtemp(path.join(tmpdir(), "ta-huo-jy-draft-"))

  try {
    const result = await createJianyingDraftPackage({
      userDataDir,
      plan: draftPlan,
    })
    const manifestPath = path.join(result.draftPath, "ta-huo-director-plan.json")
    const contentPath = path.join(result.draftPath, "draft_content.json")
    const materialsPath = path.join(result.draftPath, "task-materials.json")
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
    const content = JSON.parse(await readFile(contentPath, "utf8"))
    const materials = JSON.parse(await readFile(materialsPath, "utf8"))

    assert.equal(result.ok, true)
    assert.match(
      result.draftPath,
      /task_01[\\/]jianying_drafts[\\/]task_01-20260618-090000$/
    )
    assert.equal(manifest.aiDirector.clips.length, 3)
    assert.equal(content.meta.outputKind, "jianying_draft")
    assert.equal(content.tracks.visual.segments.length, 2)
    assert.equal(content.tracks.subtitle.segments[0].text, "小白也能一键生成短视频")
    assert.deepEqual(materials.assetIds, [
      "stickman_01",
      "placeholder_opening_hook_shot_02",
      "subtitle_01",
      "doubao_icon_asset",
    ])
    assert.equal(materials.assets[0].id, "stickman_01")
    assert.equal(materials.assets[0].kind, "stickman_image")
    assert.match(materials.assets[0].path, /stickman_image/)
    assert.deepEqual(
      materials.assets.map((asset) => asset.id),
      ["stickman_01", "doubao_icon_asset"]
    )
    assert.deepEqual(
      materials.brandOverlays.map((overlay) => [
        overlay.labelId,
        overlay.assetId,
        overlay.status,
        overlay.required,
      ]),
      [
        ["doubao_icon", "doubao_icon_asset", "ready", false],
        ["jianying_icon", undefined, "placeholder", false],
      ]
    )
    assert.ok((await stat(manifestPath)).size > 0)
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
  }
})

test("Jianying draft writer never overwrites an existing draft directory", async () => {
  const { createJianyingDraftPackage } = await importJianyingDraftModule()
  const userDataDir = await mkdtemp(path.join(tmpdir(), "ta-huo-jy-draft-"))

  try {
    const first = await createJianyingDraftPackage({
      userDataDir,
      plan: draftPlan,
    })
    const second = await createJianyingDraftPackage({
      userDataDir,
      plan: draftPlan,
    })

    assert.equal(first.ok, true)
    assert.equal(second.ok, true)
    assert.notEqual(first.draftPath, second.draftPath)
    assert.match(second.draftPath, /task_01-20260618-090000-1$/)
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
  }
})
