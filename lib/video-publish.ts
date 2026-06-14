export type PublishPlatform = "douyin"

export type PublishAccount = {
  id: string
  displayName: string
  platform: PublishPlatform
  browserProfileId: string
  authorized: boolean
}

export type PublishDraftStatus =
  | "draft"
  | "needs_confirmation"
  | "blocked"
  | "ready_to_publish"
  | "paused_for_manual_action"
  | "published"
  | "failed"

export type PublishLogKind =
  | "draft_created"
  | "confirmation_required"
  | "ready_to_publish"
  | "captcha"
  | "login_expired"
  | "real_name_check"
  | "risk_prompt"
  | "retry_limit"
  | "upload_failed"
  | "published"

export type PublishLogEntry = {
  at: string
  kind: PublishLogKind
  message: string
}

export type PublishDraft = {
  id: string
  taskId: string
  renderedVideoPath: string
  title: string
  topics: string[]
  intro: string
  coverImagePath: string
  account: PublishAccount
  status: PublishDraftStatus
  manualActionRequired: boolean
  pauseReason?: string
  reason?: string
  confirmedAt?: string
  publishLog: PublishLogEntry[]
}

export type CreatePublishDraftInput = {
  taskId: string
  renderedVideoPath: string
  titleSeed: string
  scriptSummary: string
  coverImagePath: string
  account: PublishAccount
}

export type StartPublishOptions = {
  confirmed: boolean
  now?: string
}

export type PublishAutomationEvent = {
  kind:
    | "captcha"
    | "login_expired"
    | "real_name_check"
    | "risk_prompt"
    | "retry_limit"
    | "upload_failed"
    | "published"
  message: string
  now?: string
}

export const VIDEO_PUBLISH_DRAFT_STORAGE_KEY =
  "ta-huo:video-factory:publish-draft-v1"

const defaultTopics = ["她火助手", "AI短视频", "短视频工具"]
const credentialLikeFields = new Set([
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "cookie",
  "cookies",
  "authorization",
  "internalAccessToken",
])

function nowIso(now?: string) {
  return now || new Date().toISOString()
}

function safeText(value: string, fallback: string, maxLength = 80) {
  const compact = value.replace(/\s+/g, " ").trim()
  return (compact || fallback).slice(0, maxLength)
}

function appendLog(
  draft: PublishDraft,
  kind: PublishLogKind,
  message: string,
  at = nowIso()
) {
  return {
    ...draft,
    publishLog: [
      ...draft.publishLog,
      {
        at,
        kind,
        message,
      },
    ],
  }
}

function pauseReasonFor(kind: PublishAutomationEvent["kind"], message: string) {
  const labelMap: Partial<Record<PublishAutomationEvent["kind"], string>> = {
    captcha: "页面出现验证码，需要用户处理后再继续",
    login_expired: "登录态已过期，需要用户重新登录授权账号",
    real_name_check: "页面要求实名验证，需要用户处理",
    risk_prompt: "页面出现风控提示，需要用户确认",
    retry_limit: "发布重试次数已达上限，需要人工检查",
    upload_failed: "上传失败，需要用户检查视频文件或网络",
  }
  return `${labelMap[kind] || "发布流程暂停"}：${message}`
}

export function createPublishDraft(input: CreatePublishDraftInput): PublishDraft {
  const title = safeText(input.titleSeed, "她火短视频")
  const intro = safeText(input.scriptSummary, "由她火助手生成的短视频发布草稿", 180)
  return {
    id: `publish_${input.taskId}`,
    taskId: input.taskId,
    renderedVideoPath: input.renderedVideoPath,
    title,
    topics: defaultTopics,
    intro,
    coverImagePath: input.coverImagePath,
    account: { ...input.account },
    status: "draft",
    manualActionRequired: false,
    publishLog: [
      {
        at: nowIso(),
        kind: "draft_created",
        message: "已生成发布草稿，等待用户确认标题、话题、简介和封面。",
      },
    ],
  }
}

export function startAuthorizedPublish(
  draft: PublishDraft,
  options: StartPublishOptions
): PublishDraft {
  if (!options.confirmed) {
    return appendLog(
      {
        ...draft,
        status: "needs_confirmation",
        manualActionRequired: true,
        reason: "发布前必须由用户确认标题、话题、简介、封面和账号。",
      },
      "confirmation_required",
      "发布前确认未完成。",
      nowIso(options.now)
    )
  }

  if (!draft.account.authorized) {
    return appendLog(
      {
        ...draft,
        status: "blocked",
        manualActionRequired: true,
        reason: "所选抖音账号未授权，不能启动自动发布。",
      },
      "confirmation_required",
      "账号未授权，发布已阻止。",
      nowIso(options.now)
    )
  }

  if (!draft.account.browserProfileId.trim()) {
    return appendLog(
      {
        ...draft,
        status: "blocked",
        manualActionRequired: true,
        reason: "所选抖音账号缺少独立浏览器 Profile，不能启动自动发布。",
      },
      "confirmation_required",
      "缺少授权浏览器 Profile，发布已阻止。",
      nowIso(options.now)
    )
  }

  return appendLog(
    {
      ...draft,
      status: "ready_to_publish",
      manualActionRequired: false,
      confirmedAt: nowIso(options.now),
      reason: undefined,
    },
    "ready_to_publish",
    `用户已确认发布，准备使用浏览器 Profile ${draft.account.browserProfileId}。`,
    nowIso(options.now)
  )
}

export function recordPublishAutomationResult(
  draft: PublishDraft,
  event: PublishAutomationEvent
): PublishDraft {
  const at = nowIso(event.now)
  if (event.kind === "published") {
    return appendLog(
      {
        ...draft,
        status: "published",
        manualActionRequired: false,
        pauseReason: undefined,
        reason: undefined,
      },
      "published",
      event.message,
      at
    )
  }

  return appendLog(
    {
      ...draft,
      status: "paused_for_manual_action",
      manualActionRequired: true,
      pauseReason: pauseReasonFor(event.kind, event.message),
    },
    event.kind,
    event.message,
    at
  )
}

export function sanitizePublishDraftForExport(draft: PublishDraft) {
  return JSON.parse(
    JSON.stringify(draft, (key, value) =>
      credentialLikeFields.has(key) ? undefined : value
    )
  ) as PublishDraft
}

export function savePublishDraft(
  draft: PublishDraft,
  storage: Storage = window.localStorage
) {
  storage.setItem(
    VIDEO_PUBLISH_DRAFT_STORAGE_KEY,
    JSON.stringify(sanitizePublishDraftForExport(draft))
  )
}

export function readPublishDraft(storage: Storage = window.localStorage) {
  const raw = storage.getItem(VIDEO_PUBLISH_DRAFT_STORAGE_KEY)
  if (!raw) return null
  const parsed = JSON.parse(raw) as PublishDraft
  return sanitizePublishDraftForExport(parsed)
}
