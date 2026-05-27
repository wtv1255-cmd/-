export const ALL_PROMPTS_OPTION = "全部"

export type Prompt = {
  id: string
  title: string
  coverUrl: string
  prompt: string
  tags: string[]
  category: string
  githubUrl: string
  preview: string
  createdAt: string
  updatedAt: string
}

export type PromptListResponse = {
  items: Prompt[]
  tags: string[]
  categories: string[]
  total: number
}

export type PromptQuery = {
  keyword?: string
  tag?: string[]
  category?: string
  page?: number
  pageSize?: number
}

export type PromptSource = "all" | "local" | "remote"

export type PromptViewMode = "grid" | "compact" | "review"

export type PromptStats = {
  total: number
  imageCount: number
  tagCount: number
  categories: string[]
  tags: string[]
  categoryCounts: Record<string, number>
  tagCounts: Record<string, number>
  sourceCounts: Record<Exclude<PromptSource, "all">, number>
  items: Prompt[]
}
