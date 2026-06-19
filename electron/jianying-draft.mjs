import fs from "node:fs/promises"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const DEFAULT_JIANYING_DRAFTS_ROOT = "D:\\剪映草稿\\JianyingPro Drafts"
const DEFAULT_JIANYING_MATERIALS_ROOT = "D:\\剪映草稿\\JianyingPro Materials"
const nativeDraftScriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "create-native-jianying-draft.py"
)

function cleanSegment(value, fallback) {
  const cleaned =
    typeof value === "string"
      ? value
          .trim()
          .replace(/[\\/:*?"<>|]+/g, "-")
          .replace(/\s+/g, "-")
          .replace(/^[.-]+/u, "")
      : ""
  return cleaned || fallback
}

function resolveDraftBaseDir({ userDataDir, taskId }) {
  const safeTaskId = cleanSegment(taskId, "task")
  return path.resolve(userDataDir, "tasks", safeTaskId, "jianying_drafts")
}

async function uniqueDraftPath(baseDir, draftName) {
  const safeDraftName = cleanSegment(draftName, "jianying-draft")
  let draftPath = path.resolve(baseDir, safeDraftName)
  let index = 1

  while (true) {
    try {
      await fs.access(draftPath)
      draftPath = path.resolve(baseDir, `${safeDraftName}-${index}`)
      index += 1
    } catch {
      return draftPath
    }
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

function resolveNativeDraftConfig({
  userDataDir,
  jianyingDraftsRoot,
  jianyingMaterialsRoot,
}) {
  const draftsRoot =
    typeof jianyingDraftsRoot === "string" && jianyingDraftsRoot.trim()
      ? jianyingDraftsRoot.trim()
      : DEFAULT_JIANYING_DRAFTS_ROOT
  const materialsRoot =
    typeof jianyingMaterialsRoot === "string" && jianyingMaterialsRoot.trim()
      ? jianyingMaterialsRoot.trim()
      : DEFAULT_JIANYING_MATERIALS_ROOT

  return {
    draftsRoot: path.resolve(draftsRoot),
    materialsRoot: path.resolve(materialsRoot),
    settingsPath: path.join(userDataDir, "jianying-draft-settings.json"),
  }
}

async function writeNativeDraftSettings({ settingsPath, draftsRoot, materialsRoot }) {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true })
  await fs.writeFile(
    settingsPath,
    JSON.stringify({ draftsRoot, materialsRoot }, null, 2),
    "utf8"
  )
}

function parseNativeDraftOutput(stdout) {
  const lines = String(stdout || "")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
  for (const line of lines.reverse()) {
    try {
      const parsed = JSON.parse(line)
      if (parsed && typeof parsed === "object") return parsed
    } catch {}
  }
  return null
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"))
}

function isVisualDirectionText(value) {
  return /^[【\[]\s*(画面|镜头|场景|视觉|分镜)\s*[:：]/u.test(
    String(value || "").trim()
  )
}

function readTextMaterialText(material) {
  const content = material?.content
  if (typeof content !== "string") return ""

  try {
    const parsed = JSON.parse(content)
    if (typeof parsed?.text === "string") return parsed.text
  } catch {}

  return content
}

function inspectNativeDraftContent(content) {
  const tracks = Array.isArray(content?.tracks) ? content.tracks : []
  const videoTrackCount = tracks.filter((track) => track?.type === "video").length
  const videoSegmentCount = tracks
    .filter((track) => track?.type === "video")
    .reduce(
      (sum, track) => sum + (Array.isArray(track?.segments) ? track.segments.length : 0),
      0
    )
  const textSegments = tracks
    .filter((track) => track?.type === "text")
    .flatMap((track) => (Array.isArray(track?.segments) ? track.segments : []))
  const textMaterialById = new Map(
    (Array.isArray(content?.materials?.texts) ? content.materials.texts : [])
      .filter((item) => item?.id)
      .map((item) => [item.id, item])
  )
  const hasVisualDirectionSubtitle = textSegments.some((segment) => {
    const material = textMaterialById.get(segment?.material_id)
    return isVisualDirectionText(readTextMaterialText(material) || segment?.text)
  })

  return {
    videoTrackCount,
    videoSegmentCount,
    textSegmentCount: textSegments.length,
    hasVisualDirectionSubtitle,
  }
}

async function validateNativeDraft({ nativeDraftPath }) {
  const contentPath = path.join(nativeDraftPath, "draft_content.json")
  const content = await readJsonFile(contentPath)
  const summary = inspectNativeDraftContent(content)

  if (!summary.videoSegmentCount) {
    throw new Error("剪映原生草稿缺少视频/图片轨，请重新生成草稿。")
  }
  if (summary.hasVisualDirectionSubtitle) {
    throw new Error("剪映原生草稿字幕包含【画面】提示，请重新生成草稿。")
  }

  return summary
}

async function createNativeJianyingDraft({
  userDataDir,
  plan,
  draftName,
  sourcePackage,
  jianyingDraftsRoot,
  jianyingMaterialsRoot,
}) {
  const { draftsRoot, materialsRoot, settingsPath } = resolveNativeDraftConfig({
    userDataDir,
    jianyingDraftsRoot,
    jianyingMaterialsRoot,
  })
  await writeNativeDraftSettings({ settingsPath, draftsRoot, materialsRoot })

  if (!(await pathExists(nativeDraftScriptPath))) {
    return {
      nativeDraftCreated: false,
      nativeDraftError: "缺少剪映原生草稿创建脚本",
      nativeDraftsRoot: draftsRoot,
      nativeMaterialsPath: materialsRoot,
    }
  }

  const payloadPath = path.join(sourcePackage, "native-draft-payload.json")
  await fs.writeFile(
    payloadPath,
    JSON.stringify(
      {
        draftsRoot,
        materialsRoot,
        draftName,
        sourcePackage,
        plan,
      },
      null,
      2
    ),
    "utf8"
  )

  const result = spawnSync("python", [nativeDraftScriptPath, payloadPath], {
    encoding: "utf8",
    windowsHide: true,
  })
  if (result.status !== 0) {
    return {
      nativeDraftCreated: false,
      nativeDraftError:
        result.stderr?.trim() ||
        result.stdout?.trim() ||
        "Python 创建剪映原生草稿失败",
      nativeDraftsRoot: draftsRoot,
      nativeMaterialsPath: materialsRoot,
    }
  }

  const output = parseNativeDraftOutput(result.stdout)
  if (!output?.nativeDraftPath) {
    return {
      nativeDraftCreated: false,
      nativeDraftError: "Python 未返回剪映原生草稿路径",
      nativeDraftsRoot: draftsRoot,
      nativeMaterialsPath: materialsRoot,
    }
  }
  let nativeDraftSummary
  try {
    nativeDraftSummary = await validateNativeDraft({
      nativeDraftPath: output.nativeDraftPath,
    })
  } catch (error) {
    return {
      nativeDraftCreated: false,
      nativeDraftError:
        error instanceof Error ? error.message : "剪映原生草稿验收失败",
      nativeDraftPath: output.nativeDraftPath,
      nativeDraftsRoot: draftsRoot,
      nativeMaterialsPath: output.nativeMaterialsPath || materialsRoot,
    }
  }

  return {
    nativeDraftCreated: true,
    nativeDraftPath: output.nativeDraftPath,
    nativeDraftsRoot: draftsRoot,
    nativeMaterialsPath: output.nativeMaterialsPath || materialsRoot,
    nativeDraftSummary,
  }
}

function assertInside(parentDir, childPath) {
  const relative = path.relative(parentDir, childPath)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("剪映草稿路径超出任务目录")
  }
}

function normalizeDirectorClip(clip) {
  return {
    id: cleanSegment(clip?.id, "clip"),
    trackId: cleanSegment(clip?.trackId, "track"),
    type: typeof clip?.type === "string" ? clip.type : "visual",
    assetId: cleanSegment(clip?.assetId, "asset"),
    startMs: Math.max(0, Math.floor(Number(clip?.startMs) || 0)),
    durationMs: Math.max(0, Math.floor(Number(clip?.durationMs) || 0)),
    locked: Boolean(clip?.locked),
    aiEditable: clip?.aiEditable !== false,
    placeholder: Boolean(clip?.placeholder),
    replacementHint:
      typeof clip?.replacementHint === "string"
        ? clip.replacementHint
        : undefined,
    transition: typeof clip?.transition === "string" ? clip.transition : "none",
    zoom: typeof clip?.zoom === "string" ? clip.zoom : "none",
    emphasisSubtitle: Boolean(clip?.emphasisSubtitle),
    text: typeof clip?.text === "string" ? clip.text : undefined,
  }
}

function createDraftContent({ plan, draftName }) {
  const clips = Array.isArray(plan?.aiDirector?.clips)
    ? plan.aiDirector.clips.map(normalizeDirectorClip)
    : []
  const trackOrder = Array.isArray(plan?.aiDirector?.trackOrder)
    ? plan.aiDirector.trackOrder.map((track) => cleanSegment(track, "track"))
    : []
  const tracks = Object.fromEntries(
    trackOrder.map((trackId) => [
      trackId,
      {
        id: trackId,
        segments: clips.filter((clip) => clip.trackId === trackId),
      },
    ])
  )

  for (const clip of clips) {
    if (!tracks[clip.trackId]) {
      tracks[clip.trackId] = { id: clip.trackId, segments: [] }
    }
    if (!tracks[clip.trackId].segments.includes(clip)) {
      tracks[clip.trackId].segments.push(clip)
    }
  }

  return {
    meta: {
      name: draftName,
      outputKind: "jianying_draft",
      createdBy: "ta-huo",
      editable: true,
      mp4Exported: false,
    },
    tracks,
  }
}

function createTaskMaterials(plan) {
  const assetIds = new Set()
  if (Array.isArray(plan?.aiDirector?.clips)) {
    for (const clip of plan.aiDirector.clips) {
      if (typeof clip?.assetId === "string" && clip.assetId.trim()) {
        assetIds.add(clip.assetId)
      }
    }
  }
  if (Array.isArray(plan?.brandOverlays)) {
    for (const overlay of plan.brandOverlays) {
      if (typeof overlay?.assetId === "string" && overlay.assetId.trim()) {
        assetIds.add(overlay.assetId)
      }
    }
  }
  const materialAssets = Array.isArray(plan?.materialAssets)
    ? plan.materialAssets
        .filter((asset) => assetIds.has(asset?.id))
        .map((asset) => ({
          id: cleanSegment(asset?.id, "asset"),
          kind: cleanSegment(asset?.kind, "asset"),
          displayName:
            typeof asset?.displayName === "string" ? asset.displayName : "",
          path: typeof asset?.file?.path === "string" ? asset.file.path : "",
          filename:
            typeof asset?.file?.filename === "string"
              ? asset.file.filename
              : "",
          mimeType:
            typeof asset?.file?.mimeType === "string"
              ? asset.file.mimeType
              : "",
          bytes: Math.max(0, Math.floor(Number(asset?.file?.bytes) || 0)),
          tags: Array.isArray(asset?.tags)
            ? asset.tags.filter((tag) => typeof tag === "string")
            : [],
        }))
    : []
  const brandOverlays = Array.isArray(plan?.brandOverlays)
    ? plan.brandOverlays.map((overlay) => ({
        id: cleanSegment(overlay?.id, "brand_overlay"),
        labelId: cleanSegment(overlay?.labelId, "brand_icon"),
        label: typeof overlay?.label === "string" ? overlay.label : "",
        assetId:
          typeof overlay?.assetId === "string" && overlay.assetId.trim()
            ? overlay.assetId
            : undefined,
        status:
          overlay?.status === "ready" || overlay?.status === "placeholder"
            ? overlay.status
            : "placeholder",
        required: false,
        replacementHint:
          typeof overlay?.replacementHint === "string"
            ? overlay.replacementHint
            : "",
        tags: Array.isArray(overlay?.tags)
          ? overlay.tags.filter((tag) => typeof tag === "string")
          : [],
      }))
    : []

  return {
    taskId: cleanSegment(plan?.taskId, "task"),
    assetIds: Array.from(assetIds),
    assets: materialAssets,
    brandOverlays,
    generatedAt: new Date().toISOString(),
  }
}

export async function createJianyingDraftPackage({
  userDataDir,
  plan,
  jianyingDraftsRoot,
  jianyingMaterialsRoot,
}) {
  try {
    const taskId = plan?.taskId || plan?.output?.file?.taskId || "task"
    const baseDir = resolveDraftBaseDir({ userDataDir, taskId })
    const draftName = cleanSegment(plan?.output?.file?.filename, "jianying-draft")
    const draftPath = await uniqueDraftPath(baseDir, draftName)
    assertInside(baseDir, draftPath)
    await fs.mkdir(draftPath, { recursive: true })

    const directorPlan = {
      ...plan,
      output: {
        ...plan?.output,
        file: {
          ...plan?.output?.file,
          path: draftPath,
        },
      },
    }
    const draftContent = createDraftContent({ plan: directorPlan, draftName })
    const manifestPath = path.join(draftPath, "ta-huo-director-plan.json")
    const contentPath = path.join(draftPath, "draft_content.json")
    const materialsPath = path.join(draftPath, "task-materials.json")
    const editDecisionPlanPath = path.join(draftPath, "edit-decision-plan.json")
    const taskMaterials = createTaskMaterials(directorPlan)

    await fs.writeFile(manifestPath, JSON.stringify(directorPlan, null, 2), "utf8")
    await fs.writeFile(contentPath, JSON.stringify(draftContent, null, 2), "utf8")
    await fs.writeFile(materialsPath, JSON.stringify(taskMaterials, null, 2), "utf8")
    if (directorPlan?.editDecisionPlan) {
      await fs.writeFile(
        editDecisionPlanPath,
        JSON.stringify(directorPlan.editDecisionPlan, null, 2),
        "utf8"
      )
    }
    const nativeDraft = await createNativeJianyingDraft({
      userDataDir,
      plan: directorPlan,
      draftName,
      sourcePackage: draftPath,
      jianyingDraftsRoot,
      jianyingMaterialsRoot,
    })

    return {
      ok: true,
      taskId: cleanSegment(taskId, "task"),
      draftPath,
      manifestPath,
      contentPath,
      materialsPath,
      editDecisionPlanPath: directorPlan?.editDecisionPlan
        ? editDecisionPlanPath
        : undefined,
      ...nativeDraft,
      bytes: Buffer.byteLength(JSON.stringify(directorPlan)),
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "创建剪映草稿失败",
    }
  }
}

export function createJianyingDraftIpcHandler(userDataDir) {
  return async (_event, input) =>
    createJianyingDraftPackage({
      userDataDir,
      plan: input?.plan,
      jianyingDraftsRoot: input?.jianyingDraftsRoot,
      jianyingMaterialsRoot: input?.jianyingMaterialsRoot,
    })
}
