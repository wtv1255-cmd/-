const missingPromptImagePatterns = [
  /raw\.githubusercontent\.com\/EvoLinkAI\/awesome-gpt-image-2-API-and-Prompts\/main\/+output\.jpg$/i,
]

export function isMissingPromptImageUrl(url: string) {
  const value = url.trim()
  return missingPromptImagePatterns.some((pattern) => pattern.test(value))
}

export function resolvePromptImageUrl(url: string) {
  const value = url.trim()
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
