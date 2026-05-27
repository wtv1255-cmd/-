import {
  appendImageFormValue,
  forwardCodexImageForm,
  resolveRequestBaseUrl,
  resolveRequestApiKey,
} from "@/lib/server/codex-proxy"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: Request) {
  const input = await request.formData()
  const prompt = String(input.get("prompt") || "").trim()
  const model = String(input.get("model") || "gpt-image-2").trim()
  const images = input.getAll("image").filter((item): item is File => item instanceof File)
  const apiBaseUrl = resolveRequestBaseUrl(input.get("apiBaseUrl"))
  const apiKey = resolveRequestApiKey(input.get("apiKey"))

  if (!prompt) {
    return Response.json({ error: "请输入生图提示词" }, { status: 400 })
  }

  if (!images.length) {
    return Response.json({ error: "图生图需要至少一张参考图" }, { status: 400 })
  }

  const formData = new FormData()
  formData.set("prompt", prompt)
  formData.set("model", model)
  formData.set("response_format", "b64_json")
  appendImageFormValue(formData, "n", input.get("n") || "1")
  appendImageFormValue(formData, "size", input.get("size"))
  appendImageFormValue(formData, "quality", input.get("quality"))
  appendImageFormValue(formData, "output_format", input.get("output_format"))
  appendImageFormValue(formData, "background", input.get("background"))
  appendImageFormValue(formData, "upscale", input.get("upscale"))

  images.forEach((image, index) => {
    formData.append("image", image, image.name || `reference-${index + 1}.png`)
  })

  return forwardCodexImageForm("/v1/images/edits", formData, apiBaseUrl, apiKey)
}
