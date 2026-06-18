export type VideoTtsEngine = "local_indextts2" | "manual_audio"

export type VideoTtsSettings = {
  version: 1
  engine: VideoTtsEngine
  projectPath: string
  launchCommand: string
  launchArgs: string[]
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

export const VIDEO_TTS_SETTINGS_STORAGE_KEY = "ta-huo:video-tts-settings:v1"
export const DEFAULT_LOCAL_INDEXTTS2_PATH = "D:\\Index-TTS2_ZZDH"

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
