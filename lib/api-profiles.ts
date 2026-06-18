export type ApiProfileService =
  | "text_model"
  | "image_generation"
  | "video_parsing"
  | "publish_helper"

export type ApiProfile = {
  id: string
  service: ApiProfileService
  label: string
  model: string
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
  model: string
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

export type ApiFailoverPolicy = {
  service: ApiProfileService
  primaryProfileId?: string
  backupProfileIds?: string[]
}

export type ApiFailoverAttempt = ApiProfileRequestContext & {
  label: string
}

export type ApiFailoverPlan = {
  service: ApiProfileService
  attempts: ApiFailoverAttempt[]
}

export type ApiFailoverLogEntry = {
  service: ApiProfileService
  attempts: Array<{
    profileId: string
    label: string
    apiBaseUrl: string
    model: string
    configured: boolean
    apiKey?: never
  }>
}

export type ApiProfileFailureKind = "retryable" | "terminal"

export type ApiProfileFailureInput = {
  status?: number
  message?: string
}

export type ApiFailoverRunState = {
  attempts: Array<{ profileId: string }>
  activeProfileId: string
  failedAttempts: Array<{
    profileId: string
    status: number | null
    message: string
    kind: ApiProfileFailureKind
  }>
  paused: boolean
  pauseReason: string
}

export type RecordApiProfileFailureInput = {
  profileId: string
  error: ApiProfileFailureInput
}

export type ApiProfileFailoverSuccess<T> = {
  ok: true
  value: T
  state: ApiFailoverRunState
}

export type ApiProfileFailoverPaused = {
  ok: false
  state: ApiFailoverRunState
  error: string
}

export type ApiProfileFailoverResult<T> =
  | ApiProfileFailoverSuccess<T>
  | ApiProfileFailoverPaused

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

const DEFAULT_MODEL_BY_SERVICE: Record<ApiProfileService, string> = {
  text_model: "claude-opus-4-6-thinking",
  image_generation: "gpt-image-2-2K",
  video_parsing: "video_parsing-default",
  publish_helper: "publish_helper-default",
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

function cleanModel(value: unknown, fallback: string) {
  const raw = typeof value === "string" ? value.trim() : ""
  return raw || fallback
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

function cleanFailureMessage(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : "API Profile 请求失败"
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
    model: cleanModel(raw.model, DEFAULT_MODEL_BY_SERVICE[service]),
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
        model: DEFAULT_MODEL_BY_SERVICE[service],
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
    model: profile.model,
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

export function createApiFailoverPlan(
  store: ApiProfileStore,
  policy: ApiFailoverPolicy
): ApiFailoverPlan {
  const normalizedStore = normalizeApiProfileStore(store)
  const profiles = normalizedStore.profiles[policy.service]
  const orderedProfileIds = [
    policy.primaryProfileId || normalizedStore.activeProfileByService[policy.service],
    ...(policy.backupProfileIds || []),
  ].filter(Boolean)
  const seen = new Set<string>()
  const orderedProfiles = orderedProfileIds
    .map((profileId) => profiles.find((profile) => profile.id === profileId))
    .filter((profile): profile is ApiProfile => Boolean(profile))
    .filter((profile) => {
      if (seen.has(profile.id)) return false
      seen.add(profile.id)
      return true
    })

  const fallbackProfile =
    orderedProfiles.length > 0 ? orderedProfiles : [resolveApiProfile(normalizedStore, policy.service)]

  return {
    service: policy.service,
    attempts: fallbackProfile.map((profile) => ({
      service: policy.service,
      profileId: profile.id,
      label: profile.label,
      model: profile.model,
      apiBaseUrl: profile.apiBaseUrl,
      apiKey: profile.apiKey,
    })),
  }
}

export function createApiFailoverLogEntry(
  plan: ApiFailoverPlan
): ApiFailoverLogEntry {
  return {
    service: plan.service,
    attempts: plan.attempts.map((attempt) => ({
      profileId: attempt.profileId,
      label: attempt.label,
      apiBaseUrl: attempt.apiBaseUrl,
      model: attempt.model,
      configured: Boolean(attempt.apiKey.trim()),
    })),
  }
}

export function classifyApiProfileFailure(
  error: ApiProfileFailureInput
): ApiProfileFailureKind {
  const status = Number(error.status)
  if (!Number.isFinite(status) || status === 408 || status === 409 || status === 425) {
    return "retryable"
  }
  if (status === 429 || status >= 500) return "retryable"
  return "terminal"
}

export function createApiFailoverRunState(
  attempts: Array<{ profileId: string }>
): ApiFailoverRunState {
  const orderedAttempts = attempts
    .filter((attempt) => attempt.profileId)
    .map((attempt) => ({ profileId: attempt.profileId }))
  return {
    attempts: orderedAttempts,
    activeProfileId: orderedAttempts[0]?.profileId || "",
    failedAttempts: [],
    paused: orderedAttempts.length === 0,
    pauseReason: orderedAttempts.length ? "" : "没有可用 API Profile",
  }
}

export function recordApiProfileFailure(
  state: ApiFailoverRunState,
  { profileId, error }: RecordApiProfileFailureInput
): ApiFailoverRunState {
  const kind = classifyApiProfileFailure(error)
  const failedAttempts = [
    ...state.failedAttempts,
    {
      profileId,
      status: Number.isFinite(Number(error.status)) ? Number(error.status) : null,
      message: cleanFailureMessage(error.message),
      kind,
    },
  ]
  const currentIndex = state.attempts.findIndex(
    (attempt) => attempt.profileId === profileId
  )
  const nextAttempt =
    kind === "retryable" ? state.attempts[currentIndex + 1] : undefined

  if (nextAttempt) {
    return {
      ...state,
      activeProfileId: nextAttempt.profileId,
      failedAttempts,
      paused: false,
      pauseReason: "",
    }
  }

  const reason =
    kind === "retryable"
      ? `所有 API Profile 均不可用：${cleanFailureMessage(error.message)}`
      : `API Profile ${profileId} 不可继续：${cleanFailureMessage(error.message)}`

  return {
    ...state,
    failedAttempts,
    paused: true,
    pauseReason: reason,
  }
}

export async function runApiProfileFailover<T>(
  plan: ApiFailoverPlan,
  operation: (attempt: ApiFailoverAttempt) => Promise<T>
): Promise<ApiProfileFailoverResult<T>> {
  let state = createApiFailoverRunState(plan.attempts)
  if (state.paused) {
    return {
      ok: false,
      state,
      error: state.pauseReason,
    }
  }

  for (const attempt of plan.attempts) {
    try {
      const value = await operation(attempt)
      return {
        ok: true,
        value,
        state: {
          ...state,
          activeProfileId: attempt.profileId,
          paused: false,
          pauseReason: "",
        },
      }
    } catch (error) {
      const failure =
        error && typeof error === "object"
          ? (error as ApiProfileFailureInput)
          : { message: error instanceof Error ? error.message : String(error) }
      state = recordApiProfileFailure(state, {
        profileId: attempt.profileId,
        error: failure,
      })
      if (state.paused) {
        return {
          ok: false,
          state,
          error: state.pauseReason,
        }
      }
    }
  }

  return {
    ok: false,
    state,
    error: state.pauseReason || "所有 API Profile 均不可用",
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
