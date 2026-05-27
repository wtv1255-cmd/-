export type ImageMode = "text" | "edit"

export type ReversePromptMode = "reverse" | "restyle" | "wash"

export type ImageQuality = "auto" | "high" | "medium" | "low"

export type ImageOutputFormat = "png" | "webp" | "jpeg"

export type ImageBackground = "auto" | "opaque" | "transparent"

export type ImageUpscale = "" | "2k" | "4k"

export type ImageSettings = {
  model: string
  size: string
  quality: ImageQuality
  outputFormat: ImageOutputFormat
  background: ImageBackground
  upscale: ImageUpscale
  count: number
  apiBaseUrl: string
  apiKey: string
}

export type ImageStylePreset = {
  id: string
  label: string
  value: string
}

export type ImageReference = {
  id: string
  name: string
  url: string
  file: File
}

export type CodexImageResult = {
  id: string
  dataUrl?: string
  url?: string
  revisedPrompt?: string
  mimeType?: string
}

export type CodexImageResponse = {
  images: CodexImageResult[]
}

export type GeneratedImage = {
  id: string
  url: string
  blob: Blob
  width: number
  height: number
  bytes: number
  mimeType: string
  durationMs: number
}

export type GenerationResult = {
  id: string
  status: "pending" | "success" | "failed"
  image?: GeneratedImage
  error?: string
}

export type SourcePromptSnapshot = {
  id: string
  title: string
  prompt: string
  tags: string[]
  category: string
  coverUrl?: string
}

export type LocalImageCard = {
  id: string
  title: string
  prompt: string
  createdAt: string
  updatedAt: string
  imageKey: string
  width: number
  height: number
  bytes: number
  mimeType: string
  tags: string[]
  settings: Omit<ImageSettings, "apiKey">
  sourcePromptId?: string
  sourcePromptTitle?: string
}

export type SaveLocalImageCardInput = {
  blob: Blob
  title: string
  prompt: string
  tags: string[]
  settings: Omit<ImageSettings, "apiKey">
  sourcePrompt?: SourcePromptSnapshot | null
}

export const IMAGE_SOURCE_PROMPT_STORAGE_KEY =
  "prompt-center:image-source-prompt"

export const IMAGE_MODELS = [
  { label: "gpt-image-2", value: "gpt-image-2" },
  { label: "gpt-image-2-2k", value: "gpt-image-2-2k" },
  { label: "gpt-image-2-4k", value: "gpt-image-2-4k" },
] as const

export const IMAGE_SIZE_OPTIONS = [
  { label: "Auto", value: "auto" },
  { label: "1024x1024", value: "1024x1024" },
  { label: "1536x864", value: "1536x864" },
  { label: "864x1536", value: "864x1536" },
  { label: "2048x2048", value: "2048x2048" },
  { label: "2560x1440", value: "2560x1440" },
  { label: "1440x2560", value: "1440x2560" },
  { label: "3840x2160", value: "3840x2160" },
  { label: "2160x3840", value: "2160x3840" },
  { label: "2880x2880", value: "2880x2880" },
] as const

export const IMAGE_QUALITY_OPTIONS: Array<{
  label: string
  value: ImageQuality
}> = [
  { label: "Auto", value: "auto" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
]

export const IMAGE_FORMAT_OPTIONS: Array<{
  label: string
  value: ImageOutputFormat
}> = [
  { label: "PNG", value: "png" },
  { label: "WebP", value: "webp" },
  { label: "JPEG", value: "jpeg" },
]

export const IMAGE_BACKGROUND_OPTIONS: Array<{
  label: string
  value: ImageBackground
}> = [
  { label: "自动", value: "auto" },
  { label: "不透明", value: "opaque" },
  { label: "透明", value: "transparent" },
]

export const IMAGE_UPSCALE_OPTIONS: Array<{
  label: string
  value: ImageUpscale
}> = [
  { label: "不放大", value: "" },
  { label: "2K", value: "2k" },
  { label: "4K", value: "4k" },
]

export const IMAGE_STYLE_PRESETS: ImageStylePreset[] = [
  {
    id: "cinematic",
    label: "电影感写实",
    value:
      "Cinematic realistic photography, natural light, subtle film grain, rich but controlled color grading, soft shadows, professional composition, high detail.",
  },
  {
    id: "commerce",
    label: "电商主图",
    value:
      "Clean commercial product photography, premium studio lighting, crisp edges, realistic materials, neutral background, catalog-ready composition, high detail.",
  },
  {
    id: "sticker",
    label: "透明贴纸",
    value:
      "Cute sticker illustration, bold clean outline, simple readable shapes, vibrant colors, playful expression, isolated subject, transparent-background friendly.",
  },
  {
    id: "toy",
    label: "3D 潮玩",
    value:
      "Premium 3D designer toy style, soft rounded forms, glossy vinyl material, studio render lighting, collectible figure presentation, charming details.",
  },
  {
    id: "icon",
    label: "扁平图标",
    value:
      "Modern flat vector icon style, geometric shapes, simple silhouette, balanced negative space, clean edges, limited color palette, app-icon ready.",
  },
  {
    id: "poster",
    label: "复古海报",
    value:
      "Vintage editorial poster style, bold typography space, textured print grain, strong focal composition, retro color palette, dramatic visual hierarchy.",
  },
  {
    id: "anime",
    label: "动漫插画",
    value:
      "Polished anime illustration style, expressive character design, clean line art, soft cel shading, luminous color accents, detailed atmosphere.",
  },
  {
    id: "wallpaper",
    label: "极简壁纸",
    value:
      "Minimal premium wallpaper style, spacious composition, refined lighting, elegant color contrast, calm background depth, suitable for desktop or mobile wallpaper.",
  },
]

export const DEFAULT_NEGATIVE_PROMPT_SUFFIX =
  "不要二次元，不要3D CG，不要摄影棚大片，不要低质粗糙照片，不要过度噪点，不要明显脏感，不要过度磨皮，不要塑料皮肤，不要畸形手指，不要多余手指，不要背景纯白。"

export const REVERSE_PROMPT_MODES: Array<{
  label: string
  value: ReversePromptMode
}> = [
  { label: "精准反推", value: "reverse" },
  { label: "换风格", value: "restyle" },
  { label: "洗图", value: "wash" },
]

export const TEXT_MODEL_OPTIONS = [
  { label: "GPT-5.5", value: "gpt-5.5" },
  { label: "GPT-5.4", value: "gpt-5.4" },
  { label: "GPT-4o", value: "gpt-4o" },
  { label: "GPT-4.1", value: "gpt-4.1" },
] as const

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  model: "gpt-image-2",
  size: "auto",
  quality: "auto",
  outputFormat: "png",
  background: "auto",
  upscale: "",
  count: 1,
  apiBaseUrl: "",
  apiKey: "",
}
