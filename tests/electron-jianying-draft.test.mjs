import assert from "node:assert/strict"
import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
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

test("Jianying draft writer preserves EditDecisionPlan as the engine-independent source", async () => {
  const { createJianyingDraftPackage } = await importJianyingDraftModule()
  const userDataDir = await mkdtemp(path.join(tmpdir(), "ta-huo-jy-edp-"))
  const edpPlan = {
    ...draftPlan,
    editDecisionPlan: {
      version: 1,
      taskId: "task_01",
      style: "stickman_fast_cut",
      targetEngine: "jianying",
      timelineDurationMs: 30000,
      decisions: [
        {
          id: "decision_001",
          shotId: "shot_01",
          timeRange: { startMs: 0, endMs: 15000 },
          pace: "fast",
          visualMotion: [
            { type: "zoom_in", from: 1, to: 1.08, easing: "easeOut" },
          ],
          transitionOut: { type: "flash_cut", durationMs: 120 },
          subtitleEmphasis: [
            { text: "小白", style: "pop", color: "accent", scale: 1.18 },
          ],
          audioCues: [
            { type: "hit", atMs: 600, label: "impact_light" },
            { type: "bgm_duck", atMs: 0, durationMs: 1800, volume: 0.45 },
          ],
          bRoll: { strategy: "reuse_existing", assetId: "stickman_01" },
        },
      ],
      qualityChecks: [
        { type: "pace", state: "pass" },
        { type: "blank_visual", state: "pass" },
        { type: "black_frame", state: "pass" },
        { type: "subtitle_sync", state: "pass" },
      ],
    },
  }

  try {
    const result = await createJianyingDraftPackage({
      userDataDir,
      plan: edpPlan,
    })
    const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"))
    const edpPath = path.join(result.draftPath, "edit-decision-plan.json")
    const edp = JSON.parse(await readFile(edpPath, "utf8"))

    assert.equal(result.ok, true)
    assert.equal(manifest.editDecisionPlan.decisions[0].transitionOut.type, "flash_cut")
    assert.equal(edp.targetEngine, "jianying")
    assert.equal(edp.decisions[0].pace, "fast")
    assert.equal(edp.decisions[0].audioCues[1].type, "bgm_duck")
    assert.equal(edp.qualityChecks.some((check) => check.type === "blank_visual"), true)
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
  }
})

test("native Jianying draft helper is bundled with Electron sources", async () => {
  await access(
    path.join(projectRoot, "electron", "create-native-jianying-draft.py")
  )
})

test("native Jianying draft helper imports visual media instead of subtitles only", async () => {
  const source = await readFile(
    path.join(projectRoot, "electron", "create-native-jianying-draft.py"),
    "utf8"
  )

  assert.match(source, /asset_by_id/)
  assert.match(source, /project\.add_media_safe/)
  assert.match(source, /track_name=["']Visual["']/)
  assert.match(source, /is_visual_clip/)
  assert.match(source, /trackId/)
  assert.doesNotMatch(
    source,
    /if clip\.get\("type"\) != "subtitle" or not clip\.get\("text"\):/
  )
})

test("native Jianying draft helper resolves stale visual asset ids by shot tag", async () => {
  const { createJianyingDraftPackage } = await importJianyingDraftModule()
  const userDataDir = await mkdtemp(path.join(tmpdir(), "ta-huo-jy-draft-"))
  const jianyingDraftsRoot = await mkdtemp(path.join(tmpdir(), "JianyingPro Drafts-"))
  const jianyingMaterialsRoot = await mkdtemp(path.join(tmpdir(), "JianyingPro Materials-"))
  const materialRoot = await mkdtemp(path.join(tmpdir(), "ta-huo-jy-material-"))
  const imagePath = path.join(materialRoot, "01_shot_01_0-3s_stickman.png")
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l0u3qAAAAABJRU5ErkJggg==",
    "base64"
  )
  await writeFile(imagePath, pngBytes)
  const stalePlan = {
    ...draftPlan,
    aiDirector: {
      trackOrder: ["visual", "subtitle"],
      clips: [
        {
          id: "shot_01_visual",
          trackId: "visual",
          type: "visual",
          assetId: "stickman_image_01_shot_01_0-3s_stickman.png_1781836337937",
          startMs: 0,
          durationMs: 3000,
          locked: false,
          aiEditable: true,
          placeholder: false,
        },
        {
          id: "subtitle_01",
          trackId: "subtitle",
          type: "subtitle",
          assetId: "subtitle_01",
          startMs: 0,
          durationMs: 3000,
          text: "小白也能一键生成短视频",
          emphasisSubtitle: true,
        },
      ],
    },
    materialAssets: [
      {
        ...draftPlan.materialAssets[0],
        id: "stickman_image_01_shot_01_0-3s_stickman.png_1781839938812",
        displayName: "01_shot_01_0-3s_stickman.png",
        file: {
          ...draftPlan.materialAssets[0].file,
          filename: "01_shot_01_0-3s_stickman.png",
          path: imagePath,
          bytes: pngBytes.byteLength,
        },
        tags: ["shot_01", "generated_image"],
      },
    ],
  }

  try {
    const result = await createJianyingDraftPackage({
      userDataDir,
      plan: stalePlan,
      jianyingDraftsRoot,
      jianyingMaterialsRoot,
    })

    assert.equal(result.ok, true)
    assert.equal(
      result.nativeDraftCreated,
      true,
      result.nativeDraftError || "native draft should resolve stale visual ids"
    )
    assert.equal(result.nativeDraftSummary.videoSegmentCount, 1)
    assert.equal(result.nativeDraftSummary.textSegmentCount, 1)
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
    await rm(jianyingDraftsRoot, { force: true, recursive: true })
    await rm(jianyingMaterialsRoot, { force: true, recursive: true })
    await rm(materialRoot, { force: true, recursive: true })
  }
})

test("native Jianying draft helper skips visual direction text as subtitles", async () => {
  const source = await readFile(
    path.join(projectRoot, "electron", "create-native-jianying-draft.py"),
    "utf8"
  )

  assert.match(source, /is_visible_subtitle_text/)
  assert.match(source, /画面/)
  assert.match(source, /emphasisSubtitle/)
})

test("native Jianying draft helper creates projects using the plan canvas size", async () => {
  const source = await readFile(
    path.join(projectRoot, "electron", "create-native-jianying-draft.py"),
    "utf8"
  )

  assert.match(source, /canvas/)
  assert.match(source, /resolve_canvas/)
  assert.match(source, /width=canvas\["width"\]/)
  assert.match(source, /height=canvas\["height"\]/)
})

test("Electron native draft creation validates video tracks and visual-direction subtitles", async () => {
  const source = await readFile(
    path.join(projectRoot, "electron", "jianying-draft.mjs"),
    "utf8"
  )

  assert.match(source, /validateNativeDraft/)
  assert.match(source, /videoSegmentCount/)
  assert.match(source, /hasVisualDirectionSubtitle/)
  assert.match(source, /readTextMaterialText/)
  assert.match(source, /剪映原生草稿缺少视频\/图片轨/)
  assert.match(source, /字幕包含【画面】提示/)
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

test("Jianying draft writer can mirror a native Jianying draft into configured D drive roots", async () => {
  const { createJianyingDraftPackage } = await importJianyingDraftModule()
  const userDataDir = await mkdtemp(path.join(tmpdir(), "ta-huo-jy-draft-"))
  const jianyingDraftsRoot = await mkdtemp(path.join(tmpdir(), "JianyingPro Drafts-"))
  const jianyingMaterialsRoot = await mkdtemp(path.join(tmpdir(), "JianyingPro Materials-"))
  const materialRoot = await mkdtemp(path.join(tmpdir(), "ta-huo-jy-material-"))
  const imagePath = path.join(materialRoot, "stickman_01.png")
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l0u3qAAAAABJRU5ErkJggg==",
    "base64"
  )
  await writeFile(imagePath, pngBytes)
  const nativePlan = {
    ...draftPlan,
    materialAssets: draftPlan.materialAssets.map((asset) =>
      asset.id === "stickman_01"
        ? {
            ...asset,
            file: {
              ...asset.file,
              path: imagePath,
              bytes: pngBytes.byteLength,
            },
          }
        : asset
    ),
  }

  try {
    const result = await createJianyingDraftPackage({
      userDataDir,
      plan: nativePlan,
      jianyingDraftsRoot,
      jianyingMaterialsRoot,
    })

    const nativeContentPath = path.join(
      result.nativeDraftPath,
      "draft_content.json"
    )
    const nativeMetaPath = path.join(
      result.nativeDraftPath,
      "draft_meta_info.json"
    )
    const sourcePackagePath = path.join(
      result.nativeDraftPath,
      "ta-huo-source-package",
      "task-materials.json"
    )
    const settingsPath = path.join(userDataDir, "jianying-draft-settings.json")
    const settings = JSON.parse(await readFile(settingsPath, "utf8"))
    assert.equal(result.ok, true)
    assert.equal(
      result.nativeDraftCreated,
      true,
      result.nativeDraftError || "native draft should be created"
    )
    assert.equal(path.dirname(result.nativeDraftPath), jianyingDraftsRoot)
    assert.equal(path.basename(result.nativeDraftPath), "task_01-20260618-090000")
    assert.equal(result.nativeMaterialsPath, jianyingMaterialsRoot)
    assert.deepEqual(settings, {
      draftsRoot: jianyingDraftsRoot,
      materialsRoot: jianyingMaterialsRoot,
    })
    assert.ok((await stat(nativeContentPath)).size > 0)
    assert.ok((await stat(nativeMetaPath)).size > 0)
    assert.ok((await stat(sourcePackagePath)).size > 0)
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
    await rm(jianyingDraftsRoot, { force: true, recursive: true })
    await rm(jianyingMaterialsRoot, { force: true, recursive: true })
    await rm(materialRoot, { force: true, recursive: true })
  }
})
