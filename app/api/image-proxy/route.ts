const promptApiBase =
  process.env.NEXT_PUBLIC_PROMPT_API_BASE || "http://127.0.0.1:8080"

export const runtime = "nodejs"
export const maxDuration = 60

const allowedImageHosts = new Set([
  "raw.githubusercontent.com",
  "github.com",
  "cms-assets.youmind.com",
  "cdn.imgedify.com",
  "pbs.twimg.com",
])

const imageCacheControl = "public, max-age=2592000, immutable"

function isAllowedImageUrl(value: string) {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false
    }
    return allowedImageHosts.has(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

async function fetchDirectImage(source: string) {
  return fetch(source, {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
      "User-Agent": "prompt-center-image-proxy",
    },
    cache: "no-store",
  })
}

async function fetchBackendImage(source: string, requestHeaders: Headers) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)
  const headers = new Headers({ Accept: "image/*,*/*;q=0.8" })
  const ifNoneMatch = requestHeaders.get("if-none-match")
  const ifModifiedSince = requestHeaders.get("if-modified-since")
  if (ifNoneMatch) headers.set("If-None-Match", ifNoneMatch)
  if (ifModifiedSince) headers.set("If-Modified-Since", ifModifiedSince)

  try {
    return await fetch(
      `${promptApiBase}/api/image-proxy?url=${encodeURIComponent(source)}`,
      {
        headers,
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      }
    )
  } finally {
    clearTimeout(timeout)
  }
}

function toImageResponse(response: Response) {
  const headers = new Headers()
  const cacheControl = response.headers.get("cache-control") || imageCacheControl
  headers.set("Cache-Control", cacheControl)

  for (const name of [
    "etag",
    "last-modified",
    "content-length",
    "accept-ranges",
    "content-range",
    "x-image-cache",
  ]) {
    const value = response.headers.get(name)
    if (value) headers.set(name, value)
  }

  if (response.status === 304) {
    return new Response(null, { status: 304, headers })
  }

  if (!response.ok) {
    return new Response("Image upstream failed", { status: response.status })
  }

  const contentType = response.headers.get("content-type") || ""
  if (!contentType.toLowerCase().startsWith("image/") || !response.body) {
    return new Response("Image upstream failed", { status: 502 })
  }

  headers.set("Content-Type", contentType)

  return new Response(response.body, { status: response.status, headers })
}

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams.get("url") || ""
  if (!isAllowedImageUrl(source)) {
    return new Response("Invalid image url", { status: 400 })
  }

  try {
    const upstream = await fetchBackendImage(source, request.headers)

    if (upstream.ok || upstream.status === 304) return toImageResponse(upstream)
  } catch {
    // Fall back to a direct fetch below. This keeps thumbnails working when an
    // older local backend is still occupying the backend port.
  }

  try {
    return toImageResponse(await fetchDirectImage(source))
  } catch {
    return new Response("Image proxy failed", { status: 502 })
  }
}
