export type LicenseFeature =
  | "prompt_center_basic"
  | "image_workbench"
  | "video_factory"
  | "auto_publish"
  | "batch_matrix"
  | "davinci_engine"

export type LicenseStatus =
  | "missing"
  | "malformed"
  | "invalid_signature"
  | "expired"
  | "not_yet_valid"
  | "device_mismatch"
  | "valid"

export type LicensePayload = {
  licenseId: string
  subject: string
  deviceId?: string
  issuedAt: string
  expiresAt: string
  features: LicenseFeature[]
}

export type LicenseVerificationResult = {
  valid: boolean
  status: LicenseStatus
  features: LicenseFeature[]
  payload: LicensePayload | null
  expiresAt: string | null
}

export type LicenseVerificationOptions = {
  deviceId?: string
  now?: string | number | Date
  publicKeyJwk?: JsonWebKey
}

export const LICENSE_CACHE_STORAGE_KEY = "ta-huo:license-cache-v1"
export const LICENSE_DEVICE_ID_STORAGE_KEY = "ta-huo:license-device-v1"
export const LICENSE_DEV_PUBLIC_KEY_STORAGE_KEY =
  "ta-huo:license-dev-public-key"

export const LICENSE_FEATURE_LABELS: Record<LicenseFeature, string> = {
  prompt_center_basic: "提示词中心",
  image_workbench: "图片工作台",
  video_factory: "视频工厂",
  auto_publish: "自动发布",
  batch_matrix: "批量矩阵",
  davinci_engine: "DaVinci 高级引擎",
}

const SUPPORTED_FEATURES = new Set<LicenseFeature>(
  Object.keys(LICENSE_FEATURE_LABELS) as LicenseFeature[]
)

export const TA_HUO_LICENSE_PUBLIC_KEY_JWK: JsonWebKey = {
  key_ops: ["verify"],
  ext: true,
  kty: "EC",
  x: "62WQwJjbThTZvIyDj1i86YlQ2ck6ygnxYZbpJh_IvmE",
  y: "IltPDe40s72wU_fUr4PKYx_zOYGcUD61kCqIK6GKeBA",
  crv: "P-256",
}

function emptyResult(status: LicenseStatus): LicenseVerificationResult {
  return {
    valid: false,
    status,
    features: [],
    payload: null,
    expiresAt: null,
  }
}

function normalizeFeature(value: unknown): LicenseFeature | null {
  return typeof value === "string" && SUPPORTED_FEATURES.has(value as LicenseFeature)
    ? (value as LicenseFeature)
    : null
}

function base64UrlDecode(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function decodeJsonPart(value: string) {
  const bytes = base64UrlDecode(value)
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

function parseLicensePayload(value: unknown): LicensePayload | null {
  if (!value || typeof value !== "object") return null
  const payload = value as Partial<LicensePayload>
  const features = Array.isArray(payload.features)
    ? payload.features
        .map((item) => normalizeFeature(item))
        .filter((item): item is LicenseFeature => Boolean(item))
    : []

  if (
    typeof payload.licenseId !== "string" ||
    typeof payload.subject !== "string" ||
    typeof payload.issuedAt !== "string" ||
    typeof payload.expiresAt !== "string" ||
    !features.length
  ) {
    return null
  }

  if (payload.deviceId !== undefined && typeof payload.deviceId !== "string") {
    return null
  }

  return {
    licenseId: payload.licenseId,
    subject: payload.subject,
    deviceId: payload.deviceId,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    features,
  }
}

function parseActivationPackage(raw: string) {
  const value = raw.trim()
  const compact = value.match(/^THL1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u)
  if (compact) {
    return {
      payloadPart: compact[1],
      signaturePart: compact[2],
    }
  }

  const parsed = JSON.parse(value) as {
    payload?: unknown
    signature?: unknown
  }
  if (typeof parsed.payload !== "string" || typeof parsed.signature !== "string") {
    return null
  }
  return {
    payloadPart: parsed.payload,
    signaturePart: parsed.signature,
  }
}

function toTime(value: string | number | Date | undefined) {
  const date = value === undefined ? new Date() : new Date(value)
  const time = date.getTime()
  return Number.isFinite(time) ? time : Number.NaN
}

function getLicensePublicKeyJwk() {
  if (
    process.env.NODE_ENV !== "production" &&
    typeof window !== "undefined"
  ) {
    try {
      const override = window.localStorage.getItem(
        LICENSE_DEV_PUBLIC_KEY_STORAGE_KEY
      )
      if (override) return JSON.parse(override) as JsonWebKey
    } catch {
      return TA_HUO_LICENSE_PUBLIC_KEY_JWK
    }
  }

  return TA_HUO_LICENSE_PUBLIC_KEY_JWK
}

async function importVerifyKey(publicKeyJwk: JsonWebKey) {
  return crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  )
}

export async function verifyLicensePackage(
  raw: string | null | undefined,
  options: LicenseVerificationOptions = {}
): Promise<LicenseVerificationResult> {
  if (!raw?.trim()) return emptyResult("missing")

  try {
    const parsed = parseActivationPackage(raw)
    if (!parsed) return emptyResult("malformed")

    const payload = parseLicensePayload(decodeJsonPart(parsed.payloadPart))
    if (!payload) return emptyResult("malformed")

    const publicKey = await importVerifyKey(
      options.publicKeyJwk || getLicensePublicKeyJwk()
    )
    const verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      base64UrlDecode(parsed.signaturePart),
      new TextEncoder().encode(parsed.payloadPart)
    )
    if (!verified) return emptyResult("invalid_signature")

    const now = toTime(options.now)
    const issuedAt = toTime(payload.issuedAt)
    const expiresAt = toTime(payload.expiresAt)
    if (!Number.isFinite(now) || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
      return emptyResult("malformed")
    }
    if (issuedAt > now) return emptyResult("not_yet_valid")
    if (expiresAt <= now) return emptyResult("expired")
    if (
      options.deviceId &&
      payload.deviceId &&
      payload.deviceId !== options.deviceId
    ) {
      return emptyResult("device_mismatch")
    }

    return {
      valid: true,
      status: "valid",
      features: payload.features,
      payload,
      expiresAt: payload.expiresAt,
    }
  } catch {
    return emptyResult("malformed")
  }
}

export function hasLicenseFeature(
  result: LicenseVerificationResult | null | undefined,
  feature: LicenseFeature
) {
  return Boolean(result?.valid && result.features.includes(feature))
}

export function readCachedLicensePackage(storage: Storage = window.localStorage) {
  try {
    return storage.getItem(LICENSE_CACHE_STORAGE_KEY) || ""
  } catch {
    return ""
  }
}

export function cacheLicensePackage(
  raw: string,
  storage: Storage = window.localStorage
) {
  storage.setItem(LICENSE_CACHE_STORAGE_KEY, raw.trim())
}

export function clearCachedLicensePackage(storage: Storage = window.localStorage) {
  storage.removeItem(LICENSE_CACHE_STORAGE_KEY)
}

export function getOrCreateLicenseDeviceId(
  storage: Storage = window.localStorage
) {
  const existing = storage.getItem(LICENSE_DEVICE_ID_STORAGE_KEY)
  if (existing) return existing

  const nextId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  storage.setItem(LICENSE_DEVICE_ID_STORAGE_KEY, nextId)
  return nextId
}
