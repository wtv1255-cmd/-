export type ApiProfileService =
  | "text_model"
  | "image_generation"
  | "video_parsing"
  | "publish_helper"

export type ApiProfile = {
  id: string
  service: ApiProfileService
  label: string
  apiBaseUrl: string
  apiKey: string
}

export type ApiProfileStore = {
  version: 1
  profiles: Record<ApiProfileService, ApiProfile[]>
  activeProfileByService: Record<ApiProfileService, string>
}

export type SafeApiProfile = Omit<ApiProfile, "apiKey"> & {
  configured: boolean
}

export type SafeApiProfileStore = Omit<ApiProfileStore, "profiles"> & {
  profiles: Record<ApiProfileService, SafeApiProfile[]>
}

export type ApiProfileRequestContext = {
  service: ApiProfileService
  profileId: string
  apiBaseUrl: string
  apiKey: string
}

export type ApiProfileLogEntry = {
  service: ApiProfileService
  profileId: string
  label: string
  apiBaseUrl: string
  configured: boolean
  apiKey?: never
}

export const API_PROFILES_STORAGE_KEY = "ta-huo:api-profiles:v1"

export const API_PROFILE_SERVICES = [
  "text_model",
  "image_generation",
  "video_parsing",
  "publish_helper",
] as const satisfies ReadonlyArray<ApiProfileService>

const DEFAULT_API_BASE_BY_SERVICE: Record<ApiProfileService, string> = {
  text_model: "https://ai.hybgzs.com/v1",
  image_generation: "https://www.521xxz.com",
  video_parsing: "https://api.example.com/video/v1",
  publish_helper: "https://api.example.com/publish/v1",
}

const SERVICE_LABEL_BY_SERVICE: Record<ApiProfileService, string> = {
  text_model: "语言模型",
  image_generation: "图片生成",
  video_parsing: "视频解析",
  publish_helper: "发布辅助",
}

function emptyProfiles(): Record<ApiProfileService, ApiProfile[]> {
  return {
    text_model: [],
    image_generation: [],
    video_parsing: [],
    publish_helper: [],
  }
}

function emptyActiveProfiles(): Record<ApiProfileService, string> {
  return {
    text_model: "",
    image_generation: "",
    video_parsing: "",
    publish_helper: "",
  }
}

function cleanApiBaseUrl(value: unknown, fallback = "") {
  const raw = typeof value === "string" ? value.trim().replace(/\/+$/, "") : ""
  return raw || fallback
}

function cleanApiKey(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function cleanId(value: unknown, fallback: string) {
  const raw =
    typeof value === "string"
      ? value
          .trim()
          .replace(/[^\w.-]+/g, "-")
          .replace(/^-+|-+$/g, "")
      : ""
  return raw || fallback
}

function isApiProfileService(value: unknown): value is ApiProfileService {
  return API_PROFILE_SERVICES.includes(value as ApiProfileService)
}

function normalizeProfile(
  value: unknown,
  fallbackService: ApiProfileService
): ApiProfile {
  const raw = value && typeof value === "object" ? (value as Partial<ApiProfile>) : {}
  const service = isApiProfileService(raw.service) ? raw.service : fallbackService
  const id = cleanId(raw.id, `${service}-default`)
  return {
    id,
    service,
    label:
      typeof raw.label === "string" && raw.label.trim()
        ? raw.label.trim()
        : SERVICE_LABEL_BY_SERVICE[service],
    apiBaseUrl: cleanApiBaseUrl(raw.apiBaseUrl, DEFAULT_API_BASE_BY_SERVICE[service]),
    apiKey: cleanApiKey(raw.apiKey),
  }
}

export function createDefaultApiProfileStore(): ApiProfileStore {
  const profiles = emptyProfiles()
  const activeProfileByService = emptyActiveProfiles()

  for (const service of API_PROFILE_SERVICES) {
    const profile = normalizeProfile(
      {
        id: `${service}-default`,
        service,
        label: `${SERVICE_LABEL_BY_SERVICE[service]}默认配置`,
        apiBaseUrl: DEFAULT_API_BASE_BY_SERVICE[service],
        apiKey: "",
      },
      service
    )
    profiles[service] = [profile]
    activeProfileByService[service] = profile.id
  }

  return {
    version: 1,
    profiles,
    activeProfileByService,
  }
}

export function normalizeApiProfileStore(value: unknown): ApiProfileStore {
  const defaults = createDefaultApiProfileStore()
  if (!value || typeof value !== "object") return defaults

  const raw = value as Partial<ApiProfileStore>
  const profiles = emptyProfiles()
  const activeProfileByService = emptyActiveProfiles()

  for (const service of API_PROFILE_SERVICES) {
    const rawProfiles = Array.isArray(raw.profiles?.[service])
      ? raw.profiles[service]
      : []
    const normalized = rawProfiles.map((item) => normalizeProfile(item, service))
    profiles[service] = normalized.length ? normalized : defaults.profiles[service]
    const requestedActive =
      typeof raw.activeProfileByService?.[service] === "string"
        ? raw.activeProfileByService[service]
        : ""
    activeProfileByService[service] = profiles[service].some(
      (profile) => profile.id === requestedActive
    )
      ? requestedActive
      : profiles[service][0].id
  }

  return {
    version: 1,
    profiles,
    activeProfileByService,
  }
}

export function upsertApiProfile(
  store: ApiProfileStore,
  profile: ApiProfile
): ApiProfileStore {
  const normalizedStore = normalizeApiProfileStore(store)
  const normalizedProfile = normalizeProfile(profile, profile.service)
  const serviceProfiles = normalizedStore.profiles[normalizedProfile.service]
  const nextProfiles = serviceProfiles.some(
    (item) => item.id === normalizedProfile.id
  )
    ? serviceProfiles.map((item) =>
        item.id === normalizedProfile.id ? normalizedProfile : item
      )
    : [normalizedProfile, ...serviceProfiles]

  return {
    ...normalizedStore,
    profiles: {
      ...normalizedStore.profiles,
      [normalizedProfile.service]: nextProfiles,
    },
    activeProfileByService: {
      ...normalizedStore.activeProfileByService,
      [normalizedProfile.service]: normalizedProfile.id,
    },
  }
}

export function setActiveApiProfile(
  store: ApiProfileStore,
  service: ApiProfileService,
  profileId: string
): ApiProfileStore {
  const normalizedStore = normalizeApiProfileStore(store)
  const activeId = normalizedStore.profiles[service].some(
    (profile) => profile.id === profileId
  )
    ? profileId
    : normalizedStore.profiles[service][0].id
  return {
    ...normalizedStore,
    activeProfileByService: {
      ...normalizedStore.activeProfileByService,
      [service]: activeId,
    },
  }
}

export function resolveApiProfile(
  store: ApiProfileStore,
  service: ApiProfileService
) {
  const normalizedStore = normalizeApiProfileStore(store)
  const activeId = normalizedStore.activeProfileByService[service]
  return (
    normalizedStore.profiles[service].find((profile) => profile.id === activeId) ||
    normalizedStore.profiles[service][0]
  )
}

export function buildApiProfileRequestContext(
  store: ApiProfileStore,
  service: ApiProfileService
): ApiProfileRequestContext {
  const profile = resolveApiProfile(store, service)
  return {
    service,
    profileId: profile.id,
    apiBaseUrl: profile.apiBaseUrl,
    apiKey: profile.apiKey,
  }
}

export function sanitizeApiProfileStoreForExport(
  store: ApiProfileStore
): SafeApiProfileStore {
  const normalizedStore = normalizeApiProfileStore(store)
  return {
    version: 1,
    activeProfileByService: normalizedStore.activeProfileByService,
    profiles: Object.fromEntries(
      API_PROFILE_SERVICES.map((service) => [
        service,
        normalizedStore.profiles[service].map(({ apiKey, ...profile }) => ({
          ...profile,
          configured: Boolean(apiKey.trim()),
        })),
      ])
    ) as Record<ApiProfileService, SafeApiProfile[]>,
  }
}

export function createApiProfileLogEntry(
  store: ApiProfileStore,
  service: ApiProfileService
): ApiProfileLogEntry {
  const profile = resolveApiProfile(store, service)
  return {
    service,
    profileId: profile.id,
    label: profile.label,
    apiBaseUrl: profile.apiBaseUrl,
    configured: Boolean(profile.apiKey.trim()),
  }
}

export function saveApiProfileStore(
  store: ApiProfileStore,
  storage: Storage = window.localStorage
) {
  storage.setItem(API_PROFILES_STORAGE_KEY, JSON.stringify(normalizeApiProfileStore(store)))
}

export function readApiProfileStore(storage: Storage = window.localStorage) {
  const raw = storage.getItem(API_PROFILES_STORAGE_KEY)
  if (!raw) return createDefaultApiProfileStore()
  return normalizeApiProfileStore(JSON.parse(raw))
}
