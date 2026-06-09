import { NextResponse } from "next/server"

type ImagePayload = {
  model?: string
  prompt?: string
  n?: number | string
  size?: string
  quality?: string
  negative_prompt?: string
  output_format?: string
  background?: string
  upscale?: string
  apiBaseUrl?: string
  apiKey?: string
}

type ProxiedImage = {
  id: string
  dataUrl?: string
  url?: string
  revisedPrompt?: string
  mimeType?: string
}

type VideoTaskResult =
  | { image: ProxiedImage }
  | { error: string; status: number }

export const AGNES_IMAGE_MODEL = "agnes-image-2.1-flash"
const DEFAULT_521_IMAGE_MODEL = "gpt-image-2-2K"
const VIDEO_TASK_POLL_INTERVAL_MS = 6000
const VIDEO_TASK_MAX_POLLS = 120
const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504])

function normalizeBaseUrl(value: unknown) {
  const baseUrl =
    typeof value === "string" ? value.trim().replace(/\/+$/, "") : ""
  return baseUrl
}

function buildCodexUrl(apiBaseUrl: string, path: string) {
  if (apiBaseUrl.endsWith("/v1") && path.startsWith("/v1/")) {
    return `${apiBaseUrl}${path.slice(3)}`
  }
  return `${apiBaseUrl}${path}`
}

function readApiKey(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function keepParam(value: unknown) {
  if (value === undefined || value === null) return false
  if (typeof value === "string") return value.trim() !== "" && value !== "auto"
  return true
}

function keepText(value: unknown) {
  return typeof value === "string" && value.trim() !== ""
}

export function readImageCount(value: unknown) {
  return Math.max(1, Math.min(10, Math.floor(Math.abs(Number(value)) || 1)))
}

export function isAgnesImageModel(model: string) {
  return model.toLowerCase() === AGNES_IMAGE_MODEL
}

export function buildAgnesImagePayload({
  model,
  prompt,
  size,
  images,
}: {
  model: string
  prompt: string
  size?: unknown
  images?: string[]
}) {
  const extraBody: Record<string, unknown> = {
    response_format: "url",
  }
  if (images?.length) extraBody.image = images

  const payload: Record<string, unknown> = {
    model,
    prompt,
    extra_body: extraBody,
  }
  if (keepParam(size)) payload.size = size
  return payload
}

export function buildImageJsonPayload(input: ImagePayload) {
  const model = input.model?.trim() || "gpt-image-2"
  const prompt = input.prompt?.trim() || ""
  const count = readImageCount(input.n)

  if (!prompt) {
    return { error: "请输入生图提示词" as const }
  }

  if (isAgnesImageModel(model)) {
    return {
      payload: buildAgnesImagePayload({
        model,
        prompt,
        size: input.size,
      }),
      count,
      apiKey: readApiKey(input.apiKey),
      apiBaseUrl: normalizeBaseUrl(input.apiBaseUrl),
    }
  }

  const payload: Record<string, unknown> = {
    model: resolve521ImageModel(model),
    prompt,
    aspect_ratio: sizeTo521AspectRatio(input.size),
  }

  if (keepText(input.negative_prompt))
    payload.negative_prompt = input.negative_prompt?.trim()

  return {
    payload,
    count,
    apiKey: readApiKey(input.apiKey),
    apiBaseUrl: normalizeBaseUrl(input.apiBaseUrl),
  }
}

export function build521ImagePayload({
  model,
  prompt,
  size,
  negativePrompt,
  imageUrls,
}: {
  model: string
  prompt: string
  size?: unknown
  negativePrompt?: unknown
  imageUrls?: string[]
}) {
  const payload: Record<string, unknown> = {
    model: resolve521ImageModel(model),
    prompt: prompt.trim(),
    aspect_ratio: sizeTo521AspectRatio(size),
  }

  if (imageUrls?.length) payload.image_urls = imageUrls
  if (keepText(negativePrompt))
    payload.negative_prompt = String(negativePrompt).trim()
  return payload
}

export function appendImageFormValue(
  formData: FormData,
  key: string,
  value: unknown
) {
  if (!keepParam(value)) return
  formData.set(key, String(value))
}

export function resolveRequestApiKey(value: unknown) {
  return readApiKey(value)
}

export function resolveRequestBaseUrl(value: unknown) {
  return normalizeBaseUrl(value)
}

export async function forwardCodexImageJson(
  path: string,
  payload: Record<string, unknown>,
  apiBaseUrl: string,
  apiKey: string,
  count = 1
) {
  if (!apiBaseUrl) {
    return NextResponse.json(
      { error: "缺少生图 API 地址，请先在图片工作台设置里填写。" },
      { status: 400 }
    )
  }
  if (!apiKey) {
    return NextResponse.json(
      { error: "缺少生图 API Key，请先在图片工作台设置里填写。" },
      { status: 400 }
    )
  }

  if (path === "/v1/videos") {
    return forward521VideoTask(path, payload, apiBaseUrl, apiKey, count)
  }

  const response = await fetch(buildCodexUrl(apiBaseUrl, path), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  })

  return normalizeUpstreamImageResponse(
    response,
    String(payload.output_format || "png")
  )
}

export async function forwardCodexImageForm(
  path: string,
  formData: FormData,
  apiBaseUrl: string,
  apiKey: string
) {
  if (!apiBaseUrl) {
    return NextResponse.json(
      { error: "缺少生图 API 地址，请先在图片工作台设置里填写。" },
      { status: 400 }
    )
  }
  if (!apiKey) {
    return NextResponse.json(
      { error: "缺少生图 API Key，请先在图片工作台设置里填写。" },
      { status: 400 }
    )
  }

  const response = await fetch(buildCodexUrl(apiBaseUrl, path), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
    cache: "no-store",
  })

  return normalizeUpstreamImageResponse(
    response,
    String(formData.get("output_format") || "png")
  )
}

export async function forwardCodexChatJson(
  path: string,
  payload: Record<string, unknown>,
  apiBaseUrl: string,
  apiKey: string
) {
  if (!apiBaseUrl) {
    return NextResponse.json(
      { error: "缺少语言模型 API 地址，请先在图片工作台设置里填写。" },
      { status: 400 }
    )
  }
  if (!apiKey) {
    return NextResponse.json(
      { error: "缺少语言模型 API Key，请先在图片工作台设置里填写。" },
      { status: 400 }
    )
  }

  const response = await fetch(buildCodexUrl(apiBaseUrl, path), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  })

  return normalizeUpstreamChatResponse(response)
}

async function forward521VideoTask(
  path: string,
  payload: Record<string, unknown>,
  apiBaseUrl: string,
  apiKey: string,
  count: number
) {
  const requestCount = readImageCount(count)
  const jobs = Array.from({ length: requestCount }, () =>
    run521VideoTask(path, payload, apiBaseUrl, apiKey)
  )
  const settled = await Promise.allSettled(jobs)
  const images: ProxiedImage[] = []
  let firstError = ""
  let firstStatus = 502

  settled.forEach((item) => {
    if (item.status === "fulfilled") {
      if ("error" in item.value) {
        if (!firstError) {
          firstError = item.value.error
          firstStatus = item.value.status
        }
      } else {
        images.push(item.value.image)
      }
      return
    }

    if (!firstError) {
      firstError =
        item.reason instanceof Error ? item.reason.message : "生成失败"
    }
  })

  if (images.length) {
    return NextResponse.json({ images })
  }

  return NextResponse.json(
    { error: firstError || "生成失败" },
    { status: firstStatus }
  )
}

async function run521VideoTask(
  path: string,
  payload: Record<string, unknown>,
  apiBaseUrl: string,
  apiKey: string
): Promise<VideoTaskResult> {
  const submitted = await request521Json(
    "POST",
    buildCodexUrl(apiBaseUrl, path),
    payload,
    apiKey
  )
  const taskId = readTaskId(submitted)
  if (!taskId) {
    return { error: "提交成功但没有返回 task_id", status: 502 }
  }

  const statusUrl = buildCodexUrl(apiBaseUrl, `/v1/videos/${taskId}`)
  const completed = await poll521VideoTask(statusUrl, apiKey)
  if ("error" in completed) {
    return {
      error: completed.error || "轮询任务失败",
      status: completed.status || 502,
    }
  }

  const image = await download521Image(completed.remoteUrl, apiKey)
  if ("error" in image) {
    return { error: image.error || "下载图片失败", status: image.status || 502 }
  }

  return {
    image: {
      id: crypto.randomUUID(),
      dataUrl: `data:${image.mimeType};base64,${image.base64}`,
      mimeType: image.mimeType,
    },
  }
}

async function request521Json(
  method: "GET" | "POST",
  url: string,
  payload: Record<string, unknown> | null,
  apiKey: string
) {
  const response = await fetchWithRetry(url, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
  })
  const text = await response.text()
  let data: unknown

  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { error: text || "接口返回异常" }
  }

  if (!response.ok) {
    throw new Error(readUpstreamError(data, response.status))
  }
  return data
}

async function fetchWithRetry(url: string, init: RequestInit) {
  let lastError: unknown

  for (let attempt = 0; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, init)
      if (!RETRYABLE_HTTP_STATUS.has(response.status) || attempt === 4) {
        return response
      }
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
      if (attempt === 4) break
    }
    await sleep(3000 * (attempt + 1))
  }

  throw lastError instanceof Error ? lastError : new Error("请求失败")
}

async function poll521VideoTask(url: string, apiKey: string) {
  for (let attempt = 0; attempt < VIDEO_TASK_MAX_POLLS; attempt += 1) {
    let data: unknown
    try {
      data = await request521Json("GET", url, null, apiKey)
    } catch (error) {
      if (attempt >= VIDEO_TASK_MAX_POLLS - 1) {
        return {
          error: error instanceof Error ? error.message : "轮询任务失败",
          status: 502,
        }
      }
      await sleep(VIDEO_TASK_POLL_INTERVAL_MS)
      continue
    }

    const status =
      data && typeof data === "object" && "status" in data
        ? String((data as { status?: unknown }).status || "").toLowerCase()
        : ""
    if (status === "completed") {
      const remoteUrl =
        data && typeof data === "object" && "video_url" in data
          ? String((data as { video_url?: unknown }).video_url || "").trim()
          : ""
      if (!remoteUrl)
        return { error: "任务完成但没有返回图片 URL", status: 502 }
      return { remoteUrl }
    }
    if (status === "failed") {
      return { error: read521TaskError(data), status: 502 }
    }

    await sleep(VIDEO_TASK_POLL_INTERVAL_MS)
  }

  return { error: "轮询超时，图片任务仍未完成", status: 504 }
}

async function download521Image(remoteUrl: string, apiKey: string) {
  try {
    const response = await fetchWithRetry(remoteUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    })
    if (!response.ok) {
      return {
        error: `下载图片失败：${response.status}`,
        status: response.status,
      }
    }

    const bytes = Buffer.from(await response.arrayBuffer())
    const mimeType =
      normalizeContentType(response.headers.get("content-type")) ||
      detectImageMimeType(bytes) ||
      "image/png"
    return { base64: bytes.toString("base64"), mimeType }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "下载图片失败",
      status: 502,
    }
  }
}

function readTaskId(payload: unknown) {
  if (!payload || typeof payload !== "object") return ""
  const value = payload as Record<string, unknown>
  return String(value.id || value.task_id || "").trim()
}

function read521TaskError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "任务失败"
  const value = payload as Record<string, unknown>
  const error = value.error
  if (typeof error === "string" && error.trim()) return error.trim()
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "任务失败")
  }
  if (typeof value.message === "string" && value.message.trim())
    return value.message.trim()
  return "任务失败"
}

function resolve521ImageModel(model: string) {
  const cleanModel = model.trim()
  if (cleanModel === "gpt-image-2") return DEFAULT_521_IMAGE_MODEL
  if (/^gpt-image-2-(1|2|4)k$/i.test(cleanModel)) {
    return cleanModel.replace(/k$/i, "K")
  }
  return cleanModel || DEFAULT_521_IMAGE_MODEL
}

function sizeTo521AspectRatio(value: unknown) {
  const size = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (!size || size === "auto") return "auto"

  const directRatios = new Set([
    "1:1",
    "3:2",
    "2:3",
    "4:3",
    "3:4",
    "16:9",
    "9:16",
    "21:9",
    "9:21",
  ])
  if (directRatios.has(size)) return size

  const match = /^(\d+)\s*x\s*(\d+)$/.exec(size)
  if (!match) return "auto"
  const width = Number(match[1])
  const height = Number(match[2])
  if (!width || !height) return "auto"

  const divisor = gcd(width, height)
  const ratio = `${width / divisor}:${height / divisor}`
  if (directRatios.has(ratio)) return ratio

  return nearest521AspectRatio(width / height)
}

function nearest521AspectRatio(value: number) {
  const ratios: Array<[string, number]> = [
    ["1:1", 1],
    ["3:2", 3 / 2],
    ["2:3", 2 / 3],
    ["4:3", 4 / 3],
    ["3:4", 3 / 4],
    ["16:9", 16 / 9],
    ["9:16", 9 / 16],
    ["21:9", 21 / 9],
    ["9:21", 9 / 21],
  ]
  return ratios.reduce((best, item) =>
    Math.abs(item[1] - value) < Math.abs(best[1] - value) ? item : best
  )[0]
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a))
  let y = Math.abs(Math.round(b))
  while (y) {
    const next = x % y
    x = y
    y = next
  }
  return x || 1
}

function normalizeContentType(value: string | null) {
  const contentType = (value || "").split(";")[0].trim().toLowerCase()
  if (contentType.startsWith("image/")) return contentType
  return ""
}

function detectImageMimeType(bytes: Buffer) {
  if (
    bytes.length >= 8 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png"
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg"
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp"
  }
  return ""
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function normalizeUpstreamImageResponse(
  response: Response,
  outputFormat: string
) {
  const text = await response.text()
  let payload: unknown

  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = { error: text || "接口返回异常" }
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: readUpstreamError(payload, response.status) },
      { status: response.status }
    )
  }

  const data =
    payload && typeof payload === "object" && "data" in payload
      ? (payload as { data?: unknown }).data
      : []
  const items = Array.isArray(data) ? data : []
  const mimeType = outputFormatToMime(outputFormat)
  const images = items
    .map((item) => normalizeImageItem(item, mimeType))
    .filter(
      (item): item is NonNullable<ReturnType<typeof normalizeImageItem>> =>
        Boolean(item)
    )

  if (!images.length) {
    return NextResponse.json({ error: "接口没有返回图片" }, { status: 502 })
  }

  return NextResponse.json({ images })
}

async function normalizeUpstreamChatResponse(response: Response) {
  const text = await response.text()
  let payload: unknown

  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = { error: text || "接口返回异常" }
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: readUpstreamError(payload, response.status) },
      { status: response.status }
    )
  }

  const content = readChatContent(payload)
  if (!content) {
    return NextResponse.json({ error: "接口没有返回文本" }, { status: 502 })
  }

  return NextResponse.json({ text: content })
}

function readChatContent(payload: unknown) {
  if (!payload || typeof payload !== "object") return ""
  const choices =
    "choices" in payload ? (payload as { choices?: unknown }).choices : []
  if (!Array.isArray(choices) || !choices.length) return ""
  const first = choices[0]
  if (!first || typeof first !== "object") return ""
  const message =
    "message" in first ? (first as { message?: unknown }).message : null
  if (!message || typeof message !== "object") return ""
  const content = (message as { content?: unknown }).content

  if (typeof content === "string") return content.trim()
  if (!Array.isArray(content)) return ""

  return content
    .map((item) => {
      if (!item || typeof item !== "object") return ""
      const value = item as Record<string, unknown>
      if (typeof value.text === "string") return value.text
      if (typeof value.content === "string") return value.content
      return ""
    })
    .filter(Boolean)
    .join("\n")
    .trim()
}

function normalizeImageItem(item: unknown, mimeType: string) {
  if (!item || typeof item !== "object") return null
  const value = item as Record<string, unknown>
  const b64 = typeof value.b64_json === "string" ? value.b64_json : ""
  const url = typeof value.url === "string" ? value.url : ""

  if (!b64 && !url) return null

  return {
    id: crypto.randomUUID(),
    dataUrl: b64 ? `data:${mimeType};base64,${b64}` : undefined,
    url: url || undefined,
    revisedPrompt:
      typeof value.revised_prompt === "string"
        ? value.revised_prompt
        : undefined,
    mimeType,
  }
}

function outputFormatToMime(format: string) {
  const value = format.toLowerCase()
  if (value === "jpeg" || value === "jpg") return "image/jpeg"
  if (value === "webp") return "image/webp"
  return "image/png"
}

function readUpstreamError(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    if ("error" in payload) {
      const error = (payload as { error?: unknown }).error
      if (typeof error === "string" && error.trim()) return error
      if (error && typeof error === "object" && "message" in error)
        return String(
          (error as { message?: unknown }).message || `请求失败：${status}`
        )
    }
    if ("message" in payload)
      return String(
        (payload as { message?: unknown }).message || `请求失败：${status}`
      )
    if ("msg" in payload)
      return String((payload as { msg?: unknown }).msg || `请求失败：${status}`)
  }
  return `请求失败：${status}`
}
