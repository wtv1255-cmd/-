import {
  buildAgnesImagePayload,
  build521ImagePayload,
  forwardCodexImageJson,
  isAgnesImageModel,
  readImageCount,
  resolveRequestBaseUrl,
  resolveRequestApiKey,
} from "@/lib/server/codex-proxy"

export const runtime = "nodejs"
export const maxDuration = 900

export async function POST(request: Request) {
  const input = await request.formData()
  const prompt = String(input.get("prompt") || "").trim()
  const model = String(input.get("model") || "gpt-image-2").trim()
  const images = input
    .getAll("image")
    .filter((item): item is File => item instanceof File)
  const apiBaseUrl = resolveRequestBaseUrl(input.get("apiBaseUrl"))
  const apiKey = resolveRequestApiKey(input.get("apiKey"))
  const count = readImageCount(input.get("n"))

  if (!prompt) {
    return Response.json({ error: "请输入生图提示词" }, { status: 400 })
  }

  if (!images.length) {
    return Response.json({ error: "图生图需要至少一张参考图" }, { status: 400 })
  }

  if (isAgnesImageModel(model)) {
    const imageDataUrls = await Promise.all(images.map(fileToDataUrl))
    return forwardCodexImageJson(
      "/v1/images/generations",
      buildAgnesImagePayload({
        model,
        prompt,
        size: input.get("size"),
        images: imageDataUrls,
      }),
      apiBaseUrl,
      apiKey
    )
  }

  const imageDataUrls = await Promise.all(images.map(fileToDataUrl))
  return forwardCodexImageJson(
    "/v1/videos",
    build521ImagePayload({
      model,
      prompt,
      size: input.get("size"),
      negativePrompt: input.get("negative_prompt"),
      imageUrls: imageDataUrls,
    }),
    apiBaseUrl,
    apiKey,
    count
  )
}

async function fileToDataUrl(file: File) {
  const bytes = Buffer.from(await file.arrayBuffer())
  return `data:${file.type || "image/png"};base64,${bytes.toString("base64")}`
}
