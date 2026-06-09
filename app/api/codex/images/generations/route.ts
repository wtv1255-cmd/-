import {
  buildImageJsonPayload,
  forwardCodexImageJson,
  isAgnesImageModel,
} from "@/lib/server/codex-proxy"

export const runtime = "nodejs"
export const maxDuration = 900

export async function POST(request: Request) {
  const input = await request.json()
  const result = buildImageJsonPayload(input)

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 })
  }

  return forwardCodexImageJson(
    isAgnesImageModel(String(input.model || ""))
      ? "/v1/images/generations"
      : "/v1/videos",
    result.payload,
    result.apiBaseUrl,
    result.apiKey,
    result.count
  )
}
