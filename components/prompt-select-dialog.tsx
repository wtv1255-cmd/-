"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, Search, Sparkles, X } from "lucide-react"

import { PromptVisual } from "@/components/prompt-card"
import { Button } from "@/components/ui/button"
import { usePromptList } from "@/hooks/use-prompt-list"
import {
  getCategoryLabel,
  getPromptSummary,
  getTagLabel,
} from "@/lib/api/prompts"
import { cn } from "@/lib/utils"
import { ALL_PROMPTS_OPTION, type Prompt } from "@/lib/types/prompt"

export function PromptSelectDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (prompt: Prompt) => void
}) {
  const [keyword, setKeyword] = useState("")
  const [category, setCategory] = useState(ALL_PROMPTS_OPTION)
  const [tags, setTags] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState("")
  const promptList = usePromptList({
    keyword,
    tags,
    category,
    source: "all",
    page: 1,
    pageSize: 80,
    enabled: open,
  })

  const selectedPrompt = useMemo(() => {
    return (
      promptList.allItems.find((item) => item.id === selectedId) ||
      promptList.items[0] ||
      null
    )
  }, [promptList.allItems, promptList.items, selectedId])

  useEffect(() => {
    if (!open) return
    if (selectedPrompt) return
    setSelectedId(promptList.items[0]?.id || "")
  }, [open, promptList.items, selectedPrompt])

  if (!open) return null

  const toggleTag = (tag: string) => {
    if (tag === ALL_PROMPTS_OPTION) {
      setTags([])
      return
    }
    setTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag]
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-select-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false)
      }}
    >
      <article className="flex max-h-[calc(100svh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border bg-popover shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2 id="prompt-select-title" className="text-lg font-semibold">
              选择提示词
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              选择后带到图片工作台。
            </p>
          </div>
          <Button
            size="icon"
            variant="outline"
            onClick={() => onOpenChange(false)}
            aria-label="关闭选择提示词"
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="min-h-0 overflow-auto p-5">
          <div className="mb-4 grid gap-3">
            <label className="relative max-w-2xl">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="h-9 w-full rounded-lg border bg-muted px-9 text-sm transition outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
                placeholder="搜索标题或提示词"
              />
            </label>

            <div className="grid gap-2 text-sm md:grid-cols-[56px_minmax(0,1fr)]">
              <div className="pt-1.5 text-xs font-medium text-muted-foreground">
                分类
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {promptList.categories.map((item) => (
                  <FilterChip
                    key={item}
                    active={category === item}
                    onClick={() => {
                      setCategory(item)
                      setSelectedId("")
                    }}
                  >
                    {item === ALL_PROMPTS_OPTION
                      ? "全部分类"
                      : getCategoryLabel(item)}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div className="grid gap-2 text-sm md:grid-cols-[56px_minmax(0,1fr)]">
              <div className="pt-1.5 text-xs font-medium text-muted-foreground">
                标签
              </div>
              <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto pr-1">
                {promptList.tags.map((item) => {
                  const active =
                    item === ALL_PROMPTS_OPTION
                      ? tags.length === 0
                      : tags.includes(item)
                  return (
                    <FilterChip
                      key={item}
                      active={active}
                      onClick={() => {
                        toggleTag(item)
                        setSelectedId("")
                      }}
                    >
                      {item === ALL_PROMPTS_OPTION
                        ? "全部标签"
                        : getTagLabel(item)}
                    </FilterChip>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="min-h-96 overflow-hidden rounded-lg border">
              <div className="border-b bg-muted px-3 py-2 text-xs text-muted-foreground">
                {promptList.isLoading
                  ? "加载中"
                  : `${promptList.total} 条结果，显示前 ${promptList.items.length} 条`}
              </div>
              <div className="max-h-[520px] overflow-auto p-2">
                {promptList.error ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {promptList.error.message}
                  </div>
                ) : null}
                {!promptList.isLoading &&
                !promptList.error &&
                promptList.items.length === 0 ? (
                  <div className="grid min-h-72 place-items-center text-center text-sm text-muted-foreground">
                    没有匹配结果
                  </div>
                ) : null}
                <div className="grid gap-2">
                  {promptList.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "grid grid-cols-[44px_minmax(0,1fr)_20px] items-center gap-3 rounded-lg border bg-background p-2 text-left text-sm hover:bg-muted",
                        selectedPrompt?.id === item.id &&
                          "border-primary bg-primary/5"
                      )}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <PromptVisual
                        prompt={item}
                        className="h-11 rounded-md border"
                        label={null}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {item.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {getCategoryLabel(item.category)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "grid size-5 place-items-center rounded-full border text-transparent",
                          selectedPrompt?.id === item.id &&
                            "border-primary bg-primary text-primary-foreground"
                        )}
                      >
                        <Check className="size-3" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <section className="min-h-96 rounded-lg border bg-muted p-3">
              {selectedPrompt ? (
                <div className="grid gap-3">
                  <PromptVisual
                    prompt={selectedPrompt}
                    className="h-52 rounded-lg border"
                    label={getCategoryLabel(selectedPrompt.category)}
                  />
                  <div>
                    <h3 className="text-base font-semibold">
                      {selectedPrompt.title}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {getPromptSummary(selectedPrompt, 180)}
                    </p>
                  </div>
                  <textarea
                    readOnly
                    value={selectedPrompt.prompt}
                    className="min-h-44 resize-y rounded-lg border bg-background p-3 font-mono text-xs leading-6 outline-none"
                  />
                </div>
              ) : (
                <div className="grid min-h-96 place-items-center text-sm text-muted-foreground">
                  未选择提示词
                </div>
              )}
            </section>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t bg-background px-5 py-3 text-sm text-muted-foreground">
          <span className="truncate">
            {selectedPrompt ? `已选择：${selectedPrompt.title}` : "未选择"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              disabled={!selectedPrompt}
              onClick={() => {
                if (!selectedPrompt) return
                onSelect(selectedPrompt)
              }}
            >
              <Sparkles className="size-4" />
              用于生图
            </Button>
          </div>
        </footer>
      </article>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={cn(
        "h-7 shrink-0 rounded-full border px-3 text-xs transition",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
