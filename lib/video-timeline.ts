import type { ExternalMaterialLabelId } from "@/lib/video-assets"
import type {
  TaskFileRef,
  TimelineTrack,
  VideoAsset,
  VideoDurationPreset,
  VideoTimeline,
  VoicePlan,
  VoiceSubtitleCue,
} from "@/lib/video-domain"

export type CreateVoicePlanFromScriptInput = {
  taskId: string
  script: string
  durationPreset: VideoDurationPreset
  generatedAudioDurationMs?: number
  audioFilename?: string
  audioFile?: TaskFileRef
  includePlaceholderAudio?: boolean
  ttsCues?: Array<{
    text: string
    startMs: number
    endMs: number
  }>
  speechRateCharsPerSecond?: number
}

export type TimelineStoryboardInput = {
  id: string
  assetIds: string[]
  startMs: number
  endMs: number
  requiredMaterialLabel?: ExternalMaterialLabelId
  lockedAssetId?: string
  assetSelection?: "auto" | "manual"
  replaceAsset?: boolean
}

export type CreateUnifiedVideoTimelineInput = {
  taskId: string
  voice: VoicePlan
  storyboard: TimelineStoryboardInput[]
  externalAssets?: Pick<VideoAsset, "id" | "tags">[]
  bgmAssetId?: string
  sfxAssetIds?: string[]
  previousTimeline?: VideoTimeline
}

const durationMsByPreset: Record<VideoDurationPreset, number> = {
  "30-45s": 45000,
  "45-60s": 60000,
  "60-90s": 90000,
  "120s": 120000,
}

const VIDEO_TASK_FILE_ROOT = "%APPDATA%/她火/tasks"

function cleanText(value: unknown, fallback = "") {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
  return text || fallback
}

function isVisualDirectionLine(value: string) {
  return /^[【\[]\s*(画面|镜头|场景|视觉|分镜)\s*[:：]/u.test(value.trim())
}

function cleanSegment(value: unknown, fallback: string) {
  const cleaned =
    typeof value === "string"
      ? value
          .trim()
          .replace(/[\\/:*?"<>|]+/g, "-")
          .replace(/\s+/g, "-")
      : ""
  return cleaned || fallback
}

function splitScript(script: string) {
  const lines = script
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter((line) => !isVisualDirectionLine(line))
    .filter(Boolean)
  const parts = lines.flatMap((line) => splitVoiceLine(line))
  return parts.length ? parts : ["等待用户输入口播文本"]
}

function splitVoiceLine(line: string, maxChars = 46) {
  const sentenceChunks = line
    .split(/(?<=[。！？!?；;])\s*/u)
    .map((item) => cleanText(item))
    .filter(Boolean)
  const chunks = sentenceChunks.length ? sentenceChunks : [line]

  return chunks.flatMap((chunk) => {
    if (Array.from(chunk).length <= maxChars) return [chunk]
    const softChunks = chunk
      .split(/(?<=[，,、])\s*/u)
      .map((item) => cleanText(item))
      .filter(Boolean)
    if (softChunks.length <= 1) return [chunk]

    const merged: string[] = []
    let current = ""
    for (const item of softChunks) {
      const next = `${current}${item}`
      if (current && Array.from(next).length > maxChars) {
        merged.push(current)
        current = item
      } else {
        current = next
      }
    }
    if (current) merged.push(current)
    return merged
  })
}

function createVoiceFileRef(taskId: string, filename: string): TaskFileRef {
  const safeTaskId = cleanSegment(taskId, "task")
  const safeFilename = cleanSegment(filename, "voice.wav")
  return {
    id: `voice_audio_${safeFilename}`,
    taskId: safeTaskId,
    kind: "voice_audio",
    filename: safeFilename,
    path: `${VIDEO_TASK_FILE_ROOT}/${safeTaskId}/voice_audio/${safeFilename}`,
    bytes: 0,
    mimeType: safeFilename.endsWith(".mp3") ? "audio/mpeg" : "audio/wav",
    storage: "app_user_data_task_dir",
  }
}

function placeholderAssetId(labelId: ExternalMaterialLabelId, shotId: string) {
  return `placeholder_${labelId}_${cleanSegment(shotId, "shot")}`
}

function cueCharLength(text: string) {
  return Math.max(1, Array.from(cleanText(text)).length)
}

function normalizeCueTiming(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value)
  return Math.max(0, Math.round(Number.isFinite(numberValue) ? numberValue : 0))
}

function createSubtitleCuesFromTts(
  ttsCues: CreateVoicePlanFromScriptInput["ttsCues"]
) {
  const cues = (ttsCues || [])
    .map((cue, index) => {
      const startMs = normalizeCueTiming(cue.startMs)
      const endMs = normalizeCueTiming(cue.endMs)
      const text = cleanText(cue.text)
      if (!text || isVisualDirectionLine(text) || endMs <= startMs) return null

      return {
        id: `subtitle_${String(index + 1).padStart(2, "0")}`,
        startMs,
        endMs,
        text,
      }
    })
    .filter((cue): cue is VoiceSubtitleCue => Boolean(cue))

  return cues.sort((left, right) => left.startMs - right.startMs)
}

function createFallbackSubtitleCues(
  lines: string[],
  durationPreset: VideoDurationPreset,
  speechRateCharsPerSecond?: number,
  generatedAudioDurationMs?: number
) {
  const presetMs = durationMsByPreset[durationPreset] || 60000
  const audioMs = Math.max(0, Math.round(Number(generatedAudioDurationMs) || 0))
  const rate =
    typeof speechRateCharsPerSecond === "number" &&
    Number.isFinite(speechRateCharsPerSecond) &&
    speechRateCharsPerSecond > 0
      ? speechRateCharsPerSecond
      : undefined
  const totalChars = lines.reduce((sum, text) => sum + cueCharLength(text), 0)
  const speechMs = rate ? Math.round((totalChars / rate) * 1000) : presetMs
  const totalMs = audioMs || Math.max(1, Math.min(presetMs, speechMs))
  let cursorMs = 0

  return lines.map((text, index) => {
    const isLast = index === lines.length - 1
    const durationMs = isLast
      ? totalMs - cursorMs
      : Math.max(1, Math.round((cueCharLength(text) / totalChars) * totalMs))
    const startMs = cursorMs
    const endMs = isLast ? totalMs : Math.min(totalMs, cursorMs + durationMs)
    cursorMs = endMs

    return {
      id: `subtitle_${String(index + 1).padStart(2, "0")}`,
      startMs,
      endMs,
      text,
    }
  })
}

function findPreviousVisualAssetId(
  shotId: string,
  previousTimeline?: VideoTimeline
) {
  return previousTimeline?.tracks
    .find((track) => track.id === "visual")
    ?.clips.find((clip) => clip.id === `${shotId}_visual`)?.assetId
}

function resolveVisualAssetId(
  shot: TimelineStoryboardInput,
  externalAssets: Pick<VideoAsset, "id" | "tags">[],
  previousTimeline?: VideoTimeline
) {
  const previousAssetId = findPreviousVisualAssetId(shot.id, previousTimeline)
  if (shot.lockedAssetId) return previousAssetId || shot.lockedAssetId
  if (shot.assetSelection === "manual" && !shot.replaceAsset) {
    return previousAssetId || shot.assetIds[0] || shot.id
  }
  if (shot.assetIds.length) return shot.assetIds[0]
  if (!shot.requiredMaterialLabel) return shot.id

  return (
    externalAssets.find((asset) =>
      (asset.tags || []).includes(shot.requiredMaterialLabel || "")
    )?.id || placeholderAssetId(shot.requiredMaterialLabel, shot.id)
  )
}

export function createVoicePlanFromScript({
  taskId,
  script,
  durationPreset,
  audioFilename = "voice.wav",
  audioFile,
  includePlaceholderAudio = true,
  ttsCues,
  speechRateCharsPerSecond,
  generatedAudioDurationMs,
}: CreateVoicePlanFromScriptInput): VoicePlan {
  const lines = splitScript(script)
  const ttsSubtitles = createSubtitleCuesFromTts(ttsCues)
  const subtitles: VoiceSubtitleCue[] = ttsSubtitles.length
    ? ttsSubtitles
    : createFallbackSubtitleCues(
        lines,
        durationPreset,
        speechRateCharsPerSecond,
        generatedAudioDurationMs
      )
  const audio =
    audioFile ||
    (includePlaceholderAudio ? createVoiceFileRef(taskId, audioFilename) : undefined)

  return {
    text: ttsSubtitles.length
      ? ttsSubtitles.map((cue) => cue.text).join("\n")
      : lines.join("\n"),
    audio,
    subtitles,
  }
}

export function createUnifiedVideoTimeline({
  taskId,
  voice,
  storyboard,
  externalAssets = [],
  bgmAssetId,
  sfxAssetIds = [],
  previousTimeline,
}: CreateUnifiedVideoTimelineInput): VideoTimeline {
  const durationMs = Math.max(
    ...voice.subtitles.map((cue) => cue.endMs),
    ...storyboard.map((shot) => shot.endMs),
    0
  )
  const tracks: TimelineTrack[] = [
    {
      id: "visual",
      type: "visual",
      clips: storyboard.map((shot) => ({
        id: `${shot.id}_visual`,
        assetId: resolveVisualAssetId(shot, externalAssets, previousTimeline),
        startMs: shot.startMs,
        durationMs: Math.max(0, shot.endMs - shot.startMs),
      })),
    },
    {
      id: "voice",
      type: "voice",
      clips: voice.audio
        ? [
            {
              id: "voice_main",
              assetId: voice.audio.id,
              startMs: 0,
              durationMs,
            },
          ]
        : [],
    },
    {
      id: "subtitle",
      type: "subtitle",
      clips: voice.subtitles.map((cue) => ({
        id: cue.id,
        assetId: cue.id,
        startMs: cue.startMs,
        durationMs: Math.max(0, cue.endMs - cue.startMs),
        text: cue.text,
      })),
    },
  ]

  if (bgmAssetId) {
    tracks.push({
      id: "bgm",
      type: "bgm",
      clips: [{ id: "bgm_main", assetId: bgmAssetId, startMs: 0, durationMs }],
    })
  }

  tracks.push({
    id: "sfx",
    type: "sfx",
    clips: sfxAssetIds.map((assetId, index) => ({
      id: `sfx_${String(index + 1).padStart(2, "0")}`,
      assetId,
      startMs: voice.subtitles[index]?.startMs || 0,
      durationMs: 1200,
    })),
  })

  return {
    taskId,
    durationMs,
    tracks,
  }
}
