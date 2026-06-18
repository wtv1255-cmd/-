import {
  buildImageJsonPayload,
  forwardCodexImageJson,
  resolveImageGenerationPath,
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
    resolveImageGenerationPath({
      apiBaseUrl: result.apiBaseUrl,
      model: String(input.model || ""),
    }),
    result.payload,
    result.apiBaseUrl,
    result.apiKey,
    result.count
  )
}
