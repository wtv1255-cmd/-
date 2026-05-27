"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { fetchAllPrompts, getPromptSource } from "@/lib/api/prompts"
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
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
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

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), [])

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    setState((current) => ({ ...current, isLoading: true, error: null }))

    fetchAllPrompts(
      {
        keyword,
        tag: tags,
        category,
      },
      controller.signal,
    )
      .then((response) => {
        setState({ response, isLoading: false, error: null })
      })
      .catch((error) => {
        if (isAbortError(error)) return
        setState({ response: emptyResponse, isLoading: false, error: toError(error) })
      })

    return () => controller.abort()
  }, [category, enabled, keyword, refreshKey, tags, tagsKey])

  const sourceItems = useMemo(() => {
    if (source === "all") return state.response.items
    return state.response.items.filter((item) => getPromptSource(item) === source)
  }, [source, state.response.items])

  const filteredItems = useMemo(() => {
    if (view === "review") return []
    return sourceItems
  }, [sourceItems, view])

  const total = filteredItems.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const pageItems = filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize)

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
  const [items, setItems] = useState<Prompt[]>([])
  const [responseTotal, setResponseTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), [])

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    setIsLoading(true)
    setError(null)

    fetchAllPrompts({}, controller.signal)
      .then((response) => {
        setItems(response.items)
        setResponseTotal(response.total)
        setIsLoading(false)
      })
      .catch((error) => {
        if (isAbortError(error)) return
        setItems([])
        setResponseTotal(0)
        setError(toError(error))
        setIsLoading(false)
      })

    return () => controller.abort()
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
      imageCount: items.filter((item) => item.coverUrl || item.preview).length,
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
