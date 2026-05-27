"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  Check,
  Copy,
  Database,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react"

import { PromptCard } from "@/components/prompt-card"
import { PromptDetailDialog } from "@/components/prompt-detail-dialog"
import { PromptSelectDialog } from "@/components/prompt-select-dialog"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  DEFAULT_PROMPT_PAGE_SIZE,
  usePromptList,
  usePromptStats,
} from "@/hooks/use-prompt-list"
import {
  getCategoryLabel,
  getTagLabel,
  syncPromptSources,
} from "@/lib/api/prompts"
import {
  IMAGE_SOURCE_PROMPT_STORAGE_KEY,
  type SourcePromptSnapshot,
} from "@/lib/types/image"
import { cn } from "@/lib/utils"
import {
  ALL_PROMPTS_OPTION,
  type Prompt,
  type PromptSource,
  type PromptViewMode,
} from "@/lib/types/prompt"

const sourceOptions: Array<[PromptSource, string]> = [
  ["all", "全部"],
  ["local", "本地"],
  ["remote", "远程"],
]

const viewOptions: Array<[PromptViewMode, string]> = [
  ["grid", "卡片"],
  ["compact", "紧凑"],
  ["review", "待整理"],
]

export default function Page() {
  const router = useRouter()
  const [keyword, setKeyword] = useState("")
  const [category, setCategory] = useState(ALL_PROMPTS_OPTION)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [source, setSource] = useState<PromptSource>("all")
  const [view, setView] = useState<PromptViewMode>("grid")
  const [page, setPage] = useState(1)
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
  const [selectOpen, setSelectOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [toast, setToast] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)

  const stats = usePromptStats()
  const promptList = usePromptList({
    keyword,
    tags: selectedTags,
    category,
    source,
    view,
    page,
    pageSize: DEFAULT_PROMPT_PAGE_SIZE,
  })

  const categories = useMemo(() => {
    const values = stats.categories.length
      ? stats.categories
      : promptList.categories.filter((item) => item !== ALL_PROMPTS_OPTION)
    return [ALL_PROMPTS_OPTION, ...values]
  }, [promptList.categories, stats.categories])

  const tags = useMemo(() => {
    const values =
      promptList.tags.length > 1 ? promptList.tags.slice(1) : stats.tags
    return [ALL_PROMPTS_OPTION, ...values]
  }, [promptList.tags, stats.tags])

  const activeCategoryLabel =
    category === ALL_PROMPTS_OPTION ? "全部分类" : getCategoryLabel(category)
  const activeTagLabel = selectedTags.length
    ? selectedTags.map(getTagLabel).join(" / ")
    : "全部标签"
  useEffect(() => {
    if (page > promptList.totalPages) {
      setPage(promptList.totalPages)
    }
  }, [page, promptList.totalPages])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(""), 2300)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        searchRef.current?.focus()
      }
      if (event.key === "Escape") {
        setSelectedPrompt(null)
        setSelectOpen(false)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const resetPage = () => setPage(1)

  const showToast = (message: string) => setToast(message)

  const copyPrompt = async (prompt: Prompt) => {
    try {
      await navigator.clipboard.writeText(prompt.prompt)
      showToast(`已复制「${prompt.title}」`)
    } catch {
      showToast("复制失败，可在详情中手动复制")
    }
  }

  const usePromptForImage = (prompt: Prompt) => {
    const snapshot: SourcePromptSnapshot = {
      id: prompt.id,
      title: prompt.title,
      prompt: prompt.prompt,
      tags: prompt.tags,
      category: prompt.category,
      coverUrl: prompt.coverUrl,
    }
    window.sessionStorage.setItem(
      IMAGE_SOURCE_PROMPT_STORAGE_KEY,
      JSON.stringify(snapshot)
    )
    setSelectedPrompt(null)
    setSelectOpen(false)
    showToast(`已发送「${prompt.title}」到图片工作台`)
    router.push(`/image?promptId=${encodeURIComponent(prompt.id)}`)
  }

  const toggleTag = (tag: string) => {
    resetPage()
    if (tag === ALL_PROMPTS_OPTION) {
      setSelectedTags([])
      return
    }
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag]
    )
  }

  const clearFilters = () => {
    setKeyword("")
    setCategory(ALL_PROMPTS_OPTION)
    setSelectedTags([])
    setSource("all")
    setView("grid")
    setPage(1)
  }

  const syncPrompts = async () => {
    if (isSyncing) return

    setIsSyncing(true)
    try {
      const syncCategory =
        category === ALL_PROMPTS_OPTION ? undefined : category
      const result = await syncPromptSources(syncCategory)
      stats.refresh()
      promptList.refresh()
      showToast(
        result.count
          ? `同步完成：${result.count} 个远程源`
          : "当前分类没有可同步的远程源"
      )
    } catch (error) {
      showToast(error instanceof Error ? error.message : "同步失败")
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <main className="min-h-svh bg-muted/40 text-foreground">
      <header className="sticky top-0 z-20 flex min-h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur">
        <div className="flex w-52 shrink-0 items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg border bg-background">
            <Database className="size-4" />
          </div>
          <span className="text-sm font-semibold">提示词中心</span>
        </div>

        <label className="relative max-w-2xl flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value)
              resetPage()
            }}
            className="h-9 w-full rounded-lg border bg-muted px-9 text-sm transition outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
            placeholder="搜索提示词、标签、变量"
          />
          <span className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            Ctrl K
          </span>
        </label>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="outline" onClick={() => setSelectOpen(true)}>
            选择提示词
          </Button>
          <Button variant="outline" onClick={() => router.push("/image")}>
            <ImagePlus className="size-4" />
            图片工作台
          </Button>
          <Button onClick={() => showToast("新建提示词暂未接入")}>
            <Plus className="size-4" />
            新建提示词
          </Button>
        </div>
      </header>

      <div className="grid min-h-[calc(100svh-3.5rem)] grid-cols-[232px_minmax(0,1fr)] max-xl:grid-cols-[220px_minmax(0,1fr)] max-lg:grid-cols-1">
        <aside className="overflow-auto border-r bg-background p-3 max-lg:border-r-0 max-lg:border-b">
          <SectionTitle>分类</SectionTitle>
          <nav className="grid gap-1">
            {categories.map((item) => {
              const active = category === item
              const count =
                item === ALL_PROMPTS_OPTION
                  ? stats.total
                  : stats.categoryCounts[item] || 0
              return (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    "flex min-h-9 items-center justify-between gap-3 rounded-lg px-3 text-left text-sm",
                    active
                      ? "bg-muted font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  onClick={() => {
                    setCategory(item)
                    resetPage()
                  }}
                >
                  <span className="min-w-0 truncate">
                    {item === ALL_PROMPTS_OPTION
                      ? "全部提示词"
                      : getCategoryLabel(item)}
                  </span>
                  <span className="font-mono text-xs">
                    {stats.isLoading && item === ALL_PROMPTS_OPTION
                      ? "..."
                      : count}
                  </span>
                </button>
              )
            })}
          </nav>

          <div className="mt-6">
            <SectionTitle>来源</SectionTitle>
            <div className="rounded-lg border bg-background p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">GitHub 同步源</span>
                <span className="text-emerald-600">已入库</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>按 GitHub URL 派生</span>
                <span>{stats.sourceCounts.remote} 条</span>
              </div>
              <Button
                className="mt-3 w-full"
                size="sm"
                variant="outline"
                disabled={isSyncing}
                onClick={() => void syncPrompts()}
              >
                {isSyncing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                {isSyncing ? "同步中" : "同步"}
              </Button>
            </div>
          </div>
        </aside>

        <section className="min-w-0 overflow-auto p-6 max-lg:p-4">
          <div className="mb-5 flex items-end justify-between gap-4 max-md:block">
            <div>
              <h1 className="text-3xl font-semibold tracking-normal">提示词</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                管理、搜索、筛选、查看和复制提示词。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 max-md:mt-4">
              <Metric
                label="总数"
                value={stats.isLoading ? "..." : String(stats.total)}
              />
              <Metric
                label="图片"
                value={stats.isLoading ? "..." : String(stats.imageCount)}
              />
              <Metric
                label="标签"
                value={stats.isLoading ? "..." : String(stats.tagCount)}
              />
            </div>
          </div>

          <div className="mb-4 rounded-lg border bg-background p-3">
            <div className="mb-3 flex items-center justify-between gap-3 max-md:block">
              <Segmented
                options={viewOptions}
                value={view}
                onChange={(nextView) => {
                  setView(nextView)
                  resetPage()
                  showToast(
                    `已切换到${viewOptions.find(([id]) => id === nextView)?.[1]}`
                  )
                }}
              />
              <div className="max-md:mt-3">
                <Segmented
                  options={sourceOptions}
                  value={source}
                  onChange={(nextSource) => {
                    setSource(nextSource)
                    resetPage()
                  }}
                />
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {tags.map((tag) => {
                const active =
                  tag === ALL_PROMPTS_OPTION
                    ? selectedTags.length === 0
                    : selectedTags.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    className={cn(
                      "h-7 shrink-0 rounded-full border px-3 text-xs transition",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag === ALL_PROMPTS_OPTION ? "全部标签" : getTagLabel(tag)}
                    {tag !== ALL_PROMPTS_OPTION && stats.tagCounts[tag] ? (
                      <span className="ml-1 opacity-70">
                        {stats.tagCounts[tag]}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">
                {promptList.isLoading ? "..." : promptList.total}
              </strong>{" "}
              条结果
              {source !== "all" ? (
                <span className="ml-2">
                  来源：{sourceOptions.find(([id]) => id === source)?.[1]}
                </span>
              ) : null}
            </span>
            <span className="truncate">
              {activeCategoryLabel} · {activeTagLabel}
            </span>
          </div>

          {promptList.error ? (
            <StateBox
              tone="error"
              title="读取提示词失败"
              description={promptList.error.message}
              actionLabel="重试"
              onAction={promptList.refresh}
            />
          ) : null}

          {view === "review" && !promptList.error ? (
            <StateBox
              title="待整理视图暂未接入"
              description="真实数据暂时没有收藏、质量分或整理状态字段，因此这里先保留为空状态。"
            />
          ) : null}

          {promptList.isLoading && !promptList.error ? (
            <StateBox
              icon={<Loader2 className="size-5 animate-spin" />}
              title="正在读取真实提示词"
              description="从后端 `/api/prompts` 分页读取数据。"
            />
          ) : null}

          {!promptList.isLoading &&
          !promptList.error &&
          view !== "review" &&
          promptList.items.length === 0 ? (
            <StateBox
              title="没有匹配结果"
              description="调整关键词、分类、标签或来源筛选。"
              actionLabel="清空筛选"
              onAction={clearFilters}
            />
          ) : null}

          {!promptList.isLoading &&
          !promptList.error &&
          view !== "review" &&
          promptList.items.length > 0 ? (
            <>
              <div
                className={cn(
                  view === "compact"
                    ? "grid grid-cols-1 gap-3"
                    : "grid grid-cols-3 gap-3 max-2xl:grid-cols-2 max-md:grid-cols-1 2xl:grid-cols-4"
                )}
              >
                {promptList.items.map((prompt) => (
                  <PromptCard
                    key={prompt.id}
                    prompt={prompt}
                    view={view === "compact" ? "compact" : "grid"}
                    onOpen={() => setSelectedPrompt(prompt)}
                    onCopy={() => void copyPrompt(prompt)}
                    onUseForImage={() => usePromptForImage(prompt)}
                  />
                ))}
              </div>

              <Pagination
                page={promptList.safePage}
                totalPages={promptList.totalPages}
                onChange={setPage}
              />
            </>
          ) : null}
        </section>
      </div>

      <PromptDetailDialog
        prompt={selectedPrompt}
        onClose={() => setSelectedPrompt(null)}
        onCopy={(prompt) => void copyPrompt(prompt)}
        onSelect={usePromptForImage}
      />
      <PromptSelectDialog
        open={selectOpen}
        onOpenChange={setSelectOpen}
        onSelect={usePromptForImage}
      />

      {toast ? (
        <div className="fixed right-5 bottom-5 z-[60] flex max-w-sm items-center gap-2 rounded-lg border bg-foreground px-3 py-2 text-sm text-background shadow-lg">
          <Check className="size-4" />
          <span>{toast}</span>
        </div>
      ) : null}
    </main>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-24 rounded-lg border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold">{value}</div>
    </div>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<[T, string]>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border bg-muted p-1">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={cn(
            "h-7 min-w-16 rounded-md px-3 text-sm transition",
            value === id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function StateBox({
  title,
  description,
  tone = "default",
  icon,
  actionLabel,
  onAction,
}: {
  title: string
  description: string
  tone?: "default" | "error"
  icon?: React.ReactNode
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div
      className={cn(
        "grid min-h-72 place-items-center rounded-lg border border-dashed bg-background p-8 text-center",
        tone === "error" && "border-destructive/40 bg-destructive/5"
      )}
    >
      <div className="max-w-md">
        <div className="mx-auto mb-3 grid size-9 place-items-center rounded-lg border bg-background text-muted-foreground">
          {icon ||
            (tone === "error" ? (
              <AlertCircle className="size-5 text-destructive" />
            ) : (
              <Database className="size-5" />
            ))}
        </div>
        <div className="font-medium">{title}</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        {actionLabel && onAction ? (
          <Button className="mt-4" variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number
  totalPages: number
  onChange: (page: number) => void
}) {
  if (totalPages <= 1) return null

  const pages = buildPages(page, totalPages)

  return (
    <nav
      className="mt-5 flex items-center justify-center gap-2"
      aria-label="分页"
    >
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onChange(Math.max(1, page - 1))}
      >
        上一页
      </Button>
      {pages.map((item, index) =>
        item === "ellipsis" ? (
          <span
            key={`ellipsis-${index}`}
            className="px-1 text-sm text-muted-foreground"
          >
            ...
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={cn(
              "grid size-8 place-items-center rounded-md border text-sm",
              item === page
                ? "border-foreground bg-foreground text-background"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        )
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onChange(Math.min(totalPages, page + 1))}
      >
        下一页
      </Button>
    </nav>
  )
}

function buildPages(page: number, totalPages: number) {
  const result: Array<number | "ellipsis"> = []
  for (let current = 1; current <= totalPages; current += 1) {
    if (
      current === 1 ||
      current === totalPages ||
      Math.abs(current - page) <= 1
    ) {
      result.push(current)
      continue
    }

    if (result[result.length - 1] !== "ellipsis") {
      result.push("ellipsis")
    }
  }
  return result
}
