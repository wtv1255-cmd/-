const missingPromptImagePatterns = [
  /raw\.githubusercontent\.com\/EvoLinkAI\/awesome-gpt-image-2-API-and-Prompts\/main\/+output\.jpg$/i,
]

const yanaiBananaPromptRawBase =
  "https://raw.githubusercontent.com/huaiyuechusan/YanAI/main/web/public/banana-prompt-quicker"

export function isMissingPromptImageUrl(url: string) {
  const value = url.trim()
  return missingPromptImagePatterns.some((pattern) => pattern.test(value))
}

export function extractPromptImageUrlFromPreview(preview: string) {
  const value = preview.trim()
  if (!value) return ""

  const htmlImageMatch = value.match(/<img[^>]*\ssrc=["']([^"']+)["']/i)
  const markdownImageMatch = value.match(
    /!\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/
  )
  const bareImageMatch = value.match(
    /https?:\/\/[^\s)'"<>]+\.(?:png|jpe?g|webp|gif|svg)(?:\?[^\s)'"<>]+)?/i
  )
  const image =
    htmlImageMatch?.[1] || markdownImageMatch?.[1] || bareImageMatch?.[0] || ""

  return image.trim().replace(/^<|>$/g, "")
}

export function getPromptPrimaryImageUrl(coverUrl: string, preview: string) {
  return normalizePromptImageUrl(
    coverUrl || extractPromptImageUrlFromPreview(preview)
  )
}

function normalizePromptImageUrl(url: string) {
  const value = url.trim()
  if (!value) return ""
  if (value.startsWith("/banana-prompt-quicker/")) {
    return `${yanaiBananaPromptRawBase}/${value
      .replace(/^\/banana-prompt-quicker\//, "")
      .replace(/^\/+/, "")}`
  }
  return value
}

export function resolvePromptImageUrl(url: string) {
  const value = normalizePromptImageUrl(url)
  if (!value) return ""
  if (isMissingPromptImageUrl(value)) return ""
  if (value.startsWith("data:") || value.startsWith("blob:")) return value
  if (value.startsWith("/")) return value

  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return value
    }
    return `/api/image-proxy?url=${encodeURIComponent(value)}`
  } catch {
    return value
  }
}
