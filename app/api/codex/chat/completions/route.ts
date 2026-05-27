import {
  forwardCodexChatJson,
  resolveRequestApiKey,
  resolveRequestBaseUrl,
} from "@/lib/server/codex-proxy"

export async function POST(request: Request) {
  let input: Record<string, unknown>

  try {
    input = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: "请求参数格式异常" }, { status: 400 })
  }

  const apiBaseUrl = resolveRequestBaseUrl(input.apiBaseUrl)
  const apiKey = resolveRequestApiKey(input.apiKey)
  const payload = { ...input }
  delete payload.apiBaseUrl
  delete payload.apiKey

  return forwardCodexChatJson(
    "/v1/chat/completions",
    payload,
    apiBaseUrl,
    apiKey
  )
}
