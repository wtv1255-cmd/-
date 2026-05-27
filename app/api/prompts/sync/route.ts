const promptApiBase =
  process.env.NEXT_PUBLIC_PROMPT_API_BASE || "http://127.0.0.1:8080"

export async function POST(request: Request) {
  const input = await request.json().catch(() => ({}))

  try {
    const response = await fetch(`${promptApiBase}/api/prompts/sync`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      cache: "no-store",
    })

    const text = await response.text()
    let payload: unknown = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = { code: 1, msg: text || "同步接口返回异常", data: null }
    }

    return Response.json(payload, { status: response.status })
  } catch {
    return Response.json(
      { code: 1, msg: "同步接口连接失败，请确认本地后端已启动", data: null },
      { status: 502 }
    )
  }
}
