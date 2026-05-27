"use client"

import { Copy, Eye, ImageIcon, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  formatPromptDate,
  getCategoryLabel,
  getPromptSourceLabel,
} from "@/lib/api/prompts"
import type { Prompt, PromptViewMode } from "@/lib/types/prompt"

export function PromptVisual({
  prompt,
  className,
  label,
  onPreview,
}: {
  prompt: Prompt
  className?: string
  label?: string | null
  onPreview?: () => void
}) {
  const resolvedLabel =
    label === undefined
      ? `${getCategoryLabel(prompt.category)} · ${prompt.coverUrl ? "图片样例" : "无图片"}`
      : label

  return (
    <div
      className={cn(
        "relative overflow-hidden border-b bg-slate-100 dark:bg-zinc-900",
        onPreview && "cursor-zoom-in",
        className
      )}
      onClick={onPreview}
      title={onPreview ? "点击放大" : undefined}
    >
      {prompt.coverUrl ? (
        <img
          src={prompt.coverUrl}
          alt={prompt.title}
          className="absolute inset-0 h-full w-full object-contain saturate-[.86]"
        />
      ) : (
        <>
          <div className="absolute inset-4 rounded-md border border-white/70 bg-white/45" />
          <div className="absolute inset-4 rounded-md bg-[linear-gradient(rgba(15,23,42,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,.06)_1px,transparent_1px)] bg-[length:18px_18px]" />
          <ImageIcon className="absolute top-3 right-3 size-4 text-muted-foreground/70" />
        </>
      )}
      {resolvedLabel ? (
        <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-md border bg-background/90 px-2 py-1 text-xs text-foreground shadow-sm">
          {resolvedLabel}
        </span>
      ) : null}
    </div>
  )
}

export function PromptCard({
  prompt,
  view,
  onOpen,
  onCopy,
  onUseForImage,
}: {
  prompt: Prompt
  view: Extract<PromptViewMode, "grid" | "compact">
  onOpen: () => void
  onCopy: () => void
  onUseForImage?: () => void
}) {
  const isCompact = view === "compact"

  return (
    <article
      className={cn(
        "overflow-hidden rounded-lg border bg-background text-foreground transition hover:border-foreground/20 hover:shadow-sm",
        isCompact
          ? "grid min-h-0 grid-cols-[210px_minmax(0,1fr)]"
          : "flex min-h-[330px] flex-col"
      )}
    >
      <button type="button" className="block text-left" onClick={onOpen}>
        <PromptVisual
          prompt={prompt}
          className={cn(
            isCompact ? "h-full min-h-52 border-r border-b-0" : "h-56"
          )}
          label={null}
        />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <button type="button" className="min-w-0 text-left" onClick={onOpen}>
            <h2 className="line-clamp-2 text-[15px] leading-snug font-semibold">
              {prompt.title}
            </h2>
          </button>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {formatPromptDate(prompt.updatedAt)}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="truncate">{getCategoryLabel(prompt.category)}</span>
          <span>{getPromptSourceLabel(prompt)}</span>
        </div>

        <div
          className={cn(
            "grid gap-2",
            onUseForImage ? "grid-cols-3" : "grid-cols-2"
          )}
        >
          <Button size="sm" variant="outline" onClick={onCopy}>
            <Copy className="size-3.5" />
            复制
          </Button>
          <Button size="sm" variant="outline" onClick={onOpen}>
            <Eye className="size-3.5" />
            详情
          </Button>
          {onUseForImage ? (
            <Button size="sm" variant="outline" onClick={onUseForImage}>
              <Sparkles className="size-3.5" />
              生图
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  )
}
