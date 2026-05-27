"use client"

import { useEffect, useState } from "react"
import { Copy, ExternalLink, Sparkles, X } from "lucide-react"

import { PromptVisual } from "@/components/prompt-card"
import { Button } from "@/components/ui/button"
import {
  formatPromptDate,
  getCategoryLabel,
  getPromptSourceLabel,
  getTagLabel,
} from "@/lib/api/prompts"
import { cn } from "@/lib/utils"
import type { Prompt } from "@/lib/types/prompt"

type DetailTab = "prompt" | "images" | "meta"

const tabs: Array<[DetailTab, string]> = [
  ["prompt", "提示词"],
  ["images", "图片样例"],
  ["meta", "信息"],
]

export function PromptDetailDialog({
  prompt,
  onClose,
  onCopy,
  onSelect,
}: {
  prompt: Prompt | null
  onClose: () => void
  onCopy: (prompt: Prompt) => void
  onSelect: (prompt: Prompt) => void
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>("prompt")
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    setActiveTab("prompt")
    setPreviewOpen(false)
  }, [prompt?.id])

  useEffect(() => {
    if (!previewOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      setPreviewOpen(false)
    }

    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true })
  }, [previewOpen])

  if (!prompt) return null

  const previewUrl = prompt.coverUrl || ""
  const openImagePreview = () => {
    if (previewUrl) setPreviewOpen(true)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-detail-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <article className="flex max-h-[calc(100svh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border bg-popover shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <h2
              id="prompt-detail-title"
              className="truncate text-lg font-semibold"
            >
              {prompt.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {getCategoryLabel(prompt.category)} ·{" "}
              {getPromptSourceLabel(prompt)} · 更新{" "}
              {formatPromptDate(prompt.updatedAt) || "未知"}
            </p>
          </div>
          <Button
            size="icon"
            variant="outline"
            onClick={onClose}
            aria-label="关闭详情"
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="min-h-0 overflow-auto p-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section className="min-w-0">
              <div className="mb-4 inline-flex rounded-lg border bg-muted p-1">
                {tabs.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={cn(
                      "h-7 rounded-md px-3 text-sm transition",
                      activeTab === id
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setActiveTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeTab === "prompt" ? (
                <textarea
                  readOnly
                  value={prompt.prompt}
                  className="min-h-80 w-full resize-y rounded-lg border bg-muted p-3 font-mono text-xs leading-6 outline-none focus:ring-2 focus:ring-ring/20"
                />
              ) : null}

              {activeTab === "images" ? (
                <div className="grid gap-3">
                  {prompt.coverUrl || prompt.preview ? (
                    <>
                      <PromptVisual
                        prompt={prompt}
                        className="h-72 rounded-lg border"
                        label={prompt.coverUrl ? "封面图片" : "图片样例暂缺"}
                        onDoubleClick={
                          previewUrl ? openImagePreview : undefined
                        }
                      />
                      {prompt.preview ? (
                        <pre className="max-h-72 overflow-auto rounded-lg border bg-muted p-3 text-xs leading-6 whitespace-pre-wrap text-muted-foreground">
                          {prompt.preview}
                        </pre>
                      ) : null}
                    </>
                  ) : (
                    <div className="grid min-h-72 place-items-center rounded-lg border border-dashed bg-background p-8 text-center">
                      <div>
                        <div className="font-medium">暂无图片样例</div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          当前记录没有 `coverUrl` 或 `preview`。
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {activeTab === "meta" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetaField
                    label="分类"
                    value={getCategoryLabel(prompt.category)}
                  />
                  <MetaField
                    label="来源"
                    value={getPromptSourceLabel(prompt)}
                  />
                  <MetaField
                    label="创建"
                    value={formatPromptDate(prompt.createdAt) || "未知"}
                  />
                  <MetaField
                    label="更新"
                    value={formatPromptDate(prompt.updatedAt) || "未知"}
                  />
                  <MetaField label="标签" value={`${prompt.tags.length} 个`} />
                  <MetaField label="ID" value={prompt.id} />
                  {prompt.githubUrl ? (
                    <a
                      href={prompt.githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-20 items-center justify-between gap-3 rounded-lg border bg-background p-3 text-sm hover:bg-muted sm:col-span-2"
                    >
                      <span className="truncate">{prompt.githubUrl}</span>
                      <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
                    </a>
                  ) : null}
                </div>
              ) : null}
            </section>

            <aside className="grid content-start gap-3">
              <PromptVisual
                prompt={prompt}
                className="h-44 rounded-lg border"
                label={`${getCategoryLabel(prompt.category)} · ${getPromptSourceLabel(prompt)}`}
                onDoubleClick={previewUrl ? openImagePreview : undefined}
              />
              <div className="grid gap-2 rounded-lg border bg-muted p-3">
                <div className="text-sm font-medium">标签</div>
                <div className="flex flex-wrap gap-1.5">
                  {prompt.tags.length ? (
                    prompt.tags.map((tag, index) => (
                      <span
                        key={`${tag}-${index}`}
                        className="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {getTagLabel(tag)}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      暂无标签
                    </span>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t bg-background px-5 py-3 text-sm text-muted-foreground">
          <span className="truncate">
            最近更新：{formatPromptDate(prompt.updatedAt) || "未知"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onCopy(prompt)}>
              <Copy className="size-4" />
              复制
            </Button>
            <Button onClick={() => onSelect(prompt)}>
              <Sparkles className="size-4" />
              用于生图
            </Button>
          </div>
        </footer>
      </article>

      {previewOpen && previewUrl ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewOpen(false)
          }}
        >
          <button
            type="button"
            className="absolute top-4 right-4 grid size-9 place-items-center rounded-lg border border-white/15 bg-white/10 text-white hover:bg-white/20"
            onClick={() => setPreviewOpen(false)}
            aria-label="关闭图片预览"
          >
            <X className="size-4" />
          </button>
          <img
            src={previewUrl}
            alt={prompt.title}
            className="max-h-[92svh] max-w-[92vw] object-contain"
          />
        </div>
      ) : null}
    </div>
  )
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-20 rounded-lg border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-sm leading-5 font-medium break-words">
        {value}
      </div>
    </div>
  )
}
