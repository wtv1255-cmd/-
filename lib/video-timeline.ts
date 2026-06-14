import type {
  TaskFileRef,
  TimelineTrack,
  VideoDurationPreset,
  VideoTimeline,
  VoicePlan,
  VoiceSubtitleCue,
} from "@/lib/video-domain"

export type CreateVoicePlanFromScriptInput = {
  taskId: string
  script: string
  durationPreset: VideoDurationPreset
  audioFilename?: string
}

export type TimelineStoryboardInput = {
  id: string
  assetIds: string[]
  startMs: number
  endMs: number
}

export type CreateUnifiedVideoTimelineInput = {
  taskId: string
  voice: VoicePlan
  storyboard: TimelineStoryboardInput[]
  bgmAssetId?: string
  sfxAssetIds?: string[]
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
  const parts = script
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean)
  return parts.length ? parts : ["等待用户输入口播文本"]
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

export function createVoicePlanFromScript({
  taskId,
  script,
  durationPreset,
  audioFilename = "voice.wav",
}: CreateVoicePlanFromScriptInput): VoicePlan {
  const lines = splitScript(script)
  const totalMs = durationMsByPreset[durationPreset] || 60000
  const stepMs = Math.floor(totalMs / lines.length)
  const subtitles: VoiceSubtitleCue[] = lines.map((text, index) => ({
    id: `subtitle_${String(index + 1).padStart(2, "0")}`,
    startMs: index * stepMs,
    endMs: index === lines.length - 1 ? totalMs : (index + 1) * stepMs,
    text,
  }))

  return {
    text: lines.join("\n"),
    audio: createVoiceFileRef(taskId, audioFilename),
    subtitles,
  }
}

export function createUnifiedVideoTimeline({
  taskId,
  voice,
  storyboard,
  bgmAssetId,
  sfxAssetIds = [],
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
        assetId: shot.assetIds[0] || shot.id,
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
