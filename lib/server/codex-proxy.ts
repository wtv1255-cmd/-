import { NextResponse } from "next/server"

type ImagePayload = {
  model?: string
  prompt?: string
  n?: number
  size?: string
  quality?: string
  output_format?: string
  background?: string
  upscale?: string
  apiBaseUrl?: string
  apiKey?: string
}

export const AGNES_IMAGE_MODEL = "agnes-image-2.1-flash"

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
  const count = Math.max(
    1,
    Math.min(10, Math.floor(Math.abs(Number(input.n)) || 1))
  )

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
      apiKey: readApiKey(input.apiKey),
      apiBaseUrl: normalizeBaseUrl(input.apiBaseUrl),
    }
  }

  const payload: Record<string, unknown> = {
    model,
    prompt,
    n: count,
    response_format: "b64_json",
  }

  if (keepParam(input.size)) payload.size = input.size
  if (keepParam(input.quality)) payload.quality = input.quality
  if (keepParam(input.output_format))
    payload.output_format = input.output_format
  if (keepParam(input.background)) payload.background = input.background
  if (keepParam(input.upscale)) payload.upscale = input.upscale

  return {
    payload,
    apiKey: readApiKey(input.apiKey),
    apiBaseUrl: normalizeBaseUrl(input.apiBaseUrl),
  }
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
  apiKey: string
) {
  if (!apiBaseUrl) {
    return NextResponse.json(
      { error: "缺少 CodexProxy API 地址，请先在图片工作台设置里填写。" },
      { status: 400 }
    )
  }
  if (!apiKey) {
    return NextResponse.json(
      { error: "缺少 CodexProxy API Key，请先在图片工作台设置里填写。" },
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
      { error: "缺少 CodexProxy API 地址，请先在图片工作台设置里填写。" },
      { status: 400 }
    )
  }
  if (!apiKey) {
    return NextResponse.json(
      { error: "缺少 CodexProxy API Key，请先在图片工作台设置里填写。" },
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
      { error: "缺少 CodexProxy API 地址，请先在图片工作台设置里填写。" },
      { status: 400 }
    )
  }
  if (!apiKey) {
    return NextResponse.json(
      { error: "缺少 CodexProxy API Key，请先在图片工作台设置里填写。" },
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
