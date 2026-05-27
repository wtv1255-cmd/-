"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  BookOpen,
  Check,
  Copy,
  Download,
  FolderOpen,
  ImagePlus,
  Loader2,
  PanelLeft,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react"

import {
  requestImageEdit,
  requestImageGeneration,
  requestPromptOptimization,
  requestPromptReverse,
  requestPromptSafetyRewrite,
} from "@/lib/api/codex-images"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  deleteLocalImageCard,
  downloadBlob,
  getLocalImageBlob,
  imageResultToGeneratedImage,
  listLocalImageCards,
  resolveLocalImageUrl,
  sanitizeFilename,
  saveLocalImageCard,
} from "@/lib/local-image-library"
import {
  DEFAULT_NEGATIVE_PROMPT_SUFFIX,
  DEFAULT_IMAGE_SETTINGS,
  DEFAULT_CODEX_PROXY_API_BASE,
  IMAGE_BACKGROUND_OPTIONS,
  IMAGE_FORMAT_OPTIONS,
  IMAGE_MODELS,
  IMAGE_QUALITY_OPTIONS,
  IMAGE_SIZE_OPTIONS,
  IMAGE_SOURCE_PROMPT_STORAGE_KEY,
  IMAGE_STYLE_PRESETS,
  IMAGE_UPSCALE_OPTIONS,
  REVERSE_PROMPT_MODES,
  TEXT_MODEL_OPTIONS,
  type GeneratedImage,
  type ImageMode,
  type ImageReference,
  type ImageSettings,
  type LocalImageCard,
  type ReversePromptMode,
  type SourcePromptSnapshot,
} from "@/lib/types/image"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type WorkbenchTab = "workbench" | "reverse" | "gallery"

const SETTINGS_STORAGE_KEY = "prompt-center:image-settings"

type ImagePreview = {
  url: string
  title: string
  subtitle?: string
  blob?: Blob
  filename?: string
}

export function ImageWorkbench() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const promptId = searchParams.get("promptId") || ""
  const fileInputRef = useRef<HTMLInputElement>(null)
  const reverseFileInputRef = useRef<HTMLInputElement>(null)
  const [settings, setSettings] = useState<ImageSettings>(
    DEFAULT_IMAGE_SETTINGS
  )
  const [mode, setMode] = useState<ImageMode>("text")
  const [prompt, setPrompt] = useState("")
  const [style, setStyle] = useState("")
  const [negativePrompt, setNegativePrompt] = useState(
    DEFAULT_NEGATIVE_PROMPT_SUFFIX
  )
  const [sourcePrompt, setSourcePrompt] = useState<SourcePromptSnapshot | null>(
    null
  )
  const [references, setReferences] = useState<ImageReference[]>([])
  const [results, setResults] = useState<
    Array<{
      id: string
      status: "pending" | "success" | "failed"
      image?: GeneratedImage
      error?: string
    }>
  >([])
  const [library, setLibrary] = useState<LocalImageCard[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [reverseImage, setReverseImage] = useState<ImageReference | null>(null)
  const [reverseMode, setReverseMode] = useState<ReversePromptMode>("reverse")
  const [textModel, setTextModel] = useState("gpt-5.5")
  const [reverseStyle, setReverseStyle] = useState("")
  const [reverseOutput, setReverseOutput] = useState("")
  const [isReversing, setIsReversing] = useState(false)
  const [isRewritingPrompt, setIsRewritingPrompt] = useState(false)
  const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("workbench")
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false)
  const [previewImage, setPreviewImage] = useState<ImagePreview | null>(null)
  const [toast, setToast] = useState("")

  const selectedModel = settings.model
  const apiConfigured = Boolean(
    settings.apiBaseUrl.trim() && settings.apiKey.trim()
  )
  const generationCount = Math.max(
    1,
    Math.min(10, Math.floor(Math.abs(Number(settings.count)) || 1))
  )
  const canGenerate =
    Boolean(prompt.trim()) &&
    !isRunning &&
    (mode === "text" || references.length > 0)

  const refreshLibrary = useCallback(async () => {
    setLibrary(await listLocalImageCards())
  }, [])

  useEffect(() => {
    void refreshLibrary()
  }, [refreshLibrary])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (!saved) return
      const parsed = JSON.parse(saved) as Partial<ImageSettings>
      setSettings({
        ...DEFAULT_IMAGE_SETTINGS,
        ...parsed,
        apiBaseUrl:
          parsed.apiBaseUrl?.trim() || DEFAULT_IMAGE_SETTINGS.apiBaseUrl,
      })
    } catch {
      setSettings(DEFAULT_IMAGE_SETTINGS)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    if (!promptId) return

    try {
      const saved = window.sessionStorage.getItem(
        IMAGE_SOURCE_PROMPT_STORAGE_KEY
      )
      const parsed = saved ? (JSON.parse(saved) as SourcePromptSnapshot) : null
      if (!parsed || parsed.id !== promptId) return
      setSourcePrompt(parsed)
      setPrompt(parsed.prompt)
      setActiveTab("workbench")
      showToast(`已带入「${parsed.title}」`)
    } catch {
      showToast("提示词带入失败")
    }
  }, [promptId])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(""), 2300)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!previewImage) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewImage(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [previewImage])

  useEffect(() => {
    return () => {
      if (reverseImage) URL.revokeObjectURL(reverseImage.url)
    }
  }, [reverseImage])

  const showToast = (message: string) => setToast(message)

  const updateSetting = <K extends keyof ImageSettings>(
    key: K,
    value: ImageSettings[K]
  ) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  const addReferenceFiles = async (files?: FileList | null) => {
    const imageFiles = Array.from(files || []).filter((file) =>
      file.type.startsWith("image/")
    )
    if (!imageFiles.length) return

    const nextReferences = imageFiles.slice(0, 10).map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      file,
      url: URL.createObjectURL(file),
    }))

    setMode("edit")
    setReferences((current) => [...current, ...nextReferences].slice(0, 10))
    showToast(`已添加 ${nextReferences.length} 张参考图`)
  }

  const addReverseFile = async (files?: FileList | null) => {
    const image = Array.from(files || []).find((file) =>
      file.type.startsWith("image/")
    )
    if (!image) return

    setReverseImage({
      id: crypto.randomUUID(),
      name: image.name,
      file: image,
      url: URL.createObjectURL(image),
    })
    setActiveTab("reverse")
    showToast("已添加反推参考图")
  }

  const removeReference = (id: string) => {
    setReferences((current) => {
      const target = current.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return current.filter((item) => item.id !== id)
    })
  }

  const clearSession = () => {
    references.forEach((item) => URL.revokeObjectURL(item.url))
    setReferences([])
    setResults([])
    setPrompt("")
    setStyle("")
    setNegativePrompt(DEFAULT_NEGATIVE_PROMPT_SUFFIX)
    setSourcePrompt(null)
    setMode("text")
    window.sessionStorage.removeItem(IMAGE_SOURCE_PROMPT_STORAGE_KEY)
  }

  const generateImages = async () => {
    const startedAt = performance.now()
    const controller = new AbortController()
    setIsRunning(true)
    setResults(
      Array.from({ length: generationCount }, () => ({
        id: crypto.randomUUID(),
        status: "pending",
      }))
    )

    try {
      const images =
        mode === "edit"
          ? await requestImageEdit({
              prompt,
              style,
              negativePrompt,
              settings: { ...settings, count: generationCount },
              references,
              signal: controller.signal,
            })
          : await requestImageGeneration({
              prompt,
              style,
              negativePrompt,
              settings: { ...settings, count: generationCount },
              signal: controller.signal,
            })

      const generated = await Promise.all(
        images.map((image) =>
          imageResultToGeneratedImage(image, performance.now() - startedAt)
        )
      )
      setResults(
        generated.map((image) => ({ id: image.id, status: "success", image }))
      )
      showToast(`已生成 ${generated.length} 张图片`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成失败"
      setResults([
        { id: crypto.randomUUID(), status: "failed", error: message },
      ])
      showToast(message)
    } finally {
      setIsRunning(false)
    }
  }

  const reversePrompt = async () => {
    if (!reverseImage) {
      showToast("请先上传一张参考图")
      return
    }
    if (!apiConfigured) {
      setApiSettingsOpen(true)
      showToast("请先填写 API 地址和 Key")
      return
    }

    const controller = new AbortController()
    setIsReversing(true)
    try {
      const output = await requestPromptReverse({
        image: reverseImage.file,
        settings,
        style: reverseStyle,
        negativePrompt,
        mode: reverseMode,
        model: textModel,
        signal: controller.signal,
      })
      setReverseOutput(output)
      showToast("反推提示词已生成")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "反推失败")
    } finally {
      setIsReversing(false)
    }
  }

  const useReverseOutput = (withReference = false) => {
    if (!reverseOutput.trim()) {
      showToast("暂无可使用的反推提示词")
      return
    }
    setPrompt(reverseOutput.trim())
    if (reverseStyle.trim()) setStyle(reverseStyle.trim())
    if (withReference && reverseImage) {
      setMode("edit")
      setReferences((current) =>
        [
          ...current,
          {
            id: crypto.randomUUID(),
            name: reverseImage.name,
            file: reverseImage.file,
            url: URL.createObjectURL(reverseImage.file),
          },
        ].slice(0, 10)
      )
    }
    setActiveTab("workbench")
    showToast(withReference ? "已带入工作台并加入参考图" : "已带入工作台")
  }

  const rewritePromptForSafety = async () => {
    if (!prompt.trim()) {
      showToast("请先输入提示词")
      return
    }
    if (!apiConfigured) {
      setApiSettingsOpen(true)
      showToast("请先填写 API 地址和 Key")
      return
    }

    const controller = new AbortController()
    setIsRewritingPrompt(true)
    try {
      const output = await requestPromptSafetyRewrite({
        prompt,
        style,
        negativePrompt,
        settings,
        model: textModel,
        signal: controller.signal,
      })
      setPrompt(output)
      showToast("已规避敏感表达")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "改写失败")
    } finally {
      setIsRewritingPrompt(false)
    }
  }

  const optimizePrompt = async () => {
    if (!prompt.trim()) {
      showToast("请先输入提示词")
      return
    }
    if (!apiConfigured) {
      setApiSettingsOpen(true)
      showToast("请先填写 API 地址和 Key")
      return
    }

    const controller = new AbortController()
    setIsOptimizingPrompt(true)
    try {
      const output = await requestPromptOptimization({
        prompt,
        style,
        negativePrompt,
        settings,
        model: textModel,
        signal: controller.signal,
      })
      setPrompt(output)
      showToast("提示词已优化")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "优化失败")
    } finally {
      setIsOptimizingPrompt(false)
    }
  }

  const saveResult = async (image: GeneratedImage) => {
    const { apiKey: _apiKey, ...safeSettings } = settings
    const title = sourcePrompt?.title || prompt.slice(0, 24) || "生成图片"
    await saveLocalImageCard({
      blob: image.blob,
      title,
      prompt,
      tags: sourcePrompt?.tags || [],
      settings: safeSettings,
      sourcePrompt,
    })
    await refreshLibrary()
    showToast("已保存到我的卡片图库")
  }

  const saveAllResults = async () => {
    const successImages = results.flatMap((item) =>
      item.status === "success" && item.image ? [item.image] : []
    )
    for (const image of successImages) {
      await saveResult(image)
    }
  }

  const addGeneratedAsReference = (image: GeneratedImage) => {
    const extension = image.mimeType.includes("jpeg")
      ? "jpg"
      : image.mimeType.split("/")[1] || "png"
    const file = new File([image.blob], `generated-${image.id}.${extension}`, {
      type: image.mimeType,
    })
    setMode("edit")
    setReferences((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: file.name,
        file,
        url: URL.createObjectURL(file),
      },
    ])
    showToast("已加入参考图")
  }

  const useGalleryImageAsReference = async (card: LocalImageCard) => {
    const blob = await getLocalImageBlob(card)
    const extension = card.mimeType.includes("jpeg")
      ? "jpg"
      : card.mimeType.split("/")[1] || "png"
    const file = new File(
      [blob],
      `${sanitizeFilename(card.title)}.${extension}`,
      { type: card.mimeType }
    )
    setMode("edit")
    setActiveTab("workbench")
    setReferences((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: file.name,
        file,
        url: URL.createObjectURL(file),
      },
    ])
    showToast("已从图库加入参考图")
  }

  const deleteGalleryCard = async (card: LocalImageCard) => {
    await deleteLocalImageCard(card)
    await refreshLibrary()
    showToast("已删除图片卡片")
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      showToast("已复制提示词")
    } catch {
      showToast("复制失败")
    }
  }

  const saveApiSettings = (apiBaseUrl: string, apiKey: string) => {
    setSettings((current) => ({
      ...current,
      apiBaseUrl:
        apiBaseUrl.trim().replace(/\/+$/, "") || DEFAULT_CODEX_PROXY_API_BASE,
      apiKey: apiKey.trim(),
    }))
    setApiSettingsOpen(false)
    showToast("API 配置已保存")
  }

  const clearApiSettings = () => {
    setSettings((current) => ({
      ...current,
      apiBaseUrl: DEFAULT_CODEX_PROXY_API_BASE,
      apiKey: "",
    }))
    setApiSettingsOpen(false)
    showToast("API 地址和 Key 已清空")
  }

  return (
    <main className="min-h-svh bg-muted/40 text-foreground">
      <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={() => setSidebarOpen((value) => !value)}
            aria-label="收起或展开参数"
          >
            <PanelLeft className="size-4" />
          </Button>
          <div className="grid size-8 place-items-center rounded-lg border bg-background">
            <ImagePlus className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">图片工作台</div>
            <div className="truncate text-xs text-muted-foreground">
              {sourcePrompt
                ? `来自提示词：${sourcePrompt.title}`
                : "CodexProxy 生图和本地卡片图库"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant={apiConfigured ? "outline" : "default"}
            onClick={() => setApiSettingsOpen(true)}
          >
            <SettingsIcon className="size-4" />
            设置
          </Button>
          <Button variant="outline" onClick={() => router.push("/")}>
            <BookOpen className="size-4" />
            提示词
          </Button>
          <Button
            variant={activeTab === "workbench" ? "default" : "outline"}
            onClick={() => setActiveTab("workbench")}
          >
            工作台
          </Button>
          <Button
            variant={activeTab === "reverse" ? "default" : "outline"}
            onClick={() => setActiveTab("reverse")}
          >
            <WandSparkles className="size-4" />
            反推
          </Button>
          <Button
            variant={activeTab === "gallery" ? "default" : "outline"}
            onClick={() => setActiveTab("gallery")}
          >
            <FolderOpen className="size-4" />
            我的图库
          </Button>
        </div>
      </header>

      <div
        className={cn(
          "grid min-h-[calc(100svh-3.5rem)] transition-[grid-template-columns]",
          sidebarOpen
            ? "grid-cols-[320px_minmax(0,1fr)]"
            : "grid-cols-[56px_minmax(0,1fr)]",
          "max-lg:grid-cols-1"
        )}
      >
        <aside
          className={cn(
            "border-r bg-background transition-all max-lg:border-r-0 max-lg:border-b",
            !sidebarOpen && "max-lg:hidden"
          )}
        >
          {sidebarOpen ? (
            <SettingsPanel
              mode={mode}
              settings={settings}
              textModel={textModel}
              onModeChange={setMode}
              onSettingChange={updateSetting}
              onTextModelChange={setTextModel}
              onClose={() => setSidebarOpen(false)}
              onReset={() =>
                setSettings((current) => ({
                  ...DEFAULT_IMAGE_SETTINGS,
                  apiBaseUrl: current.apiBaseUrl,
                  apiKey: current.apiKey,
                }))
              }
              apiConfigured={apiConfigured}
              onOpenApiSettings={() => setApiSettingsOpen(true)}
            />
          ) : (
            <div className="grid gap-2 p-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setSidebarOpen(true)}
                aria-label="展开参数"
              >
                <SlidersHorizontal className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setActiveTab("gallery")}
                aria-label="打开图库"
              >
                <FolderOpen className="size-4" />
              </Button>
            </div>
          )}
        </aside>

        <section className="min-w-0 overflow-auto p-5 max-md:p-3">
          {activeTab === "workbench" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(360px,460px)_minmax(0,1fr)]">
              <section className="min-w-0 rounded-lg border bg-background p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-normal">
                      创建生图
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedModel} · {settings.size} · {settings.quality}
                    </p>
                  </div>
                  <Button variant="outline" onClick={clearSession}>
                    <RefreshCw className="size-4" />
                    新建
                  </Button>
                </div>

                <div className="grid gap-4">
                  <label className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">提示词</span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={copyPrompt}
                          disabled={!prompt.trim()}
                        >
                          <Copy className="size-3.5" />
                          复制
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void optimizePrompt()}
                          disabled={!prompt.trim() || isOptimizingPrompt}
                        >
                          {isOptimizingPrompt ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <WandSparkles className="size-3.5" />
                          )}
                          优化
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void rewritePromptForSafety()}
                          disabled={!prompt.trim() || isRewritingPrompt}
                        >
                          {isRewritingPrompt ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <ShieldAlert className="size-3.5" />
                          )}
                          规避
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push("/")}
                        >
                          <BookOpen className="size-3.5" />
                          选提示词
                        </Button>
                      </div>
                    </div>
                    <textarea
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      className="min-h-52 resize-y rounded-lg border bg-muted p-3 text-sm leading-6 transition outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
                      placeholder="描述画面主体、风格、构图、光线和用途"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-medium">风格</span>
                    <input
                      value={style}
                      onChange={(event) => setStyle(event.target.value)}
                      className="h-9 rounded-lg border bg-muted px-3 text-sm transition outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
                      placeholder="可选风格词"
                    />
                  </label>

                  <div className="grid gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <WandSparkles className="size-4" />
                      风格预设
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {IMAGE_STYLE_PRESETS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={cn(
                            "min-h-9 rounded-md border px-3 text-left text-xs transition",
                            style === item.value
                              ? "border-foreground bg-foreground text-background"
                              : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                          onClick={() => setStyle(item.value)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="grid gap-2">
                    <span className="text-sm font-medium">负面要求</span>
                    <textarea
                      value={negativePrompt}
                      onChange={(event) =>
                        setNegativePrompt(event.target.value)
                      }
                      className="min-h-20 resize-y rounded-lg border bg-muted p-3 text-sm leading-6 transition outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
                      placeholder="不希望图片出现的画面问题"
                    />
                  </label>

                  <ReferencePanel
                    mode={mode}
                    references={references}
                    onModeChange={setMode}
                    onUpload={() => fileInputRef.current?.click()}
                    onFilesDrop={addReferenceFiles}
                    onRemove={removeReference}
                  />

                  <Button
                    className="h-10"
                    disabled={!canGenerate}
                    onClick={() => void generateImages()}
                  >
                    {isRunning ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    {mode === "edit" ? "用参考图生成" : "生成图片"}
                  </Button>

                  {mode === "edit" && references.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      图生图需要先上传参考图。
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="min-w-0 rounded-lg border bg-zinc-950 p-4 text-zinc-50">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">生成结果</h2>
                    <p className="mt-1 text-sm text-zinc-400">
                      黑色背景用于完整查看透明图和浅色图。
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="border-zinc-700 bg-zinc-900 text-zinc-50 hover:bg-zinc-800"
                    disabled={
                      !results.some((item) => item.status === "success")
                    }
                    onClick={() => void saveAllResults()}
                  >
                    <Plus className="size-4" />
                    全部入库
                  </Button>
                </div>

                {results.length ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(180px,220px))] sm:justify-start">
                    {results.map((result, index) => (
                      <ResultCard
                        key={result.id}
                        result={result}
                        index={index}
                        onSave={saveResult}
                        onUseReference={addGeneratedAsReference}
                        onSafetyRewrite={() => void rewritePromptForSafety()}
                        isRewritingPrompt={isRewritingPrompt}
                        onPreview={(image) =>
                          setPreviewImage({
                            url: image.url,
                            title: `生成结果 ${index + 1}`,
                            subtitle: `${image.width}x${image.height} · ${formatBytes(image.bytes)}`,
                            blob: image.blob,
                            filename: `generated-${index + 1}.${image.mimeType.includes("jpeg") ? "jpg" : image.mimeType.split("/")[1] || "png"}`,
                          })
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid min-h-[520px] place-items-center rounded-lg border border-dashed border-zinc-800 bg-black text-center">
                    <div>
                      <ImagePlus className="mx-auto mb-3 size-10 text-zinc-500" />
                      <div className="text-sm font-medium text-zinc-200">
                        还没有生成图片
                      </div>
                      <p className="mt-1 text-sm text-zinc-500">
                        输入提示词后开始生成，结果可以保存到我的卡片图库。
                      </p>
                    </div>
                  </div>
                )}
              </section>
            </div>
          ) : activeTab === "reverse" ? (
            <ReversePromptView
              image={reverseImage}
              mode={reverseMode}
              model={textModel}
              style={reverseStyle}
              negativePrompt={negativePrompt}
              output={reverseOutput}
              isRunning={isReversing}
              apiConfigured={apiConfigured}
              onModeChange={setReverseMode}
              onModelChange={setTextModel}
              onStyleChange={setReverseStyle}
              onNegativePromptChange={setNegativePrompt}
              onUpload={() => reverseFileInputRef.current?.click()}
              onFilesDrop={addReverseFile}
              onClearImage={() => setReverseImage(null)}
              onRun={() => void reversePrompt()}
              onCopy={(value) =>
                void navigator.clipboard
                  .writeText(value)
                  .then(() => showToast("已复制反推提示词"))
              }
              onUse={() => useReverseOutput(false)}
              onUseWithReference={() => useReverseOutput(true)}
              onOpenSettings={() => setApiSettingsOpen(true)}
            />
          ) : (
            <GalleryView
              cards={library}
              onRefresh={refreshLibrary}
              onUseReference={useGalleryImageAsReference}
              onDelete={deleteGalleryCard}
              onPreview={(preview) => setPreviewImage(preview)}
            />
          )}
        </section>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void addReferenceFiles(event.target.files)
          event.currentTarget.value = ""
        }}
      />

      <input
        ref={reverseFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void addReverseFile(event.target.files)
          event.currentTarget.value = ""
        }}
      />

      <ImagePreviewDialog
        preview={previewImage}
        onClose={() => setPreviewImage(null)}
      />
      <ApiSettingsDialog
        open={apiSettingsOpen}
        apiBaseUrl={settings.apiBaseUrl}
        apiKey={settings.apiKey}
        onClose={() => setApiSettingsOpen(false)}
        onSave={saveApiSettings}
        onClear={clearApiSettings}
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

function ReversePromptView({
  image,
  mode,
  model,
  style,
  negativePrompt,
  output,
  isRunning,
  apiConfigured,
  onModeChange,
  onModelChange,
  onStyleChange,
  onNegativePromptChange,
  onUpload,
  onFilesDrop,
  onClearImage,
  onRun,
  onCopy,
  onUse,
  onUseWithReference,
  onOpenSettings,
}: {
  image: ImageReference | null
  mode: ReversePromptMode
  model: string
  style: string
  negativePrompt: string
  output: string
  isRunning: boolean
  apiConfigured: boolean
  onModeChange: (mode: ReversePromptMode) => void
  onModelChange: (model: string) => void
  onStyleChange: (style: string) => void
  onNegativePromptChange: (value: string) => void
  onUpload: () => void
  onFilesDrop: (files?: FileList | null) => void
  onClearImage: () => void
  onRun: () => void
  onCopy: (value: string) => void
  onUse: () => void
  onUseWithReference: () => void
  onOpenSettings: () => void
}) {
  const canRun = Boolean(image) && !isRunning

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
      <section className="rounded-lg border bg-background p-4">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold tracking-normal">反推提示词</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            上传参考图，反推出可用于 GPT Image 2 的中文提示词。
          </p>
        </div>

        <div className="grid gap-4">
          <div className="inline-flex rounded-lg border bg-muted p-1">
            {REVERSE_PROMPT_MODES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={cn(
                  "h-8 rounded-md px-3 text-sm transition",
                  mode === item.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => onModeChange(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div
            className={cn(
              "grid min-h-64 place-items-center rounded-lg border border-dashed bg-muted/40 p-3 text-center transition",
              image && "border-solid bg-background"
            )}
            onDragOver={(event) => {
              event.preventDefault()
            }}
            onDrop={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault()
              onFilesDrop(event.dataTransfer.files)
            }}
          >
            {image ? (
              <div className="grid w-full gap-3">
                <img
                  src={image.url}
                  alt={image.name}
                  className="max-h-72 w-full rounded-md object-contain"
                />
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="min-w-0 truncate">{image.name}</span>
                  <Button size="sm" variant="outline" onClick={onClearImage}>
                    移除
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="grid w-full place-items-center gap-2 py-10 text-sm text-muted-foreground"
                onClick={onUpload}
              >
                <Upload className="size-7" />
                <span className="font-medium text-foreground">
                  拖入参考图或点击上传
                </span>
                <span>支持 PNG、JPG、WebP</span>
              </button>
            )}
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-medium">分析模型</span>
            <input
              value={model}
              onChange={(event) => onModelChange(event.target.value)}
              className="h-9 rounded-lg border bg-muted px-3 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
              placeholder="例如 gpt-5.5"
            />
          </label>

          <div className="grid grid-cols-4 gap-2">
            {TEXT_MODEL_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={cn(
                  "h-8 rounded-md border px-2 text-xs transition",
                  model === item.value
                    ? "border-foreground bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => onModelChange(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-medium">目标风格</span>
            <input
              value={style}
              onChange={(event) => onStyleChange(event.target.value)}
              className="h-9 rounded-lg border bg-muted px-3 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
              placeholder="可选，用于换风格或洗图"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            {IMAGE_STYLE_PRESETS.slice(0, 6).map((item) => (
              <button
                key={item.id}
                type="button"
                className="min-h-9 rounded-md border bg-background px-3 text-left text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                onClick={() => onStyleChange(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-medium">负面要求后缀</span>
            <textarea
              value={negativePrompt}
              onChange={(event) => onNegativePromptChange(event.target.value)}
              className="min-h-24 resize-y rounded-lg border bg-muted p-3 text-sm leading-6 outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
            />
          </label>

          {!apiConfigured ? (
            <Button variant="outline" onClick={onOpenSettings}>
              <SettingsIcon className="size-4" />
              填写 API 设置
            </Button>
          ) : null}

          <Button className="h-10" disabled={!canRun} onClick={onRun}>
            {isRunning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <WandSparkles className="size-4" />
            )}
            {isRunning ? "反推中" : "开始反推"}
          </Button>
        </div>
      </section>

      <section className="rounded-lg border bg-background p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">反推结果</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              可以直接带入工作台，也可以连同参考图一起做图生图。
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!output.trim()}
              onClick={() => onCopy(output)}
            >
              <Copy className="size-4" />
              复制
            </Button>
            <Button variant="outline" disabled={!output.trim()} onClick={onUse}>
              用于生图
            </Button>
            <Button disabled={!output.trim()} onClick={onUseWithReference}>
              洗图
            </Button>
          </div>
        </div>

        <textarea
          readOnly
          value={output}
          className="min-h-[560px] w-full resize-y rounded-lg border bg-muted p-4 font-mono text-xs leading-6 outline-none"
          placeholder="反推完成后会在这里显示提示词。"
        />
      </section>
    </div>
  )
}

function SettingsPanel({
  mode,
  settings,
  textModel,
  onModeChange,
  onSettingChange,
  onTextModelChange,
  onClose,
  onReset,
  apiConfigured,
  onOpenApiSettings,
}: {
  mode: ImageMode
  settings: ImageSettings
  textModel: string
  onModeChange: (mode: ImageMode) => void
  onSettingChange: <K extends keyof ImageSettings>(
    key: K,
    value: ImageSettings[K]
  ) => void
  onTextModelChange: (model: string) => void
  onClose: () => void
  onReset: () => void
  apiConfigured: boolean
  onOpenApiSettings: () => void
}) {
  return (
    <div className="grid gap-5 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">参数</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            保留 CodexProxy 生图参数
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          aria-label="收起参数"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="grid gap-2">
        <FieldLabel>生成模式</FieldLabel>
        <Segmented
          options={[
            ["text", "文生图"],
            ["edit", "图生图"],
          ]}
          value={mode}
          onChange={onModeChange}
        />
      </div>

      <SelectField
        label="模型"
        value={settings.model}
        options={IMAGE_MODELS}
        onChange={(value) => onSettingChange("model", value)}
      />
      <SelectField
        label="尺寸"
        value={settings.size}
        options={IMAGE_SIZE_OPTIONS}
        onChange={(value) => onSettingChange("size", value)}
      />
      <SelectField
        label="质量"
        value={settings.quality}
        options={IMAGE_QUALITY_OPTIONS}
        onChange={(value) => onSettingChange("quality", value)}
      />
      <SelectField
        label="格式"
        value={settings.outputFormat}
        options={IMAGE_FORMAT_OPTIONS}
        onChange={(value) => onSettingChange("outputFormat", value)}
      />
      <SelectField
        label="背景"
        value={settings.background}
        options={IMAGE_BACKGROUND_OPTIONS}
        onChange={(value) => onSettingChange("background", value)}
      />
      <SelectField
        label="本地放大"
        value={settings.upscale}
        options={IMAGE_UPSCALE_OPTIONS}
        onChange={(value) => onSettingChange("upscale", value)}
      />

      <div className="grid gap-2">
        <FieldLabel>提示词处理模型</FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          {TEXT_MODEL_OPTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={cn(
                "h-8 rounded-md border text-xs transition",
                textModel === item.value
                  ? "border-foreground bg-foreground text-background"
                  : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              onClick={() => onTextModelChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <FieldLabel>生成张数</FieldLabel>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4].map((value) => (
            <button
              key={value}
              type="button"
              className={cn(
                "h-8 rounded-md border text-sm",
                settings.count === value
                  ? "border-foreground bg-foreground text-background"
                  : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              onClick={() => onSettingChange("count", value)}
            >
              {value}
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={10}
            value={settings.count > 4 ? settings.count : ""}
            placeholder="自定"
            onChange={(event) =>
              onSettingChange(
                "count",
                Math.max(1, Math.min(10, Number(event.target.value) || 1))
              )
            }
            className="h-8 min-w-0 rounded-md border bg-background px-2 text-center text-sm outline-none"
          />
        </div>
      </div>

      <button
        type="button"
        className="rounded-lg border bg-muted p-3 text-left text-sm hover:bg-background"
        onClick={onOpenApiSettings}
      >
        <div className="font-medium">API 配置</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {apiConfigured
            ? "已填写 API 地址和 Key"
            : "未配置，点击填写地址和 Key"}
        </div>
      </button>

      <Button variant="outline" onClick={onReset}>
        恢复默认参数
      </Button>
    </div>
  )
}

function ApiSettingsDialog({
  open,
  apiBaseUrl,
  apiKey,
  onClose,
  onSave,
  onClear,
}: {
  open: boolean
  apiBaseUrl: string
  apiKey: string
  onClose: () => void
  onSave: (apiBaseUrl: string, apiKey: string) => void
  onClear: () => void
}) {
  const [draftBaseUrl, setDraftBaseUrl] = useState(apiBaseUrl)
  const [draftKey, setDraftKey] = useState(apiKey)

  useEffect(() => {
    if (!open) return
    setDraftBaseUrl(apiBaseUrl)
    setDraftKey(apiKey)
  }, [apiBaseUrl, apiKey, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[65] grid place-items-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-settings-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <article className="w-full max-w-lg overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 id="api-settings-title" className="text-base font-semibold">
              API 设置
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              填写 CodexProxy 兼容接口地址和 API Key，仅保存在本机。
            </p>
          </div>
          <Button
            size="icon"
            variant="outline"
            onClick={onClose}
            aria-label="关闭 API 设置"
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="grid gap-4 p-5">
          <label className="grid gap-2">
            <span className="text-sm font-medium">API 地址</span>
            <input
              value={draftBaseUrl}
              onChange={(event) => setDraftBaseUrl(event.target.value)}
              className="h-9 rounded-lg border bg-muted px-3 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
              placeholder="例如：https://laodeng.chat/v1"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">API Key</span>
            <input
              value={draftKey}
              onChange={(event) => setDraftKey(event.target.value)}
              className="h-9 rounded-lg border bg-muted px-3 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
              type="password"
              placeholder="sk-..."
            />
          </label>

          <div className="rounded-lg border bg-muted p-3 text-xs leading-5 text-muted-foreground">
            建议填写到 <span className="font-mono">/v1</span>，例如{" "}
            <span className="font-mono">https://laodeng.chat/v1</span>
            。如果只填域名，程序也会自动补齐。
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t bg-background px-5 py-3">
          <Button variant="outline" onClick={onClear}>
            清空配置
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button onClick={() => onSave(draftBaseUrl, draftKey)}>保存</Button>
          </div>
        </footer>
      </article>
    </div>
  )
}

function ReferencePanel({
  mode,
  references,
  onModeChange,
  onUpload,
  onFilesDrop,
  onRemove,
}: {
  mode: ImageMode
  references: ImageReference[]
  onModeChange: (mode: ImageMode) => void
  onUpload: () => void
  onFilesDrop: (files: FileList) => void
  onRemove: (id: string) => void
}) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
    setIsDragging(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setIsDragging(false)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    if (!event.dataTransfer.files.length) return
    onFilesDrop(event.dataTransfer.files)
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">参考图</span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={mode === "edit" ? "default" : "outline"}
            onClick={() => onModeChange("edit")}
          >
            图生图
          </Button>
          <Button size="sm" variant="outline" onClick={onUpload}>
            <Upload className="size-3.5" />
            上传
          </Button>
        </div>
      </div>
      <div
        className={cn(
          "flex min-h-24 gap-2 overflow-x-auto rounded-lg border border-dashed bg-muted p-2 transition",
          isDragging && "border-foreground bg-background ring-2 ring-ring/20"
        )}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {references.length ? (
          <>
            {references.map((item) => (
              <div
                key={item.id}
                className="group relative size-20 shrink-0 overflow-hidden rounded-md border bg-black"
              >
                <img
                  src={item.url}
                  alt={item.name}
                  className="size-full object-contain"
                />
                <button
                  type="button"
                  className="absolute top-1 right-1 hidden size-6 place-items-center rounded bg-black/70 text-white group-hover:grid"
                  onClick={() => onRemove(item.id)}
                  aria-label="移除参考图"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="grid size-20 shrink-0 place-items-center rounded-md border border-dashed bg-background text-muted-foreground hover:text-foreground"
              onClick={onUpload}
              aria-label="添加参考图"
            >
              <Upload className="size-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            className="grid min-w-full place-items-center rounded-md text-center text-sm text-muted-foreground hover:text-foreground"
            onClick={onUpload}
          >
            <span>
              <Upload className="mx-auto mb-2 size-5" />
              拖入参考图或点击上传
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

function ResultCard({
  result,
  index,
  onSave,
  onUseReference,
  onSafetyRewrite,
  isRewritingPrompt,
  onPreview,
}: {
  result: {
    id: string
    status: "pending" | "success" | "failed"
    image?: GeneratedImage
    error?: string
  }
  index: number
  onSave: (image: GeneratedImage) => Promise<void>
  onUseReference: (image: GeneratedImage) => void
  onSafetyRewrite: () => void
  isRewritingPrompt: boolean
  onPreview: (image: GeneratedImage) => void
}) {
  if (result.status === "pending") {
    return (
      <div className="grid aspect-square place-items-center rounded-md border border-dashed border-zinc-800 bg-black">
        <div className="text-center text-sm text-zinc-400">
          <Loader2 className="mx-auto mb-2 size-6 animate-spin" />
          生成中
        </div>
      </div>
    )
  }

  if (result.status === "failed") {
    return (
      <div className="grid aspect-square place-items-center rounded-md border border-red-900 bg-red-950/20 p-4 text-center">
        <div>
          <div className="font-medium text-red-200">生成失败</div>
          <p className="mt-2 text-xs leading-5 text-red-300">{result.error}</p>
          <Button
            className="mt-3 border-red-800 bg-red-950 text-red-100 hover:bg-red-900"
            size="sm"
            variant="outline"
            disabled={isRewritingPrompt}
            onClick={onSafetyRewrite}
            title="规避敏感词"
          >
            {isRewritingPrompt ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ShieldAlert className="size-3.5" />
            )}
            规避敏感词
          </Button>
        </div>
      </div>
    )
  }

  if (!result.image) return null

  const image = result.image
  const extension = image.mimeType.includes("jpeg")
    ? "jpg"
    : image.mimeType.split("/")[1] || "png"

  return (
    <article className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900">
      <div
        className="grid aspect-square cursor-zoom-in place-items-center bg-black"
        onClick={() => onPreview(image)}
        title="点击放大"
      >
        <img
          src={image.url}
          alt={`生成结果 ${index + 1}`}
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <div className="grid gap-2 border-t border-zinc-800 p-2.5">
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-zinc-400">
          <span>
            {image.width}x{image.height}
          </span>
          <span>{formatBytes(image.bytes)}</span>
          <span>{formatDuration(image.durationMs)}</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 bg-zinc-950 text-zinc-50 hover:bg-zinc-800"
            onClick={() => void onSave(image)}
          >
            <FolderOpen className="size-3.5" />
            入库
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 bg-zinc-950 text-zinc-50 hover:bg-zinc-800"
            onClick={() => onUseReference(image)}
          >
            <ImagePlus className="size-3.5" />
            参考
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 bg-zinc-950 text-zinc-50 hover:bg-zinc-800"
            onClick={() =>
              downloadBlob(image.blob, `generated-${index + 1}.${extension}`)
            }
          >
            <Download className="size-3.5" />
            下载
          </Button>
        </div>
      </div>
    </article>
  )
}

function GalleryView({
  cards,
  onRefresh,
  onUseReference,
  onDelete,
  onPreview,
}: {
  cards: LocalImageCard[]
  onRefresh: () => Promise<void>
  onUseReference: (card: LocalImageCard) => Promise<void>
  onDelete: (card: LocalImageCard) => Promise<void>
  onPreview: (preview: ImagePreview) => void
}) {
  return (
    <section className="grid gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">
            我的卡片图库
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            只保存到本地浏览器 IndexedDB，不是提示词图片样例库。
          </p>
        </div>
        <Button variant="outline" onClick={() => void onRefresh()}>
          <RefreshCw className="size-4" />
          刷新
        </Button>
      </div>

      {cards.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(170px,200px))] sm:justify-start">
          {cards.map((card) => (
            <GalleryCard
              key={card.id}
              card={card}
              onUseReference={onUseReference}
              onDelete={onDelete}
              onPreview={onPreview}
            />
          ))}
        </div>
      ) : (
        <div className="grid min-h-[520px] place-items-center rounded-lg border border-dashed bg-background p-8 text-center">
          <div>
            <FolderOpen className="mx-auto mb-3 size-10 text-muted-foreground" />
            <div className="font-medium">图库还没有图片</div>
            <p className="mt-1 text-sm text-muted-foreground">
              生成结果点“入库”后会出现在这里。
            </p>
          </div>
        </div>
      )}
    </section>
  )
}

function GalleryCard({
  card,
  onUseReference,
  onDelete,
  onPreview,
}: {
  card: LocalImageCard
  onUseReference: (card: LocalImageCard) => Promise<void>
  onDelete: (card: LocalImageCard) => Promise<void>
  onPreview: (preview: ImagePreview) => void
}) {
  const [url, setUrl] = useState("")

  useEffect(() => {
    let alive = true
    resolveLocalImageUrl(card).then((nextUrl) => {
      if (alive) setUrl(nextUrl)
    })
    return () => {
      alive = false
    }
  }, [card])

  return (
    <article className="overflow-hidden rounded-md border bg-background">
      <div
        className="grid aspect-square cursor-zoom-in place-items-center bg-black"
        onClick={() => {
          if (!url) return
          onPreview({
            url,
            title: card.title,
            subtitle: `${card.width}x${card.height} · ${formatBytes(card.bytes)}`,
          })
        }}
        title="点击放大"
      >
        {url ? (
          <img
            src={url}
            alt={card.title}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <Loader2 className="size-6 animate-spin text-zinc-500" />
        )}
      </div>
      <div className="grid gap-2 p-2.5">
        <div>
          <h2 className="line-clamp-1 text-[13px] font-semibold">
            {card.title}
          </h2>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
            {card.prompt || "无提示词记录"}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            {card.width}x{card.height}
          </span>
          <span>{formatBytes(card.bytes)}</span>
          {card.sourcePromptTitle ? (
            <span>来自：{card.sourcePromptTitle}</span>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void onUseReference(card)}
          >
            <ImagePlus className="size-3.5" />
            参考
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void getLocalImageBlob(card).then((blob) =>
                downloadBlob(
                  blob,
                  `${sanitizeFilename(card.title)}.${card.mimeType.includes("jpeg") ? "jpg" : card.mimeType.split("/")[1] || "png"}`
                )
              )
            }
          >
            <Download className="size-3.5" />
            下载
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void onDelete(card)}
          >
            <Trash2 className="size-3.5" />
            删除
          </Button>
        </div>
      </div>
    </article>
  )
}

function ImagePreviewDialog({
  preview,
  onClose,
}: {
  preview: ImagePreview | null
  onClose: () => void
}) {
  if (!preview) return null

  return (
    <div
      className="fixed inset-0 z-[70] grid bg-black/88 p-4 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="absolute top-4 right-4 left-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{preview.title}</div>
          {preview.subtitle ? (
            <div className="mt-1 text-xs text-zinc-400">{preview.subtitle}</div>
          ) : null}
        </div>
        <div className="flex gap-2">
          {preview.blob && preview.filename ? (
            <Button
              variant="outline"
              className="border-zinc-700 bg-zinc-950 text-zinc-50 hover:bg-zinc-800"
              onClick={() =>
                downloadBlob(preview.blob as Blob, preview.filename as string)
              }
            >
              <Download className="size-4" />
              下载
            </Button>
          ) : null}
          <Button
            size="icon"
            variant="outline"
            className="border-zinc-700 bg-zinc-950 text-zinc-50 hover:bg-zinc-800"
            onClick={onClose}
            aria-label="关闭预览"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 place-items-center pt-14">
        <img
          src={preview.url}
          alt={preview.title}
          className="max-h-[calc(100svh-7rem)] max-w-full cursor-zoom-out object-contain"
          onClick={onClose}
          title="点击缩小"
        />
      </div>
    </div>
  )
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: ReadonlyArray<{ label: string; value: T }>
  onChange: (value: T) => void
}) {
  return (
    <label className="grid gap-2">
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-9 rounded-lg border bg-background px-3 text-sm transition outline-none focus:ring-2 focus:ring-ring/20"
      >
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
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
    <div className="grid grid-cols-2 rounded-lg border bg-muted p-1">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={cn(
            "h-7 rounded-md px-3 text-sm transition",
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

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-medium text-muted-foreground">
      {children}
    </span>
  )
}

function formatBytes(value: number) {
  if (!value) return "-"
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(2)} MB`
}

function formatDuration(value: number) {
  if (!value) return "-"
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(1)} s`
}
