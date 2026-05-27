import {
  ALL_PROMPTS_OPTION,
  type Prompt,
  type PromptListResponse,
  type PromptQuery,
  type PromptSource,
} from "@/lib/types/prompt"

type WrappedApiResponse<T> = {
  code: number
  data: T
  msg: string
}

const PROMPT_API_PATH = "/api/prompts"
export const PROMPT_BATCH_PAGE_SIZE = 500

const CATEGORY_LABELS: Record<string, string> = {
  system: "系统",
  "gpt-image-2-prompts": "GPT Image 2 案例",
  "awesome-gpt-image": "中文图像提示词",
  "awesome-gpt4o-image-prompts": "GPT-4o 图像提示词",
  "youmind-gpt-image-2": "YouMind 图像提示词",
  "youmind-nano-banana-pro": "Nano Banana Pro 提示词",
  "davidwu-gpt-image2-prompts": "GPT Image2 提示词",
}

const TAG_LABELS: Record<string, string> = {
  portrait: "人像",
  photography: "摄影",
  poster: "海报",
  illustration: "插画",
  "character design": "角色设计",
  ui: "界面",
  "social media mockup": "社交媒体样机",
  comparison: "对比图",
  "community examples": "社区案例",
  "e-commerce": "电商",
  "ad creative": "广告创意",
  "ad-creative": "广告创意",
  game: "游戏",
  entertainment: "娱乐",
  ux: "用户体验",
  gpt4o: "GPT-4o",
  "gpt-image-2": "GPT Image 2",
  "youtube 缩略图": "YouTube 缩略图",
  "nano-banana-pro": "Nano Banana Pro",
  advertising: "广告",
  "3d": "3D",
  "3d_cute": "3D 萌系",
  scene: "场景",
  "3d_render": "3D 渲染",
  creative: "创意",
  product: "产品",
  anime: "动漫",
  text_render: "文字渲染",
  card: "卡牌",
  food: "食物",
  logo: "Logo",
  animeai: "动漫 AI",
  ui与界面: "界面设计",
  freestylefly: "自由风格",
  "awesome-gpt-image-2": "GPT Image 2 精选",
  architecture: "建筑",
  infographic: "信息图",
  character: "角色",
  other: "其他",
  ancient: "古风",
  document: "文档",
  "open-design": "开放设计",
  anime_illustration: "动漫插画",
  product_poster: "产品海报",
  game_ui: "游戏界面",
  illustration_map: "插画地图",
  social_poster: "社交海报",
  animation: "动画",
  brand: "品牌",
  wuxia_history: "武侠历史",
  dance_action: "舞蹈动作",
  short_video: "短视频",
  cinematic: "电影叙事",
  game_scifi: "游戏科幻",
  vfx_fantasy: "特效奇幻",
  anime_adaptation: "动漫改编",
  social_dance: "社交舞蹈",
  "character-portrait": "角色肖像",
  original: "原创",
}

function compactPromptQuery(query: PromptQuery) {
  const entries = Object.entries(query).filter(([, value]) => {
    if (value === undefined || value === "") return false
    if (Array.isArray(value)) return value.length > 0
    return true
  })

  return Object.fromEntries(entries) as PromptQuery
}

function serializePromptQuery(query: PromptQuery) {
  const params = new URLSearchParams()
  const compactQuery = compactPromptQuery(query)

  for (const [key, value] of Object.entries(compactQuery)) {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)))
      continue
    }

    params.set(key, String(value))
  }

  return params.toString()
}

function normalizePromptListResponse(value: unknown): PromptListResponse {
  if (!value || typeof value !== "object") {
    throw new Error("接口返回异常")
  }

  const payload = value as Partial<PromptListResponse>
  if (!Array.isArray(payload.items)) {
    throw new Error("提示词数据格式异常")
  }

  return {
    items: payload.items,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    categories: Array.isArray(payload.categories) ? payload.categories : [],
    total:
      typeof payload.total === "number" ? payload.total : payload.items.length,
  }
}

export async function fetchPrompts(
  {
    keyword = "",
    tag = [],
    category = ALL_PROMPTS_OPTION,
    page,
    pageSize,
  }: PromptQuery = {},
  signal?: AbortSignal
) {
  const query = serializePromptQuery({
    ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
    ...(tag.length ? { tag } : {}),
    ...(category && category !== ALL_PROMPTS_OPTION ? { category } : {}),
    ...(page ? { page } : {}),
    ...(pageSize ? { pageSize } : {}),
  })
  const url = query ? `${PROMPT_API_PATH}?${query}` : PROMPT_API_PATH

  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error
    }
    throw new Error("接口连接失败，请确认后端服务已启动")
  }

  let result: unknown
  try {
    result = await response.json()
  } catch {
    throw new Error(
      response.status === 404
        ? "接口不存在，请确认代理和后端服务"
        : "接口返回异常"
    )
  }

  if (!response.ok) {
    const message =
      typeof result === "object" && result && "msg" in result
        ? String((result as { msg?: string }).msg)
        : "请求失败"
    throw new Error(message)
  }

  if (typeof result === "object" && result && "code" in result) {
    const wrapped = result as WrappedApiResponse<PromptListResponse>
    if (wrapped.code !== 0) {
      throw new Error(wrapped.msg || "请求失败")
    }
    return normalizePromptListResponse(wrapped.data)
  }

  return normalizePromptListResponse(result)
}

export async function fetchAllPrompts(
  query: Omit<PromptQuery, "page" | "pageSize"> = {},
  signal?: AbortSignal
) {
  const firstPage = await fetchPrompts(
    { ...query, page: 1, pageSize: PROMPT_BATCH_PAGE_SIZE },
    signal
  )
  const items = [...firstPage.items]
  const totalPages = Math.max(
    1,
    Math.ceil(firstPage.total / PROMPT_BATCH_PAGE_SIZE)
  )

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await fetchPrompts(
      { ...query, page, pageSize: PROMPT_BATCH_PAGE_SIZE },
      signal
    )
    items.push(...nextPage.items)
  }

  return {
    ...firstPage,
    items,
  }
}

export async function syncPromptSources(category?: string) {
  const response = await fetch("/api/prompts/sync", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      category && category !== ALL_PROMPTS_OPTION ? { category } : {}
    ),
  })

  let result: unknown
  try {
    result = await response.json()
  } catch {
    throw new Error("同步接口返回异常")
  }

  const message =
    typeof result === "object" && result && "msg" in result
      ? String((result as { msg?: string }).msg)
      : "同步失败"
  if (!response.ok) {
    throw new Error(message)
  }

  if (typeof result === "object" && result && "code" in result) {
    const wrapped = result as WrappedApiResponse<{
      categories?: string[]
      count?: number
    }>
    if (wrapped.code !== 0) {
      throw new Error(wrapped.msg || "同步失败")
    }
    return {
      categories: Array.isArray(wrapped.data?.categories)
        ? wrapped.data.categories
        : [],
      count: typeof wrapped.data?.count === "number" ? wrapped.data.count : 0,
    }
  }

  return { categories: [], count: 0 }
}

export function getPromptSource(prompt: Prompt): Exclude<PromptSource, "all"> {
  return prompt.githubUrl ? "remote" : "local"
}

export function getPromptSourceLabel(prompt: Prompt) {
  return getPromptSource(prompt) === "remote" ? "远程" : "本地"
}

export function getCategoryLabel(category: string) {
  return CATEGORY_LABELS[category] || category || "未分类"
}

export function getTagLabel(tag: string) {
  if (!tag) return "未命名标签"
  if (TAG_LABELS[tag]) return TAG_LABELS[tag]
  if (tag.startsWith("@")) return `作者 ${tag.slice(1)}`
  return tag.replaceAll("_", " ").replaceAll("-", " ")
}

export function formatPromptDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date)
}

export function getPromptSummary(prompt: Prompt, maxLength = 120) {
  const value = (prompt.prompt || prompt.preview || "")
    .replace(/\s+/g, " ")
    .trim()
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}...`
}
