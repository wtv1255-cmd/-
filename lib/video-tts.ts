export type VideoTtsEngine = "local_indextts2" | "manual_audio"

export type VideoTtsVoicePresetId =
  | "recommended_female"
  | "energetic_female"
  | "calm_male"
  | "storyteller_female"

export type VideoTtsVoicePreset = {
  id: VideoTtsVoicePresetId
  label: string
  description: string
  speaker: string
  speed: number
}

export type VideoTtsSettings = {
  version: 1
  engine: VideoTtsEngine
  projectPath: string
  launchCommand: string
  launchArgs: string[]
  defaultVoicePresetId: VideoTtsVoicePresetId
  taskVoicePresetId?: VideoTtsVoicePresetId
  embedModelInPackage: false
}

export type SafeVideoTtsSettings = Omit<VideoTtsSettings, "embedModelInPackage"> & {
  embedModelInPackage: false
}

export type VideoTtsLaunchPlan = {
  cwd: string
  command: string
  args: string[]
  manualCommand: string
}

export type ResolveVideoTtsVoiceSelectionInput = {
  settings: VideoTtsSettings
  taskVoicePresetId?: VideoTtsVoicePresetId | ""
}

export type VideoTtsPauseInput<T extends { workflow: Array<{ id: string; state: string }> }> = {
  task: T
  reason: string
}

export const VIDEO_TTS_SETTINGS_STORAGE_KEY = "ta-huo:video-tts-settings:v1"
export const DEFAULT_LOCAL_INDEXTTS2_PATH = "D:\\Index-TTS2_ZZDH"

export const COMMON_VIDEO_TTS_VOICE_PRESETS: VideoTtsVoicePreset[] = [
  {
    id: "recommended_female",
    label: "默认推荐女声",
    description: "通用短视频讲解，清晰稳定。",
    speaker: "female_recommended",
    speed: 1,
  },
  {
    id: "energetic_female",
    label: "高能女声",
    description: "适合工具演示和强节奏脚本。",
    speaker: "female_energetic",
    speed: 1.08,
  },
  {
    id: "calm_male",
    label: "沉稳男声",
    description: "适合案例、证明和解释段落。",
    speaker: "male_calm",
    speed: 0.96,
  },
  {
    id: "storyteller_female",
    label: "叙事女声",
    description: "适合剧情、漫剧和情绪铺垫。",
    speaker: "female_storyteller",
    speed: 0.98,
  },
]

const voicePresetIds = new Set(
  COMMON_VIDEO_TTS_VOICE_PRESETS.map((preset) => preset.id)
)

function cleanText(value: unknown, fallback = "") {
  const text = typeof value === "string" ? value.trim() : ""
  return text || fallback
}

function normalizeLocalPath(value: unknown, fallback = DEFAULT_LOCAL_INDEXTTS2_PATH) {
  const raw = cleanText(value, fallback).replace(/\//g, "\\").replace(/\\+$/u, "")
  return raw || fallback
}

function normalizeLaunchArgs(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => cleanText(item))
        .filter(Boolean)
    : []
}

function isVideoTtsEngine(value: unknown): value is VideoTtsEngine {
  return value === "local_indextts2" || value === "manual_audio"
}

function isVideoTtsVoicePresetId(value: unknown): value is VideoTtsVoicePresetId {
  return (
    typeof value === "string" &&
    voicePresetIds.has(value as VideoTtsVoicePresetId)
  )
}

function normalizeVoicePresetId(
  value: unknown,
  fallback: VideoTtsVoicePresetId = "recommended_female"
) {
  return isVideoTtsVoicePresetId(value) ? value : fallback
}

export function normalizeVideoTtsSettings(value: unknown): VideoTtsSettings {
  const raw =
    value && typeof value === "object" ? (value as Partial<VideoTtsSettings>) : {}
  const engine = isVideoTtsEngine(raw.engine) ? raw.engine : "local_indextts2"

  return {
    version: 1,
    engine,
    projectPath: normalizeLocalPath(raw.projectPath),
    launchCommand: cleanText(raw.launchCommand, "启动webui.bat"),
    launchArgs: normalizeLaunchArgs(raw.launchArgs),
    defaultVoicePresetId: normalizeVoicePresetId(raw.defaultVoicePresetId),
    taskVoicePresetId: isVideoTtsVoicePresetId(raw.taskVoicePresetId)
      ? raw.taskVoicePresetId
      : undefined,
    embedModelInPackage: false,
  }
}

export function createDefaultVideoTtsSettings(): VideoTtsSettings {
  return normalizeVideoTtsSettings({})
}

export function createVideoTtsLaunchPlan(
  settings: VideoTtsSettings
): VideoTtsLaunchPlan {
  const normalized = normalizeVideoTtsSettings(settings)
  const args = normalized.launchArgs

  return {
    cwd: normalized.projectPath,
    command: normalized.launchCommand,
    args,
    manualCommand: [
      `cd /d "${normalized.projectPath}"`,
      [normalized.launchCommand, ...args].join(" "),
    ].join(" && "),
  }
}

export function resolveVideoTtsVoiceSelection({
  settings,
  taskVoicePresetId,
}: ResolveVideoTtsVoiceSelectionInput): VideoTtsVoicePreset {
  const normalized = normalizeVideoTtsSettings(settings)
  const selectedId =
    normalizeVoicePresetId(taskVoicePresetId || normalized.taskVoicePresetId, normalized.defaultVoicePresetId)

  return (
    COMMON_VIDEO_TTS_VOICE_PRESETS.find((preset) => preset.id === selectedId) ||
    COMMON_VIDEO_TTS_VOICE_PRESETS[0]
  )
}

export function createVideoTtsUnavailablePause<
  T extends { workflow: Array<{ id: string; state: string }> },
>({ task, reason }: VideoTtsPauseInput<T>) {
  return {
    ...task,
    workflow: task.workflow.map((step) =>
      step.id === "voice" ? { ...step, state: "queued" } : step
    ),
    ttsStatus: `本地 TTS 未就绪：${cleanText(reason, "路径不可用")}`,
  }
}

export function sanitizeVideoTtsSettingsForExport(
  settings: VideoTtsSettings
): SafeVideoTtsSettings {
  const normalized = normalizeVideoTtsSettings(settings)
  return {
    ...normalized,
    embedModelInPackage: false,
  }
}

export function saveVideoTtsSettings(
  settings: VideoTtsSettings,
  storage: Storage = window.localStorage
) {
  storage.setItem(
    VIDEO_TTS_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeVideoTtsSettings(settings))
  )
}

export function readVideoTtsSettings(storage: Storage = window.localStorage) {
  const raw = storage.getItem(VIDEO_TTS_SETTINGS_STORAGE_KEY)
  if (!raw) return createDefaultVideoTtsSettings()
  return normalizeVideoTtsSettings(JSON.parse(raw))
}
