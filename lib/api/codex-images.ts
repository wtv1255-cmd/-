import {
  type CodexImageResponse,
  type CodexImageResult,
  type ImageReference,
  type ImageSettings,
  type ReversePromptMode,
} from "@/lib/types/image"

type RequestImagesInput = {
  prompt: string
  style: string
  negativePrompt?: string
  settings: ImageSettings
  references?: ImageReference[]
  signal?: AbortSignal
}

type ReversePromptInput = {
  image: File
  settings: ImageSettings
  style: string
  negativePrompt: string
  mode: ReversePromptMode
  model: string
  signal?: AbortSignal
}

type RewritePromptInput = {
  prompt: string
  style: string
  negativePrompt: string
  settings: ImageSettings
  model: string
  signal?: AbortSignal
}

type OptimizePromptInput = RewritePromptInput

function composePrompt(prompt: string, style: string, negativePrompt = "") {
  const cleanPrompt = prompt.trim()
  const cleanStyle = style.trim()
  const cleanNegativePrompt = negativePrompt.trim()
  return [
    cleanPrompt,
    cleanStyle ? `风格要求：${cleanStyle}` : "",
    cleanNegativePrompt ? `负面要求：${cleanNegativePrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function readApiError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    if ("error" in payload) {
      const error = (payload as { error?: unknown }).error
      if (typeof error === "string") return error
      if (error && typeof error === "object" && "message" in error)
        return String((error as { message?: unknown }).message || fallback)
    }
    if ("message" in payload)
      return String((payload as { message?: unknown }).message || fallback)
    if ("msg" in payload)
      return String((payload as { msg?: unknown }).msg || fallback)
  }
  return fallback
}

async function parseImageResponse(response: Response) {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error(
      response.ok ? "接口返回异常" : `请求失败：${response.status}`
    )
  }

  if (!response.ok) {
    throw new Error(readApiError(payload, `请求失败：${response.status}`))
  }

  const images = (payload as Partial<CodexImageResponse>).images
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error("接口没有返回图片")
  }

  return images as CodexImageResult[]
}

function buildPayload({
  prompt,
  style,
  negativePrompt,
  settings,
}: RequestImagesInput) {
  return {
    prompt: composePrompt(prompt, style, negativePrompt),
    model: settings.model,
    size: settings.size,
    quality: settings.quality,
    output_format: settings.outputFormat,
    background: settings.background,
    upscale: settings.upscale,
    n: settings.count,
    apiBaseUrl: settings.apiBaseUrl,
    apiKey: settings.apiKey,
  }
}

function clampImageCount(value: number) {
  return Math.max(1, Math.min(10, Math.floor(Math.abs(Number(value)) || 1)))
}

async function collectRepeatedImages(
  count: number,
  requestOne: () => Promise<CodexImageResult[]>
) {
  const jobs = Array.from({ length: count }, () => requestOne())
  const settled = await Promise.allSettled(jobs)
  const images = settled.flatMap((item) =>
    item.status === "fulfilled" ? item.value : []
  )

  if (images.length) return images.slice(0, count)

  const firstError = settled.find(
    (item): item is PromiseRejectedResult => item.status === "rejected"
  )
  throw firstError?.reason instanceof Error
    ? firstError.reason
    : new Error("生成失败")
}

export async function requestImageGeneration(input: RequestImagesInput) {
  const count = clampImageCount(input.settings.count)

  return collectRepeatedImages(count, async () => {
    const response = await fetch("/api/codex/images/generations", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        buildPayload({
          ...input,
          settings: { ...input.settings, count: 1 },
        })
      ),
      signal: input.signal,
    })

    return parseImageResponse(response)
  })
}

export async function requestImageEdit(input: RequestImagesInput) {
  const count = clampImageCount(input.settings.count)

  return collectRepeatedImages(count, async () => {
    const formData = new FormData()
    const payload = buildPayload({
      ...input,
      settings: { ...input.settings, count: 1 },
    })

    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null)
        formData.set(key, String(value))
    })
    ;(input.references || []).forEach((reference) => {
      formData.append(
        "image",
        reference.file,
        reference.name || reference.file.name || "reference.png"
      )
    })

    const response = await fetch("/api/codex/images/edits", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData,
      signal: input.signal,
    })

    return parseImageResponse(response)
  })
}

export async function requestPromptReverse(input: ReversePromptInput) {
  const imageDataUrl = await fileToDataUrl(input.image)
  const response = await fetch("/api/codex/chat/completions", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model.trim() || "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildReverseInstruction(
                input.mode,
                input.style,
                input.negativePrompt
              ),
            },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      temperature: 0.2,
      apiBaseUrl: input.settings.apiBaseUrl,
      apiKey: input.settings.apiKey,
    }),
    signal: input.signal,
  })

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error(
      response.ok ? "接口返回异常" : `请求失败：${response.status}`
    )
  }

  if (!response.ok) {
    throw new Error(readApiError(payload, `请求失败：${response.status}`))
  }

  const text =
    typeof (payload as { text?: unknown }).text === "string"
      ? (payload as { text: string }).text.trim()
      : ""
  if (!text) throw new Error("接口没有返回提示词")
  return text
}

export async function requestPromptSafetyRewrite(input: RewritePromptInput) {
  const response = await fetch("/api/codex/chat/completions", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model.trim() || "gpt-5.5",
      messages: [
        {
          role: "user",
          content: buildSafetyRewriteInstruction(
            input.prompt,
            input.style,
            input.negativePrompt
          ),
        },
      ],
      temperature: 0.15,
      apiBaseUrl: input.settings.apiBaseUrl,
      apiKey: input.settings.apiKey,
    }),
    signal: input.signal,
  })

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error(
      response.ok ? "接口返回异常" : `请求失败：${response.status}`
    )
  }

  if (!response.ok) {
    throw new Error(readApiError(payload, `请求失败：${response.status}`))
  }

  const text =
    typeof (payload as { text?: unknown }).text === "string"
      ? (payload as { text: string }).text.trim()
      : ""
  if (!text) throw new Error("接口没有返回改写提示词")
  return text
}

export async function requestPromptOptimization(input: OptimizePromptInput) {
  const response = await fetch("/api/codex/chat/completions", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model.trim() || "gpt-5.5",
      messages: [
        {
          role: "user",
          content: buildOptimizationInstruction(
            input.prompt,
            input.style,
            input.negativePrompt
          ),
        },
      ],
      temperature: 0.2,
      apiBaseUrl: input.settings.apiBaseUrl,
      apiKey: input.settings.apiKey,
    }),
    signal: input.signal,
  })

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error(
      response.ok ? "接口返回异常" : `请求失败：${response.status}`
    )
  }

  if (!response.ok) {
    throw new Error(readApiError(payload, `请求失败：${response.status}`))
  }

  const text =
    typeof (payload as { text?: unknown }).text === "string"
      ? (payload as { text: string }).text.trim()
      : ""
  if (!text) throw new Error("接口没有返回优化提示词")
  return stripPromptWrapper(text)
}

function buildReverseInstruction(
  mode: ReversePromptMode,
  style: string,
  negativePrompt: string
) {
  const cleanStyle = style.trim()
  const cleanNegative = negativePrompt.trim()
  const modeText =
    mode === "restyle"
      ? "在保留画面主体、构图、姿态、元素关系的基础上，把画面改写成目标风格。"
      : mode === "wash"
        ? "在不照搬原图版权表达的前提下，提取主体、构图、光线、材质、镜头和情绪，重写成可用于重新生成相似质感但不完全相同图片的提示词。"
        : "精准反推出这张图的图像生成提示词，尽量覆盖主体、构图、镜头、光线、材质、背景、色彩、细节和质量要求。"

  return [
    "你是专业图像提示词工程师。请只输出一段中文生图提示词，不要解释，不要 Markdown。",
    modeText,
    cleanStyle ? `目标风格：${cleanStyle}` : "",
    "输出要适合 GPT Image 2 使用，语言具体、可执行，保留真实视觉细节。",
    cleanNegative ? `最后追加负面要求：${cleanNegative}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function buildSafetyRewriteInstruction(
  prompt: string,
  style: string,
  negativePrompt: string
) {
  return [
    "你是图像生成提示词安全改写助手。请只输出改写后的中文生图提示词，不要解释，不要 Markdown。",
    "目标：尽量保留原画面意图、主体、构图、光线、风格和质量要求，同时规避容易触发安全策略的敏感、露骨、未成年人、暴力、仇恨、隐私、名人冒充和违法表达。",
    "要求：把可能过界的表述改成成年人、合规、非露骨、非攻击、非血腥、非违法的描述；不要加入新的风险元素；不要保留敏感词本身。",
    style.trim() ? `原风格要求：${style.trim()}` : "",
    negativePrompt.trim()
      ? `请保留并合理追加这些负面要求：${negativePrompt.trim()}`
      : "",
    `原提示词：\n${prompt.trim()}`,
  ]
    .filter(Boolean)
    .join("\n\n")
}

function buildOptimizationInstruction(
  prompt: string,
  style: string,
  negativePrompt: string
) {
  return [
    "你是 Prompt Optimization Specialist / 提示词优化专家。请基于原始提示词做结构化分析、诊断和重构，但最终只输出优化后的中文生图提示词本体，不要输出分析、标题、建议、Markdown、<START> 或 <END>。",
    "优化目标：让提示词角色清晰、目标明确、约束可执行、视觉元素稳定、适合 GPT Image 2 生成图片。",
    "优化动作：修复结构混乱、重复、缺少镜头/构图/光线/材质/背景/质量要求等问题；模拟不同生成场景下的稳定性，保留最稳妥的一版；不要编造用户没有给出的具体事实。",
    style.trim() ? `用户指定风格：${style.trim()}` : "",
    negativePrompt.trim()
      ? `请把这些负面要求自然附加到结尾：${negativePrompt.trim()}`
      : "",
    `原始提示词：\n${prompt.trim()}`,
  ]
    .filter(Boolean)
    .join("\n\n")
}

function stripPromptWrapper(value: string) {
  return value
    .replace(/^```[\w-]*\s*/i, "")
    .replace(/```$/i, "")
    .replace(/^<START>\s*/i, "")
    .replace(/\s*<END>$/i, "")
    .trim()
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("读取参考图失败"))
    reader.readAsDataURL(file)
  })
}
