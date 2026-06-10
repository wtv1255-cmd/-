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
  ChevronDown,
  Copy,
  Download,
  FileJson,
  FolderOpen,
  ImagePlus,
  Loader2,
  PanelLeft,
  Plus,
  RefreshCw,
  Search,
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
  DEFAULT_IMAGE_MODEL_API_PROFILES,
  DEFAULT_TEXT_API_BASE,
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
  YANAI_IMAGE_PROMPT_PRESETS,
  type GeneratedImage,
  type GenerationResult,
  type ImageMode,
  type ImageModelApiProfile,
  type ImageReference,
  type ImageSettings,
  type LocalImageCard,
  type ReversePromptMode,
  type SafeImageSettings,
  type SourcePromptSnapshot,
} from "@/lib/types/image"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type WorkbenchTab = "workbench" | "reverse" | "gallery"

const SETTINGS_STORAGE_KEY = "prompt-center:image-settings"
const LEGACY_IMAGE_MODEL_MAP: Record<string, string> = {
  "gpt-image-2-1k": "gpt-image-2-1K",
  "gpt-image-2-2k": "gpt-image-2-2K",
  "gpt-image-2-4k": "gpt-image-2-4K",
}
const LEGACY_IMAGE_API_BASE_URLS = new Set([
  "https://laodeng.chat/v1",
  "https://ai.hybgzs.com/v1",
  "https://api.xxiaozhi.com",
  "https://api.xxiaozhi.com/v1",
])
const YANAI_PROMPT_PRESET_CATEGORIES = [
  "形象建议",
  "照片修复",
  "写真风格",
  "设计模板",
]

function normalizeImageModel(value: unknown) {
  if (typeof value !== "string") return DEFAULT_IMAGE_SETTINGS.model
  const model = value.trim()
  if (!model) return DEFAULT_IMAGE_SETTINGS.model
  return LEGACY_IMAGE_MODEL_MAP[model] || model
}

function cleanApiBaseUrl(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\/+$/, "") : ""
}

function cloneDefaultModelApiProfiles() {
  return Object.fromEntries(
    Object.entries(DEFAULT_IMAGE_MODEL_API_PROFILES).map(([model, profile]) => [
      model,
      { ...profile },
    ])
  ) as Record<string, ImageModelApiProfile>
}

function defaultImageApiProfile(model: string) {
  const profile = DEFAULT_IMAGE_MODEL_API_PROFILES[model] ||
    DEFAULT_IMAGE_MODEL_API_PROFILES[DEFAULT_IMAGE_SETTINGS.model] || {
      apiBaseUrl: DEFAULT_CODEX_PROXY_API_BASE,
      apiKey: "",
    }
  return { ...profile }
}

function normalizeImageApiBaseUrl(value: unknown, model: string) {
  const apiBaseUrl = cleanApiBaseUrl(value)
  if (!apiBaseUrl || LEGACY_IMAGE_API_BASE_URLS.has(apiBaseUrl)) {
    return defaultImageApiProfile(model).apiBaseUrl
  }
  return apiBaseUrl
}

function normalizeStoredModelApiProfiles(value: unknown) {
  const profiles = cloneDefaultModelApiProfiles()

  if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(
      ([rawModel, rawProfile]) => {
        const model = normalizeImageModel(rawModel)
        if (!rawProfile || typeof rawProfile !== "object") return
        const profile = rawProfile as Partial<ImageModelApiProfile>
        const rawBaseUrl = cleanApiBaseUrl(profile.apiBaseUrl)
        profiles[model] = {
          apiBaseUrl: normalizeImageApiBaseUrl(rawBaseUrl, model),
          apiKey: LEGACY_IMAGE_API_BASE_URLS.has(rawBaseUrl)
            ? ""
            : typeof profile.apiKey === "string"
              ? profile.apiKey.trim()
              : "",
        }
      }
    )
  }

  return profiles
}

function readImageApiProfile(
  profiles: Record<string, ImageModelApiProfile>,
  model: string
) {
  return profiles[model] || defaultImageApiProfile(model)
}

function hydrateModelApiProfiles(
  value: unknown,
  activeModel: string,
  legacyApiBaseUrl: unknown,
  legacyApiKey: unknown
) {
  const profiles = normalizeStoredModelApiProfiles(value)
  const legacyBaseUrl = cleanApiBaseUrl(legacyApiBaseUrl)
  const legacyKey = typeof legacyApiKey === "string" ? legacyApiKey.trim() : ""

  if (legacyKey && !LEGACY_IMAGE_API_BASE_URLS.has(legacyBaseUrl)) {
    const current = readImageApiProfile(profiles, activeModel)
    if (!current.apiKey.trim()) {
      profiles[activeModel] = {
        apiBaseUrl: normalizeImageApiBaseUrl(legacyBaseUrl, activeModel),
        apiKey: legacyKey,
      }
    }
  }

  if (!profiles[activeModel])
    profiles[activeModel] = defaultImageApiProfile(activeModel)
  return profiles
}

function applyActiveImageApiProfile(settings: ImageSettings) {
  const model = normalizeImageModel(settings.model)
  const profiles = normalizeStoredModelApiProfiles(settings.modelApiProfiles)
  const activeProfile = readImageApiProfile(profiles, model)

  return {
    ...settings,
    model,
    apiBaseUrl: activeProfile.apiBaseUrl,
    apiKey: activeProfile.apiKey,
    modelApiProfiles: profiles,
  }
}

function toSafeImageSettings(settings: ImageSettings): SafeImageSettings {
  const {
    apiKey: _apiKey,
    textApiKey: _textApiKey,
    modelApiProfiles: _modelApiProfiles,
    ...safeSettings
  } = settings
  return safeSettings
}

function normalizeTextApiBaseUrl(value: unknown, legacyApiBaseUrl: unknown) {
  const apiBaseUrl = cleanApiBaseUrl(value)
  if (apiBaseUrl) return apiBaseUrl

  const legacyApiBase = cleanApiBaseUrl(legacyApiBaseUrl)
  if (legacyApiBase === DEFAULT_TEXT_API_BASE) return legacyApiBase

  return DEFAULT_IMAGE_SETTINGS.textApiBaseUrl
}

function normalizeImageSettingCount(value: unknown) {
  const count = Number(value)
  if (!Number.isFinite(count)) return DEFAULT_IMAGE_SETTINGS.count
  return Math.max(1, Math.min(10, Math.floor(Math.abs(count))))
}

function normalizeImageSettingSize(value: unknown) {
  const size = typeof value === "string" ? value.trim() : ""
  if (!size) return DEFAULT_IMAGE_SETTINGS.size

  const legacySizeMap: Record<string, string> = {
    "1024x1024": "1:1",
    "2048x2048": "1:1",
    "2880x2880": "1:1",
    "1536x864": "16:9",
    "2560x1440": "16:9",
    "3840x2160": "16:9",
    "864x1536": "9:16",
    "1440x2560": "9:16",
    "2160x3840": "9:16",
  }

  return legacySizeMap[size.toLowerCase()] || size
}

function hydrateImageSettings(value: unknown): ImageSettings {
  const parsed =
    value && typeof value === "object" ? (value as Partial<ImageSettings>) : {}
  const model = normalizeImageModel(parsed.model)
  const legacyApiBaseUrl = cleanApiBaseUrl(parsed.apiBaseUrl)
  const legacyApiKey =
    typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : ""
  const imageApiKey = LEGACY_IMAGE_API_BASE_URLS.has(legacyApiBaseUrl)
    ? DEFAULT_IMAGE_SETTINGS.apiKey
    : legacyApiKey
  const textApiKey =
    typeof parsed.textApiKey === "string"
      ? parsed.textApiKey.trim()
      : legacyApiBaseUrl === DEFAULT_TEXT_API_BASE
        ? legacyApiKey
        : DEFAULT_IMAGE_SETTINGS.textApiKey
  const modelApiProfiles = hydrateModelApiProfiles(
    parsed.modelApiProfiles,
    model,
    parsed.apiBaseUrl,
    imageApiKey
  )
  const activeImageProfile = readImageApiProfile(modelApiProfiles, model)

  return {
    ...DEFAULT_IMAGE_SETTINGS,
    ...parsed,
    model,
    apiBaseUrl: activeImageProfile.apiBaseUrl,
    apiKey: activeImageProfile.apiKey,
    modelApiProfiles,
    size: normalizeImageSettingSize(parsed.size),
    textApiBaseUrl: normalizeTextApiBaseUrl(
      parsed.textApiBaseUrl,
      parsed.apiBaseUrl
    ),
    textApiKey,
    count: normalizeImageSettingCount(parsed.count),
  }
}

type ImagePreview = {
  url: string
  title: string
  subtitle?: string
  blob?: Blob
  filename?: string
}

type GenerationResultContext = {
  prompt: string
  settings: SafeImageSettings
  sourcePrompt: SourcePromptSnapshot | null
}

type QueuedGenerationResult = GenerationResult & {
  batchId: string
  context: GenerationResultContext
}

type GenerationSessionSnapshot = {
  results: QueuedGenerationResult[]
  isRunning: boolean
  version: number
}

type QueuedGenerationJob = {
  id: string
  resultIds: string[]
  mode: ImageMode
  prompt: string
  style: string
  negativePrompt: string
  settings: ImageSettings
  references: ImageReference[]
  context: GenerationResultContext
  version: number
}

let generationSessionSnapshot: GenerationSessionSnapshot = {
  results: [],
  isRunning: false,
  version: 0,
}
const generationJobQueue: QueuedGenerationJob[] = []
let generationQueueProcessing = false

const generationSessionListeners = new Set<
  (snapshot: GenerationSessionSnapshot) => void
>()

function getGenerationSessionSnapshot() {
  return generationSessionSnapshot
}

function emitGenerationSession() {
  const snapshot = getGenerationSessionSnapshot()
  generationSessionListeners.forEach((listener) => listener(snapshot))
}

function subscribeGenerationSession(
  listener: (snapshot: GenerationSessionSnapshot) => void
) {
  generationSessionListeners.add(listener)
  listener(getGenerationSessionSnapshot())
  return () => {
    generationSessionListeners.delete(listener)
  }
}

function setGenerationResults(
  value:
    | QueuedGenerationResult[]
    | ((current: QueuedGenerationResult[]) => QueuedGenerationResult[])
) {
  generationSessionSnapshot = {
    ...generationSessionSnapshot,
    results:
      typeof value === "function"
        ? value(generationSessionSnapshot.results)
        : value,
  }
  emitGenerationSession()
}

function setGenerationRunning(isRunning: boolean) {
  generationSessionSnapshot = {
    ...generationSessionSnapshot,
    isRunning,
  }
  emitGenerationSession()
}

function resetGenerationSession() {
  generationJobQueue.length = 0
  generationSessionSnapshot = {
    results: [],
    isRunning: false,
    version: generationSessionSnapshot.version + 1,
  }
  emitGenerationSession()
}

function enqueueGenerationJob(job: QueuedGenerationJob) {
  generationJobQueue.push(job)
  generationSessionSnapshot = {
    ...generationSessionSnapshot,
    isRunning: true,
    results: [
      ...generationSessionSnapshot.results,
      ...job.resultIds.map((id) => ({
        id,
        batchId: job.id,
        status: "pending" as const,
        context: job.context,
      })),
    ],
  }
  emitGenerationSession()
  void processGenerationQueue()
}

function patchGenerationResult(
  id: string,
  patch: Partial<Omit<QueuedGenerationResult, "id">>,
  version: number
) {
  if (version !== generationSessionSnapshot.version) return
  setGenerationResults((current) =>
    current.map((item) => (item.id === id ? { ...item, ...patch } : item))
  )
}

async function processGenerationQueue() {
  if (generationQueueProcessing) return
  generationQueueProcessing = true

  while (generationJobQueue.length) {
    const job = generationJobQueue.shift()
    if (!job || job.version !== generationSessionSnapshot.version) continue

    const startedAt = performance.now()
    await Promise.all(
      job.resultIds.map(async (slotId) => {
        try {
          const images =
            job.mode === "edit"
              ? await requestImageEdit({
                  prompt: job.prompt,
                  style: job.style,
                  negativePrompt: job.negativePrompt,
                  settings: { ...job.settings, count: 1 },
                  references: job.references,
                })
              : await requestImageGeneration({
                  prompt: job.prompt,
                  style: job.style,
                  negativePrompt: job.negativePrompt,
                  settings: { ...job.settings, count: 1 },
                })

          const image = images[0]
          if (!image) throw new Error("接口没有返回图片")

          const generated = await imageResultToGeneratedImage(
            image,
            performance.now() - startedAt
          )
          patchGenerationResult(
            slotId,
            { status: "success", image: generated },
            job.version
          )
        } catch (error) {
          patchGenerationResult(
            slotId,
            {
              status: "failed",
              error: error instanceof Error ? error.message : "生成失败",
            },
            job.version
          )
        }
      })
    )
  }

  generationQueueProcessing = false
  if (
    !generationSessionSnapshot.results.some((item) => item.status === "pending")
  ) {
    setGenerationRunning(false)
  }
}

export function ImageWorkbench() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const promptId = searchParams.get("promptId") || ""
  const fileInputRef = useRef<HTMLInputElement>(null)
  const reverseFileInputRef = useRef<HTMLInputElement>(null)
  const galleryImportInputRef = useRef<HTMLInputElement>(null)
  const mountedRef = useRef(true)
  const [settings, setSettings] = useState<ImageSettings>(
    DEFAULT_IMAGE_SETTINGS
  )
  const [settingsHydrated, setSettingsHydrated] = useState(false)
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
  const [generationSession, setGenerationSession] = useState(
    getGenerationSessionSnapshot
  )
  const [library, setLibrary] = useState<LocalImageCard[]>([])
  const [reverseImage, setReverseImage] = useState<ImageReference | null>(null)
  const [reverseMode, setReverseMode] = useState<ReversePromptMode>("reverse")
  const [textModel, setTextModel] = useState("gpt-5.5")
  const [reverseStyle, setReverseStyle] = useState("")
  const [reverseOutput, setReverseOutput] = useState("")
  const [isReversing, setIsReversing] = useState(false)
  const [isRewritingPrompt, setIsRewritingPrompt] = useState(false)
  const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [corePromptOpen, setCorePromptOpen] = useState(false)
  const [stylePanelOpen, setStylePanelOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("workbench")
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false)
  const [previewImage, setPreviewImage] = useState<ImagePreview | null>(null)
  const [toast, setToast] = useState("")

  const selectedModel = settings.model
  const results = generationSession.results
  const isRunning = generationSession.isRunning
  const generationDone = results.filter(
    (item) => item.status !== "pending"
  ).length
  const generationSuccess = results.filter(
    (item) => item.status === "success"
  ).length
  const generationFailed = results.filter(
    (item) => item.status === "failed"
  ).length
  const selectedModelLabel =
    IMAGE_MODELS.find((item) => item.value === selectedModel)?.label ||
    selectedModel
  const selectedSizeLabel =
    IMAGE_SIZE_OPTIONS.find((item) => item.value === settings.size)?.label ||
    settings.size
  const imageApiConfigured = Boolean(
    settings.apiBaseUrl.trim() && settings.apiKey.trim()
  )
  const textApiConfigured = Boolean(
    settings.textApiBaseUrl.trim() && settings.textApiKey.trim()
  )
  const apiConfigured = imageApiConfigured && textApiConfigured
  const generationCount = Math.max(
    1,
    Math.min(10, Math.floor(Math.abs(Number(settings.count)) || 1))
  )
  const canGenerate =
    Boolean(prompt.trim()) && (mode === "text" || references.length > 0)

  const refreshLibrary = useCallback(async () => {
    setLibrary(await listLocalImageCards())
  }, [])

  useEffect(() => {
    void refreshLibrary()
  }, [refreshLibrary])

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    return subscribeGenerationSession(setGenerationSession)
  }, [])

  useEffect(() => {
    let alive = true

    async function hydrateSettings() {
      try {
        const saved = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
        const rawSettings = saved
          ? JSON.parse(saved)
          : await window.promptCenterDesktop?.readDefaultApiSettings?.()
        if (!alive) return
        setSettings(hydrateImageSettings(rawSettings))
      } catch {
        if (alive) setSettings(hydrateImageSettings(null))
      } finally {
        if (alive) setSettingsHydrated(true)
      }
    }

    void hydrateSettings()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!settingsHydrated) return
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  }, [settings, settingsHydrated])

  useEffect(() => {
    router.prefetch("/")
  }, [router])

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

  const showToast = (message: string) => {
    if (mountedRef.current) setToast(message)
  }

  const updateSetting = <K extends keyof ImageSettings>(
    key: K,
    value: ImageSettings[K]
  ) => {
    setSettings((current) => {
      if (key === "model") {
        const model = normalizeImageModel(value)
        const modelApiProfiles = normalizeStoredModelApiProfiles(
          current.modelApiProfiles
        )
        const activeImageProfile = readImageApiProfile(modelApiProfiles, model)

        return {
          ...current,
          model,
          apiBaseUrl: activeImageProfile.apiBaseUrl,
          apiKey: activeImageProfile.apiKey,
          modelApiProfiles,
        }
      }

      return { ...current, [key]: value }
    })
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
    resetGenerationSession()
    setPrompt("")
    setStyle("")
    setNegativePrompt(DEFAULT_NEGATIVE_PROMPT_SUFFIX)
    setSourcePrompt(null)
    setMode("text")
    window.sessionStorage.removeItem(IMAGE_SOURCE_PROMPT_STORAGE_KEY)
  }

  const generateImages = async () => {
    if (!imageApiConfigured) {
      setApiSettingsOpen(true)
      showToast("请先填写生图 API 地址和 Key")
      return
    }

    const requestSettings = applyActiveImageApiProfile(settings)
    const job: QueuedGenerationJob = {
      id: crypto.randomUUID(),
      resultIds: Array.from({ length: generationCount }, () =>
        crypto.randomUUID()
      ),
      mode,
      prompt,
      style,
      negativePrompt,
      settings: requestSettings,
      references: [...references],
      context: {
        prompt,
        settings: toSafeImageSettings(requestSettings),
        sourcePrompt,
      },
      version: getGenerationSessionSnapshot().version,
    }

    enqueueGenerationJob(job)
    showToast(isRunning ? "已加入生成队列" : "已开始生成")
  }

  const reversePrompt = async () => {
    if (!reverseImage) {
      showToast("请先上传一张参考图")
      return
    }
    if (!textApiConfigured) {
      setApiSettingsOpen(true)
      showToast("请先填写语言模型 API 地址和 Key")
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
    if (!textApiConfigured) {
      setApiSettingsOpen(true)
      showToast("请先填写语言模型 API 地址和 Key")
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
    if (!textApiConfigured) {
      setApiSettingsOpen(true)
      showToast("请先填写语言模型 API 地址和 Key")
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

  const saveResult = async (result: QueuedGenerationResult) => {
    if (!result.image) return

    const title =
      result.context.sourcePrompt?.title ||
      result.context.prompt.slice(0, 24) ||
      "生成图片"
    await saveLocalImageCard({
      blob: result.image.blob,
      title,
      prompt: result.context.prompt,
      tags: result.context.sourcePrompt?.tags || [],
      settings: result.context.settings,
      sourcePrompt: result.context.sourcePrompt,
    })
    await refreshLibrary()
    showToast("已保存到我的图库")
  }

  const saveAllResults = async () => {
    const successResults = results.filter(
      (item) => item.status === "success" && item.image
    )
    for (const item of successResults) {
      await saveResult(item)
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

  const useGalleryPrompt = (card: LocalImageCard) => {
    if (!card.prompt.trim()) {
      showToast("这张图片没有可复用的提示词")
      return
    }

    setPrompt(card.prompt)
    setSourcePrompt(null)
    setMode("text")
    setActiveTab("workbench")
    setSettings((current) => {
      const cardSettings = card.settings || toSafeImageSettings(current)
      const model = normalizeImageModel(cardSettings.model)
      const modelApiProfiles = normalizeStoredModelApiProfiles(
        current.modelApiProfiles
      )
      const activeImageProfile = readImageApiProfile(modelApiProfiles, model)

      return {
        ...current,
        model,
        size: normalizeImageSettingSize(cardSettings.size),
        quality: cardSettings.quality,
        outputFormat: cardSettings.outputFormat,
        background: cardSettings.background,
        upscale: cardSettings.upscale,
        count: cardSettings.count,
        apiBaseUrl: activeImageProfile.apiBaseUrl,
        apiKey: activeImageProfile.apiKey,
        modelApiProfiles,
      }
    })
    showToast("已复用图库提示词")
  }

  const importGalleryFiles = async (files?: FileList | null) => {
    const imageFiles = Array.from(files || []).filter((file) =>
      file.type.startsWith("image/")
    )
    if (!imageFiles.length) {
      showToast("请选择图片文件")
      return
    }

    let successCount = 0
    let failedCount = 0
    for (const file of imageFiles.slice(0, 50)) {
      try {
        await saveLocalImageCard({
          blob: file,
          title: file.name.replace(/\.[^.]+$/, "") || "导入图片",
          prompt: "",
          tags: ["imported"],
          settings: toSafeImageSettings(settings),
          sourcePrompt: null,
        })
        successCount += 1
      } catch {
        failedCount += 1
      }
    }

    await refreshLibrary()
    setActiveTab("gallery")
    showToast(
      failedCount
        ? `已导入 ${successCount} 张，${failedCount} 张失败`
        : `已导入 ${successCount} 张图片`
    )
  }

  const exportGalleryIndex = (cards: LocalImageCard[]) => {
    if (!cards.length) {
      showToast("没有可导出的图库记录")
      return
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      count: cards.length,
      items: cards.map(({ imageKey: _imageKey, ...card }) => card),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    })
    const stamp = new Date().toISOString().slice(0, 10)
    downloadBlob(blob, `prompt-center-gallery-${stamp}.json`)
    showToast(`已导出 ${cards.length} 条图库索引`)
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

  const applyPromptPreset = (
    preset: (typeof YANAI_IMAGE_PROMPT_PRESETS)[number]
  ) => {
    setPrompt(preset.prompt)
    setMode(preset.mode)
    setActiveTab("workbench")
    showToast(
      preset.mode === "edit" && references.length === 0
        ? `已套用「${preset.label}」，请上传参考图`
        : `已套用「${preset.label}」`
    )
  }

  const saveApiSettings = (
    nextModelApiProfiles: Record<string, ImageModelApiProfile>,
    textApiBaseUrl: string,
    textApiKey: string
  ) => {
    setSettings((current) => {
      const model = normalizeImageModel(current.model)
      const modelApiProfiles =
        normalizeStoredModelApiProfiles(nextModelApiProfiles)
      const activeImageProfile = readImageApiProfile(modelApiProfiles, model)

      return {
        ...current,
        model,
        apiBaseUrl: activeImageProfile.apiBaseUrl,
        apiKey: activeImageProfile.apiKey,
        modelApiProfiles,
        textApiBaseUrl:
          cleanApiBaseUrl(textApiBaseUrl) || DEFAULT_TEXT_API_BASE,
        textApiKey: textApiKey.trim(),
      }
    })
    setApiSettingsOpen(false)
    showToast("API 配置已保存")
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
                : "生图工作台和本地图库"}
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
          <Button
            variant="outline"
            onMouseEnter={() => router.prefetch("/")}
            onFocus={() => router.prefetch("/")}
            onClick={() => router.push("/")}
          >
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
                setSettings((current) => {
                  const model = DEFAULT_IMAGE_SETTINGS.model
                  const modelApiProfiles = normalizeStoredModelApiProfiles(
                    current.modelApiProfiles
                  )
                  const activeImageProfile = readImageApiProfile(
                    modelApiProfiles,
                    model
                  )

                  return {
                    ...DEFAULT_IMAGE_SETTINGS,
                    model,
                    apiBaseUrl: activeImageProfile.apiBaseUrl,
                    apiKey: activeImageProfile.apiKey,
                    modelApiProfiles,
                    textApiBaseUrl: current.textApiBaseUrl,
                    textApiKey: current.textApiKey,
                  }
                })
              }
              imageApiConfigured={imageApiConfigured}
              textApiConfigured={textApiConfigured}
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
                      {selectedModelLabel} · {selectedSizeLabel} ·{" "}
                      {settings.quality}
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
                          onMouseEnter={() => router.prefetch("/")}
                          onFocus={() => router.prefetch("/")}
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

                  <CollapsiblePanel
                    title="核心提示词"
                    summary="形象建议、照片修复、写真风格"
                    icon={<Sparkles className="size-4" />}
                    open={corePromptOpen}
                    onOpenChange={setCorePromptOpen}
                  >
                    {YANAI_PROMPT_PRESET_CATEGORIES.map((category) => {
                      const items = YANAI_IMAGE_PROMPT_PRESETS.filter(
                        (item) => item.category === category
                      )
                      if (!items.length) return null

                      return (
                        <section key={category} className="grid gap-2">
                          <div className="text-xs font-medium text-muted-foreground">
                            {category}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {items.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className="min-h-16 rounded-md border bg-background px-3 py-2 text-left transition hover:bg-muted"
                                onClick={() => applyPromptPreset(item)}
                              >
                                <span className="block text-xs font-medium text-foreground">
                                  {item.label}
                                </span>
                                <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                                  {item.description}
                                </span>
                              </button>
                            ))}
                          </div>
                        </section>
                      )
                    })}
                  </CollapsiblePanel>

                  <CollapsiblePanel
                    title="风格"
                    summary={style.trim() ? "已设置风格词" : "可选风格词和预设"}
                    icon={<WandSparkles className="size-4" />}
                    open={stylePanelOpen}
                    onOpenChange={setStylePanelOpen}
                  >
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">风格词</span>
                      <input
                        value={style}
                        onChange={(event) => setStyle(event.target.value)}
                        className="h-9 rounded-lg border bg-muted px-3 text-sm transition outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
                        placeholder="可选风格词"
                      />
                    </label>

                    <div className="grid gap-2">
                      <div className="text-sm font-medium">风格预设</div>
                      <div className="grid grid-cols-2 gap-2">
                        {IMAGE_STYLE_PRESETS.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={cn(
                              "min-h-9 rounded-md border px-3 text-left text-xs transition",
                              style === item.value
                                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                            onClick={() => setStyle(item.value)}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CollapsiblePanel>

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
                    {isRunning
                      ? "加入队列"
                      : mode === "edit"
                        ? "用参考图生成"
                        : "生成图片"}
                  </Button>

                  {mode === "edit" && references.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      图生图需要先上传参考图。
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="min-w-0 rounded-lg border bg-background p-4 text-foreground">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">生成结果</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      黑色背景用于完整查看透明图和浅色图。
                    </p>
                  </div>
                  <Button
                    variant="outline"
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
                  <GenerationProgress
                    done={generationDone}
                    failed={generationFailed}
                    isRunning={isRunning}
                    success={generationSuccess}
                    total={results.length}
                  />
                ) : null}

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
                        输入提示词后开始生成，结果可以保存到我的图库。
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
              textApiConfigured={textApiConfigured}
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
              onImport={() => galleryImportInputRef.current?.click()}
              onExport={exportGalleryIndex}
              onUsePrompt={useGalleryPrompt}
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

      <input
        ref={galleryImportInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void importGalleryFiles(event.target.files)
          event.currentTarget.value = ""
        }}
      />

      <ImagePreviewDialog
        preview={previewImage}
        onClose={() => setPreviewImage(null)}
      />
      <ApiSettingsDialog
        open={apiSettingsOpen}
        imageModel={selectedModel}
        imageModelLabel={selectedModelLabel}
        modelApiProfiles={settings.modelApiProfiles}
        textApiBaseUrl={settings.textApiBaseUrl}
        textApiKey={settings.textApiKey}
        onClose={() => setApiSettingsOpen(false)}
        onSave={saveApiSettings}
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
  textApiConfigured,
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
  textApiConfigured: boolean
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
                    ? "bg-primary text-primary-foreground shadow-sm"
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
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
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

          {!textApiConfigured ? (
            <Button variant="outline" onClick={onOpenSettings}>
              <SettingsIcon className="size-4" />
              填写语言模型 API
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

function CollapsiblePanel({
  title,
  summary,
  icon,
  open,
  onOpenChange,
  children,
}: {
  title: string
  summary?: string
  icon?: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-background">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-muted"
        onClick={() => onOpenChange(!open)}
      >
        <span className="flex min-w-0 items-center gap-2">
          {icon ? (
            <span className="shrink-0 text-muted-foreground">{icon}</span>
          ) : null}
          <span className="min-w-0">
            <span className="block text-sm font-medium">{title}</span>
            {summary ? (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {summary}
              </span>
            ) : null}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? <div className="grid gap-3 border-t p-3">{children}</div> : null}
    </section>
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
  imageApiConfigured,
  textApiConfigured,
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
  imageApiConfigured: boolean
  textApiConfigured: boolean
  onOpenApiSettings: () => void
}) {
  return (
    <div className="grid gap-5 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">参数</h2>
          <p className="mt-1 text-xs text-muted-foreground">生图模型参数</p>
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
        label="比例"
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
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
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
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
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
          当前生图模型{imageApiConfigured ? "已配置" : "未配置"} · 语言模型
          {textApiConfigured ? "已配置" : "未配置"}
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
  imageModel,
  imageModelLabel,
  modelApiProfiles,
  textApiBaseUrl,
  textApiKey,
  onClose,
  onSave,
}: {
  open: boolean
  imageModel: string
  imageModelLabel: string
  modelApiProfiles: Record<string, ImageModelApiProfile>
  textApiBaseUrl: string
  textApiKey: string
  onClose: () => void
  onSave: (
    modelApiProfiles: Record<string, ImageModelApiProfile>,
    textApiBaseUrl: string,
    textApiKey: string
  ) => void
}) {
  const [draftModel, setDraftModel] = useState(imageModel)
  const [draftProfiles, setDraftProfiles] = useState<
    Record<string, ImageModelApiProfile>
  >(() => normalizeStoredModelApiProfiles(modelApiProfiles))
  const [draftTextBaseUrl, setDraftTextBaseUrl] = useState(textApiBaseUrl)
  const [draftTextKey, setDraftTextKey] = useState(textApiKey)

  useEffect(() => {
    if (!open) return
    setDraftModel(imageModel)
    setDraftProfiles(normalizeStoredModelApiProfiles(modelApiProfiles))
    setDraftTextBaseUrl(textApiBaseUrl)
    setDraftTextKey(textApiKey)
  }, [imageModel, modelApiProfiles, textApiBaseUrl, textApiKey, open])

  if (!open) return null

  const selectedModelLabel =
    IMAGE_MODELS.find((item) => item.value === draftModel)?.label || draftModel
  const selectedDefaultProfile = defaultImageApiProfile(draftModel)
  const selectedProfile = readImageApiProfile(draftProfiles, draftModel)
  const updateSelectedProfile = (patch: Partial<ImageModelApiProfile>) => {
    setDraftProfiles((current) => {
      const profiles = normalizeStoredModelApiProfiles(current)
      profiles[draftModel] = {
        ...readImageApiProfile(profiles, draftModel),
        ...patch,
      }
      return profiles
    })
  }

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
      <article className="w-full max-w-4xl overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 id="api-settings-title" className="text-base font-semibold">
              API 设置
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              当前工作台模型是 {imageModelLabel}。每个生图模型都有独立 Base URL
              和 Key。
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

        <div className="grid gap-5 p-5">
          <section className="grid gap-4 rounded-lg border bg-background p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="grid content-start gap-2">
              <div>
                <h3 className="text-sm font-semibold">生图模型 API</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  点击模型后编辑对应地址和 Key。
                </p>
              </div>
              <div className="grid gap-1.5">
                {IMAGE_MODELS.map((item) => {
                  const profile = readImageApiProfile(draftProfiles, item.value)
                  const active = draftModel === item.value
                  const configured = Boolean(profile.apiKey.trim())
                  return (
                    <button
                      key={item.value}
                      type="button"
                      className={cn(
                        "flex min-h-10 items-center justify-between gap-2 rounded-md border px-3 text-left text-xs transition",
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      onClick={() => setDraftModel(item.value)}
                    >
                      <span className="min-w-0 truncate">{item.label}</span>
                      <span className="shrink-0 opacity-75">
                        {configured ? "已配置" : "未配置"}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-3">
              <div>
                <h3 className="text-sm font-semibold">{selectedModelLabel}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  默认地址：{" "}
                  <span className="font-mono">
                    {selectedDefaultProfile.apiBaseUrl}
                  </span>
                </p>
              </div>
              <label className="grid gap-2">
                <span className="text-sm font-medium">API 地址</span>
                <input
                  value={selectedProfile.apiBaseUrl}
                  onChange={(event) =>
                    updateSelectedProfile({
                      apiBaseUrl: event.target.value,
                    })
                  }
                  className="h-9 rounded-lg border bg-muted px-3 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
                  placeholder={`例如：${selectedDefaultProfile.apiBaseUrl}`}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium">API Key</span>
                <input
                  value={selectedProfile.apiKey}
                  onChange={(event) =>
                    updateSelectedProfile({ apiKey: event.target.value })
                  }
                  className="h-9 rounded-lg border bg-muted px-3 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
                  type="password"
                  placeholder="sk-..."
                />
              </label>

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  updateSelectedProfile({
                    apiBaseUrl: selectedDefaultProfile.apiBaseUrl,
                    apiKey: "",
                  })
                }
              >
                清空当前生图模型
              </Button>
            </div>
          </section>

          <section className="grid gap-3 rounded-lg border bg-background p-4">
            <div>
              <h3 className="text-sm font-semibold">语言模型 API</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                用于反推提示词、优化提示词和规避敏感表达。
              </p>
            </div>
            <label className="grid gap-2">
              <span className="text-sm font-medium">API 地址</span>
              <input
                value={draftTextBaseUrl}
                onChange={(event) => setDraftTextBaseUrl(event.target.value)}
                className="h-9 rounded-lg border bg-muted px-3 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
                placeholder={`例如：${DEFAULT_TEXT_API_BASE}`}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">API Key</span>
              <input
                value={draftTextKey}
                onChange={(event) => setDraftTextKey(event.target.value)}
                className="h-9 rounded-lg border bg-muted px-3 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
                type="password"
                placeholder="sk-..."
              />
            </label>
          </section>

          <div className="rounded-lg border bg-muted p-3 text-xs leading-5 text-muted-foreground">
            生图模型之间的配置互不覆盖；语言模型默认使用{" "}
            <span className="font-mono">{DEFAULT_TEXT_API_BASE}</span>。
            配置只保存在本机。
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t bg-background px-5 py-3">
          <span className="text-xs text-muted-foreground">
            保存后立即用于当前工作台模型。
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button
              onClick={() =>
                onSave(draftProfiles, draftTextBaseUrl, draftTextKey)
              }
            >
              保存
            </Button>
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
  result: QueuedGenerationResult
  index: number
  onSave: (result: QueuedGenerationResult) => Promise<void>
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
          <div className="mt-1 font-mono text-xs text-zinc-500">
            #{index + 1}
          </div>
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
    <article className="overflow-hidden rounded-md border bg-background">
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
      <div className="grid gap-2 border-t p-2.5">
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
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
            onClick={() => void onSave(result)}
          >
            <FolderOpen className="size-3.5" />
            入库
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUseReference(image)}
          >
            <ImagePlus className="size-3.5" />
            参考
          </Button>
          <Button
            variant="outline"
            size="sm"
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

function GenerationProgress({
  total,
  done,
  success,
  failed,
  isRunning,
}: {
  total: number
  done: number
  success: number
  failed: number
  isRunning: boolean
}) {
  const percent = total ? Math.round((done / total) * 100) : 0

  return (
    <div className="mb-4 rounded-lg border bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <div className="flex min-w-0 items-center gap-2 font-medium">
          {isRunning ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : null}
          <span>{isRunning ? "队列生成中" : "队列完成"}</span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {done}/{total} · {percent}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>成功 {success}</span>
        <span>失败 {failed}</span>
        <span>等待 {Math.max(0, total - done)}</span>
      </div>
    </div>
  )
}

type GalleryFilter = "all" | "prompt" | "imported" | "generated"

function GalleryView({
  cards,
  onRefresh,
  onImport,
  onExport,
  onUsePrompt,
  onUseReference,
  onDelete,
  onPreview,
}: {
  cards: LocalImageCard[]
  onRefresh: () => Promise<void>
  onImport: () => void
  onExport: (cards: LocalImageCard[]) => void
  onUsePrompt: (card: LocalImageCard) => void
  onUseReference: (card: LocalImageCard) => Promise<void>
  onDelete: (card: LocalImageCard) => Promise<void>
  onPreview: (preview: ImagePreview) => void
}) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<GalleryFilter>("all")
  const normalizedQuery = query.trim().toLowerCase()
  const totalBytes = cards.reduce((sum, card) => sum + card.bytes, 0)
  const filteredCards = cards.filter((card) => {
    const tags = Array.isArray(card.tags) ? card.tags : []
    const imported = tags.includes("imported")
    const matchesFilter =
      filter === "all" ||
      (filter === "prompt" && Boolean(card.sourcePromptId)) ||
      (filter === "imported" && imported) ||
      (filter === "generated" && !imported)
    if (!matchesFilter) return false
    if (!normalizedQuery) return true

    return [
      card.title,
      card.prompt,
      card.sourcePromptTitle || "",
      card.mimeType,
      ...tags,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  })
  const visibleCards = filteredCards.slice(0, 360)
  const filteredBytes = filteredCards.reduce((sum, card) => sum + card.bytes, 0)

  return (
    <section className="grid gap-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">我的图库</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            只保存到本地浏览器 IndexedDB，不是提示词图片样例库。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onImport}>
            <Upload className="size-4" />
            导入
          </Button>
          <Button variant="outline" onClick={() => onExport(filteredCards)}>
            <FileJson className="size-4" />
            导出索引
          </Button>
          <Button variant="outline" onClick={() => void onRefresh()}>
            <RefreshCw className="size-4" />
            刷新
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border bg-background p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 w-full rounded-lg border bg-muted pr-3 pl-9 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
              placeholder="搜索标题、提示词、来源或标签"
            />
          </label>
          <div className="grid grid-cols-4 rounded-lg border bg-muted p-1 lg:w-[360px]">
            {(
              [
                ["all", "全部"],
                ["prompt", "提示词"],
                ["generated", "生成"],
                ["imported", "导入"],
              ] as Array<[GalleryFilter, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "h-8 rounded-md px-2 text-sm transition",
                  filter === id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>全部 {cards.length} 张</span>
          <span>当前 {filteredCards.length} 张</span>
          <span>总占用 {formatBytes(totalBytes)}</span>
          <span>当前占用 {formatBytes(filteredBytes)}</span>
          {filteredCards.length > visibleCards.length ? (
            <span>已显示前 {visibleCards.length} 张，继续搜索可缩小范围</span>
          ) : null}
        </div>
      </div>

      {visibleCards.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(170px,200px))] sm:justify-start">
          {visibleCards.map((card) => (
            <GalleryCard
              key={card.id}
              card={card}
              onUsePrompt={onUsePrompt}
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
              {cards.length
                ? "没有匹配当前搜索和筛选条件的图片。"
                : "生成结果点“入库”，或直接导入本地图片。"}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}

function GalleryCard({
  card,
  onUsePrompt,
  onUseReference,
  onDelete,
  onPreview,
}: {
  card: LocalImageCard
  onUsePrompt: (card: LocalImageCard) => void
  onUseReference: (card: LocalImageCard) => Promise<void>
  onDelete: (card: LocalImageCard) => Promise<void>
  onPreview: (preview: ImagePreview) => void
}) {
  const [url, setUrl] = useState("")
  const tags = Array.isArray(card.tags) ? card.tags : []
  const imported = tags.includes("imported")

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
            subtitle: `${card.width}x${card.height} · ${formatBytes(card.bytes)} · ${formatDate(card.createdAt)}`,
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
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="line-clamp-1 min-w-0 text-[13px] font-semibold">
              {card.title}
            </h2>
            <span className="shrink-0 rounded-full border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {imported ? "导入" : card.sourcePromptId ? "提示词" : "生成"}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
            {card.prompt || "无提示词记录"}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            {card.width}x{card.height}
          </span>
          <span>{formatBytes(card.bytes)}</span>
          <span>{formatDate(card.createdAt)}</span>
          {card.sourcePromptTitle ? (
            <span>来自：{card.sourcePromptTitle}</span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={!card.prompt.trim()}
            onClick={() => onUsePrompt(card)}
            title={card.prompt.trim() ? "复用提示词和参数" : "没有提示词记录"}
          >
            <Sparkles className="size-3.5" />
            复用
          </Button>
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
              ? "bg-primary text-primary-foreground shadow-sm"
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

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "未知日期"
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  })
}

function formatDuration(value: number) {
  if (!value) return "-"
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(1)} s`
}
