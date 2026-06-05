export function resolvePromptImageUrl(url: string) {
  const value = url.trim()
  if (!value) return ""
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
