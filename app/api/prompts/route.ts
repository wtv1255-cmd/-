const promptApiBase =
  process.env.NEXT_PUBLIC_PROMPT_API_BASE || "http://127.0.0.1:8080"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const sourceUrl = new URL(request.url)
  const targetUrl = new URL(`${promptApiBase}/api/prompts`)
  targetUrl.search = sourceUrl.search

  try {
    const response = await fetch(targetUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
    const text = await response.text()
    const contentType =
      response.headers.get("content-type") || "application/json"

    return new Response(text, {
      status: response.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return Response.json(
      {
        code: 1,
        msg: "提示词接口连接失败，请确认本地后端已启动",
        data: null,
      },
      { status: 502 }
    )
  }
}
