export type ViralSourceCollectionMode = "recent_24_48h" | "stable_7d"

export type ViralSourceFailureReason =
  | "login_required"
  | "captcha_required"
  | "risk_control"
  | "network_error"
  | "unsupported"
  | "unknown"

export type ViralSourceMetrics = {
  likes?: number
  comments?: number
  favorites?: number
  shares?: number
}

export type ViralSourceCandidate = {
  id: string
  sourceKind: "douyin_auto" | "douyin_link" | "local_upload"
  title: string
  author: string
  publishedAt?: string
  durationSeconds?: number
  metrics: ViralSourceMetrics
  sourceAccount?: string
  url?: string
  cacheState: "not_cached" | "metadata_cached" | "local_file_ready"
  adapterId?: string
  localFile?: {
    filename: string
    bytes: number
    mimeType: string
  }
}

export type ViralSourceCollectRequest = {
  keyword: string
  mode: ViralSourceCollectionMode
}

export type ViralSourceAdapterSuccess = {
  ok: true
  adapterId: string
  candidates: ViralSourceCandidate[]
}

export type ViralSourceAdapterFailure = {
  ok: false
  adapterId: string
  reason: ViralSourceFailureReason
  message: string
}

export type ViralSourceAdapterResult =
  | ViralSourceAdapterSuccess
  | ViralSourceAdapterFailure

export type ViralSourceAdapter = {
  id: string
  label: string
  collect: (
    request: ViralSourceCollectRequest
  ) => Promise<ViralSourceAdapterResult>
}

export type CollectViralSourceCandidatesInput = ViralSourceCollectRequest & {
  adapters: ViralSourceAdapter[]
}

export type CollectViralSourceCandidatesResult = ViralSourceCollectRequest & {
  candidates: ViralSourceCandidate[]
  failures: ViralSourceAdapterFailure[]
  manualImportAvailable: boolean
  summary: string
}

export type CreateAdapterCandidateInput = Partial<
  Pick<
    ViralSourceCandidate,
    | "id"
    | "title"
    | "author"
    | "publishedAt"
    | "durationSeconds"
    | "metrics"
    | "sourceAccount"
    | "url"
    | "cacheState"
    | "adapterId"
  >
>

export type CreateDouyinLinkSourceCandidateInput = {
  url: string
  title?: string
  author?: string
}

export type CreateLocalUploadSourceCandidateInput = {
  filename: string
  bytes?: number
  mimeType?: string
  durationSeconds?: number
  title?: string
}

export const VIRAL_SOURCE_COLLECTION_MODES = [
  "recent_24_48h",
  "stable_7d",
] as const satisfies ReadonlyArray<ViralSourceCollectionMode>

function cleanText(value: unknown, fallback: string) {
  const cleaned =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
  return cleaned || fallback
}

function cleanId(value: unknown, fallback: string) {
  const cleaned =
    typeof value === "string"
      ? value
          .trim()
          .replace(/[^\w.-]+/g, "-")
          .replace(/^-+|-+$/g, "")
      : ""
  return cleaned || fallback
}

function cleanFilename(value: unknown, fallback: string) {
  const cleaned =
    typeof value === "string"
      ? value
          .trim()
          .replace(/[\\/:*?"<>|]+/g, "-")
          .replace(/\s+/g, "-")
      : ""
  return cleaned || fallback
}

function cleanNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : undefined
}

function cleanMetrics(metrics: ViralSourceMetrics = {}): ViralSourceMetrics {
  return {
    likes: cleanNumber(metrics.likes),
    comments: cleanNumber(metrics.comments),
    favorites: cleanNumber(metrics.favorites),
    shares: cleanNumber(metrics.shares),
  }
}

function normalizeFailure(
  adapter: ViralSourceAdapter,
  error: unknown
): ViralSourceAdapterFailure {
  if (error && typeof error === "object" && "reason" in error) {
    const reason = (error as { reason?: ViralSourceFailureReason }).reason
    return {
      ok: false,
      adapterId: adapter.id,
      reason: reason || "unknown",
      message: cleanText(
        (error as { message?: string }).message,
        `${adapter.label} 采集失败`
      ),
    }
  }

  return {
    ok: false,
    adapterId: adapter.id,
    reason: "unknown",
    message: error instanceof Error ? error.message : `${adapter.label} 采集失败`,
  }
}

export function createAdapterCandidate(
  input: CreateAdapterCandidateInput = {}
): ViralSourceCandidate {
  return {
    id: cleanId(input.id, `candidate-${Date.now()}`),
    sourceKind: "douyin_auto",
    title: cleanText(input.title, "未命名爆款候选"),
    author: cleanText(input.author, "未知作者"),
    publishedAt: input.publishedAt,
    durationSeconds: cleanNumber(input.durationSeconds),
    metrics: cleanMetrics(input.metrics),
    sourceAccount: input.sourceAccount?.trim(),
    url: input.url?.trim(),
    cacheState: input.cacheState || "metadata_cached",
    adapterId: input.adapterId,
  }
}

export async function collectViralSourceCandidates({
  keyword,
  mode,
  adapters,
}: CollectViralSourceCandidatesInput): Promise<CollectViralSourceCandidatesResult> {
  const request: ViralSourceCollectRequest = {
    keyword: cleanText(keyword, ""),
    mode: VIRAL_SOURCE_COLLECTION_MODES.includes(mode) ? mode : "recent_24_48h",
  }
  const candidates: ViralSourceCandidate[] = []
  const failures: ViralSourceAdapterFailure[] = []

  for (const adapter of adapters) {
    try {
      const result = await adapter.collect(request)
      if (result.ok) {
        candidates.push(
          ...result.candidates.map((candidate) => ({
            ...candidate,
            adapterId: candidate.adapterId || result.adapterId,
          }))
        )
      } else {
        failures.push(result)
      }
    } catch (error) {
      failures.push(normalizeFailure(adapter, error))
    }
  }

  return {
    ...request,
    candidates,
    failures,
    manualImportAvailable: true,
    summary: candidates.length
      ? `已采集 ${candidates.length} 个候选，仍可手动导入抖音链接或本地视频。`
      : "自动采集暂不可用，可继续手动导入抖音链接或本地视频。",
  }
}

export function createDouyinLinkSourceCandidate({
  url,
  title,
  author,
}: CreateDouyinLinkSourceCandidateInput): ViralSourceCandidate {
  const cleanedUrl = cleanText(url, "")
  return {
    id: `douyin-link-${cleanId(cleanedUrl, "manual")}`,
    sourceKind: "douyin_link",
    title: cleanText(title, "用户粘贴的抖音链接"),
    author: cleanText(author, "待解析作者"),
    metrics: {},
    url: cleanedUrl,
    cacheState: "metadata_cached",
  }
}

export function createLocalUploadSourceCandidate({
  filename,
  bytes,
  mimeType,
  durationSeconds,
  title,
}: CreateLocalUploadSourceCandidateInput): ViralSourceCandidate {
  const cleanedFilename = cleanFilename(filename, "source-video.mp4")
  return {
    id: `local-upload-${cleanId(cleanedFilename, "source-video")}`,
    sourceKind: "local_upload",
    title: cleanText(title, cleanedFilename),
    author: "本地上传",
    durationSeconds: cleanNumber(durationSeconds),
    metrics: {},
    cacheState: "local_file_ready",
    localFile: {
      filename: cleanedFilename,
      bytes: cleanNumber(bytes) || 0,
      mimeType: cleanText(mimeType, "application/octet-stream"),
    },
  }
}
