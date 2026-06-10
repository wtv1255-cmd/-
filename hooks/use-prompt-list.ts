"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { fetchAllPrompts, getPromptSource } from "@/lib/api/prompts"
import { getPromptPrimaryImageUrl } from "@/lib/image-proxy"
import {
  ALL_PROMPTS_OPTION,
  type Prompt,
  type PromptListResponse,
  type PromptSource,
  type PromptStats,
  type PromptViewMode,
} from "@/lib/types/prompt"

export const DEFAULT_PROMPT_PAGE_SIZE = 12

type PromptListState = {
  response: PromptListResponse
  isLoading: boolean
  error: Error | null
}

const emptyResponse: PromptListResponse = {
  items: [],
  tags: [],
  categories: [],
  total: 0,
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error("获取提示词失败")
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
}

function sortedUnique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "zh-Hans-CN")
  )
}

function promptQueryCacheKey(query: {
  keyword?: string
  tags?: string[]
  category?: string
}) {
  return JSON.stringify({
    keyword: (query.keyword || "").trim(),
    tags: [...(query.tags || [])].sort(),
    category: query.category || ALL_PROMPTS_OPTION,
  })
}

const promptResponseCache = new Map<string, PromptListResponse>()
const promptResponseRequests = new Map<string, Promise<PromptListResponse>>()

function fetchAllPromptsCached(
  query: { keyword?: string; tags?: string[]; category?: string },
  force = false
) {
  const cacheKey = promptQueryCacheKey(query)
  const currentRequest = promptResponseRequests.get(cacheKey)
  if (currentRequest) return currentRequest

  if (!force && promptResponseCache.has(cacheKey)) {
    return Promise.resolve(
      promptResponseCache.get(cacheKey) as PromptListResponse
    )
  }

  const request = fetchAllPrompts({
    keyword: query.keyword || "",
    tag: query.tags || [],
    category: query.category || ALL_PROMPTS_OPTION,
  })
    .then((response) => {
      promptResponseCache.set(cacheKey, response)
      return response
    })
    .finally(() => {
      promptResponseRequests.delete(cacheKey)
    })

  promptResponseRequests.set(cacheKey, request)
  return request
}

function readCachedPrompts(query: {
  keyword?: string
  tags?: string[]
  category?: string
}) {
  return promptResponseCache.get(promptQueryCacheKey(query))
}

export function usePromptList({
  keyword,
  tags,
  category,
  source,
  page,
  pageSize = DEFAULT_PROMPT_PAGE_SIZE,
  view = "grid",
  enabled = true,
}: {
  keyword: string
  tags: string[]
  category: string
  source: PromptSource
  page: number
  pageSize?: number
  view?: PromptViewMode
  enabled?: boolean
}) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [state, setState] = useState<PromptListState>({
    response: emptyResponse,
    isLoading: enabled,
    error: null,
  })
  const tagsKey = useMemo(() => tags.join("\u0000"), [tags])
  const cacheQuery = useMemo(
    () => ({ keyword, tags, category }),
    [category, keyword, tagsKey]
  )

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), [])

  useEffect(() => {
    if (!enabled) return

    let alive = true
    const cached = readCachedPrompts(cacheQuery)
    setState({
      response: cached || emptyResponse,
      isLoading: !cached,
      error: null,
    })

    fetchAllPromptsCached(cacheQuery, refreshKey > 0)
      .then((response) => {
        if (!alive) return
        setState({ response, isLoading: false, error: null })
      })
      .catch((error) => {
        if (!alive) return
        if (isAbortError(error)) return
        setState((current) => ({
          response: current.response.items.length
            ? current.response
            : emptyResponse,
          isLoading: false,
          error: toError(error),
        }))
      })

    return () => {
      alive = false
    }
  }, [cacheQuery, category, enabled, keyword, refreshKey, tagsKey])

  const sourceItems = useMemo(() => {
    if (source === "all") return state.response.items
    return state.response.items.filter(
      (item) => getPromptSource(item) === source
    )
  }, [source, state.response.items])

  const filteredItems = useMemo(() => {
    if (view === "review") return []
    return sourceItems
  }, [sourceItems, view])

  const total = filteredItems.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const pageItems = filteredItems.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  )

  return {
    items: pageItems,
    allItems: filteredItems,
    serverItems: state.response.items,
    tags: [ALL_PROMPTS_OPTION, ...state.response.tags],
    categories: [ALL_PROMPTS_OPTION, ...state.response.categories],
    total,
    serverTotal: state.response.total,
    totalPages,
    safePage,
    isLoading: state.isLoading,
    error: state.error,
    refresh,
  }
}

export function usePromptStats(enabled = true) {
  const [refreshKey, setRefreshKey] = useState(0)
  const cached = readCachedPrompts({
    keyword: "",
    tags: [],
    category: ALL_PROMPTS_OPTION,
  })
  const [items, setItems] = useState<Prompt[]>(cached?.items || [])
  const [responseTotal, setResponseTotal] = useState(cached?.total || 0)
  const [isLoading, setIsLoading] = useState(enabled && !cached)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), [])

  useEffect(() => {
    if (!enabled) return

    let alive = true
    const cached = readCachedPrompts({
      keyword: "",
      tags: [],
      category: ALL_PROMPTS_OPTION,
    })
    if (cached) {
      setItems(cached.items)
      setResponseTotal(cached.total)
    }
    setIsLoading(!cached)
    setError(null)

    fetchAllPromptsCached(
      { keyword: "", tags: [], category: ALL_PROMPTS_OPTION },
      refreshKey > 0
    )
      .then((response) => {
        if (!alive) return
        setItems(response.items)
        setResponseTotal(response.total)
        setIsLoading(false)
      })
      .catch((error) => {
        if (!alive) return
        if (isAbortError(error)) return
        if (!items.length) {
          setItems([])
          setResponseTotal(0)
        }
        setError(toError(error))
        setIsLoading(false)
      })

    return () => {
      alive = false
    }
  }, [enabled, refreshKey])

  const stats = useMemo<PromptStats>(() => {
    const categoryCounts: Record<string, number> = {}
    const tagCounts: Record<string, number> = {}
    const sourceCounts = { local: 0, remote: 0 }

    for (const item of items) {
      categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1
      sourceCounts[getPromptSource(item)] += 1

      for (const tag of item.tags || []) {
        if (!tag) continue
        tagCounts[tag] = (tagCounts[tag] || 0) + 1
      }
    }

    return {
      total: responseTotal || items.length,
      imageCount: items.filter((item) =>
        getPromptPrimaryImageUrl(item.coverUrl, item.preview)
      ).length,
      tagCount: Object.keys(tagCounts).length,
      categories: sortedUnique(Object.keys(categoryCounts)),
      tags: sortedUnique(Object.keys(tagCounts)),
      categoryCounts,
      tagCounts,
      sourceCounts,
      items,
    }
  }, [items, responseTotal])

  return {
    ...stats,
    isLoading,
    error,
    refresh,
  }
}
