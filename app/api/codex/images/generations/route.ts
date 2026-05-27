import {
  buildImageJsonPayload,
  forwardCodexImageJson,
} from "@/lib/server/codex-proxy"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: Request) {
  const input = await request.json()
  const result = buildImageJsonPayload(input)

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 })
  }

  return forwardCodexImageJson("/v1/images/generations", result.payload, result.apiBaseUrl, result.apiKey)
}
