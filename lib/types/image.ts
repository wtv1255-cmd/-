export type ImageMode = "text" | "edit"

export type ReversePromptMode = "reverse" | "restyle" | "wash"

export type ImageQuality = "auto" | "high" | "medium" | "low"

export type ImageOutputFormat = "png" | "webp" | "jpeg"

export type ImageBackground = "auto" | "opaque" | "transparent"

export type ImageUpscale = "" | "2k" | "4k"

export type ImageModelApiProfile = {
  apiBaseUrl: string
  apiKey: string
}

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
  modelApiProfiles: Record<string, ImageModelApiProfile>
  textApiBaseUrl: string
  textApiKey: string
}

export const DEFAULT_CODEX_PROXY_API_BASE = "https://api.xxiaozhi.com"
export const DEFAULT_AGNES_IMAGE_API_BASE = "https://apihub.agnes-ai.com/v1"
export const DEFAULT_TEXT_API_BASE = "https://ai.hybgzs.com/v1"

export type ImageStylePreset = {
  id: string
  label: string
  value: string
}

export type ImagePromptPreset = {
  id: string
  label: string
  description: string
  mode: ImageMode
  prompt: string
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
  settings: SafeImageSettings
  sourcePromptId?: string
  sourcePromptTitle?: string
}

export type SaveLocalImageCardInput = {
  blob: Blob
  title: string
  prompt: string
  tags: string[]
  settings: SafeImageSettings
  sourcePrompt?: SourcePromptSnapshot | null
}

export type SafeImageSettings = Omit<
  ImageSettings,
  "apiKey" | "textApiKey" | "modelApiProfiles"
>

export const IMAGE_SOURCE_PROMPT_STORAGE_KEY =
  "prompt-center:image-source-prompt"

export const IMAGE_MODELS = [
  { label: "Agnes Image 2.1 Flash", value: "agnes-image-2.1-flash" },
  { label: "GPT Image 2.0", value: "gpt-image-2" },
  { label: "GPT Image 2.0 1K", value: "gpt-image-2-1K" },
  { label: "GPT Image 2.0 2K", value: "gpt-image-2-2K" },
  { label: "GPT Image 2.0 4K", value: "gpt-image-2-4K" },
] as const

export const DEFAULT_IMAGE_MODEL_API_PROFILES: Record<
  string,
  ImageModelApiProfile
> = Object.fromEntries(
  IMAGE_MODELS.map((item) => [
    item.value,
    {
      apiBaseUrl:
        item.value === "agnes-image-2.1-flash"
          ? DEFAULT_AGNES_IMAGE_API_BASE
          : DEFAULT_CODEX_PROXY_API_BASE,
      apiKey: "",
    },
  ])
)

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

export const YANAI_IMAGE_PROMPT_PRESETS: ImagePromptPreset[] = [
  {
    id: "yanai-natural-beauty",
    label: "自然美颜精修",
    description: "保留本人五官，轻度肤质优化",
    mode: "edit",
    prompt:
      "请对上传的人像照片做自然、真实的轻度美颜精修，目标是像专业摄影师完成的自然修图，而不是明显滤镜或换脸效果。\n\n请严格保留同一个人的身份相似度、五官结构、脸型比例、年龄感、发型轮廓、表情、服装、背景和原始构图。不要改变脸型，不要瘦脸，不要改变眼睛、鼻子、嘴唇的形状，不要让人看起来不像本人。\n\n优化重点：轻微均匀肤色，降低暗沉、泛红和油光；保留真实皮肤纹理、毛孔、细纹和自然绒毛；轻微提亮眼神和面部重点区域；让嘴唇、眉毛、睫毛和发丝更清晰干净；优化整体白平衡、曝光、对比度和肤色。\n\n输出效果：真实摄影、人像精修、自然肤质、清爽干净、高清细节、保留本人特征。彻底避免：换脸、五官变形、过度美颜、网红脸、磨皮过强、假毛孔、过锐化、HDR 过重、肤色发灰或发橙。",
  },
  {
    id: "yanai-photo-enhance",
    label: "照片质感优化",
    description: "修正曝光、色彩、噪点和质感",
    mode: "edit",
    prompt:
      "请对上传照片做专业摄影后期优化，使它看起来像原照片被更好的相机、更好的镜头和更稳的后期处理呈现出来。\n\n请保持原始主体、人物身份、场景内容、构图、服装、姿态和背景不变，不要新增人物或物体，不要替换背景，不要改变照片含义。\n\n优化重点：修正曝光、白平衡、色温和色偏；增强局部清晰度、微对比和材质细节；降低噪点、压缩痕迹、模糊感和灰雾感；恢复高光和阴影层次；进行自然的摄影级调色。\n\n输出效果：真实照片增强、高清、自然色彩、细节清楚、层次丰富。彻底避免：AI感、插画感、换背景、改变身份、脸部变形、过度锐化、过饱和、油画感、塑料皮肤。",
  },
  {
    id: "yanai-backlight-repair",
    label: "暗光逆光修复",
    description: "提亮主体，保留真实现场氛围",
    mode: "edit",
    prompt:
      "请修复这张暗光、逆光或曝光不均的照片，让主体更清楚，同时保留现场真实氛围。\n\n请保持人物身份、五官结构、肤色基调、服装、背景、姿态和构图不变，不要重塑脸部，不要替换场景，不要添加不属于原图的光效。\n\n优化重点：提亮面部和主体区域，恢复暗部细节；压回过曝高光；平衡冷暖色温；降低暗部噪点和压缩颗粒；让整体光影更柔和自然。\n\n输出效果：自然补光、真实曝光、清晰主体、层次丰富、照片质感。彻底避免：过亮发灰、HDR 过重、脸部蜡像、肤色失真、强行换天、添加镜头光斑、改变原场景。",
  },
  {
    id: "yanai-detail-restore",
    label: "高清细节修复",
    description: "轻度去模糊，恢复真实细节",
    mode: "edit",
    prompt:
      "请对上传照片做高清细节修复和轻度去模糊处理，让它更清晰、更干净，但仍然像同一张真实照片。\n\n请严格保持原始人物身份、脸部比例、五官形状、年龄感、发型、服装、场景和构图。不要改变表情，不要替换背景，不要把照片重新画成插画或写真模板。\n\n优化重点：提升整体分辨率和边缘清晰度；恢复眼睛高光、睫毛、眉毛、发丝、皮肤纹理、衣物纹理和背景材质；降低噪点、色块、马赛克和压缩痕迹；保持自然颗粒和镜头质感；适度优化亮度、对比和色彩。\n\n输出效果：真实高清修复、自然锐化、细节增强、同一张照片更清楚。彻底避免：换脸、五官重绘、假毛孔、过度锐化光晕、AI插画感、塑料皮肤、过度降噪涂抹。",
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
  { label: "GPT-5.4 Mini", value: "gpt-5.4-mini" },
  { label: "GPT-5.3 Codex", value: "gpt-5.3-codex" },
] as const

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  model: "gpt-image-2-1K",
  size: "auto",
  quality: "auto",
  outputFormat: "png",
  background: "auto",
  upscale: "",
  count: 1,
  apiBaseUrl: DEFAULT_CODEX_PROXY_API_BASE,
  apiKey: "",
  modelApiProfiles: DEFAULT_IMAGE_MODEL_API_PROFILES,
  textApiBaseUrl: DEFAULT_TEXT_API_BASE,
  textApiKey: "",
}
