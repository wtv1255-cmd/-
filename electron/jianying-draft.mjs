import fs from "node:fs/promises"
import path from "node:path"

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

  return {
    taskId: cleanSegment(plan?.taskId, "task"),
    assetIds: Array.from(assetIds),
    generatedAt: new Date().toISOString(),
  }
}

export async function createJianyingDraftPackage({ userDataDir, plan }) {
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
    const taskMaterials = createTaskMaterials(directorPlan)

    await fs.writeFile(manifestPath, JSON.stringify(directorPlan, null, 2), "utf8")
    await fs.writeFile(contentPath, JSON.stringify(draftContent, null, 2), "utf8")
    await fs.writeFile(materialsPath, JSON.stringify(taskMaterials, null, 2), "utf8")

    return {
      ok: true,
      taskId: cleanSegment(taskId, "task"),
      draftPath,
      manifestPath,
      contentPath,
      materialsPath,
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
    })
}
