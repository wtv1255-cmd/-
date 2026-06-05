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
  category: string
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
    id: "yanai-glasses-guide",
    label: "眼镜搭配指南",
    description: "分析脸型并生成眼镜试戴对比",
    category: "形象建议",
    mode: "edit",
    prompt:
      "请根据上传的人像照片生成一张干净、现代、信息图风格的「眼镜搭配指南」。\n\n请严格保留人物身份相似度、五官结构、脸型比例、年龄感、发型、表情、服装和原始气质，不要换脸、不要美化到不像本人。\n\n画面结构：\n1. 左侧或上方放置人物原始面部参考，标注脸型、眼睛、眉毛、鼻梁、脸颊、嘴唇等关键面部特征。标签要根据照片自动判断，不要使用固定模板。每个标签用细箭头连接，并配 1-2 条短要点。\n2. 右侧或下方生成 4-6 个眼镜试戴方案，必须是同一个人，只改变眼镜款式，不改变脸部、发型和服装。\n3. 标出「推荐」「可尝试」「不建议」三类结论，说明原因要短、准、像专业形象顾问。\n\n视觉风格：极简杂志信息图、白色或浅灰背景、圆角卡片、细线条、微妙阴影、中文主导、英文辅助标签、排版清楚。标题写「眼镜搭配指南」。\n\n彻底避免：五官变形、瘦脸、换脸、过度美颜、眼镜遮挡眼睛、文字乱码、多个方案不像同一个人。",
  },
  {
    id: "yanai-hairstyle-report",
    label: "发型升级报告",
    description: "Before/After 发型顾问方案",
    category: "形象建议",
    mode: "edit",
    prompt:
      "请根据上传的正面人像照片，生成一张横向 4:3 的高完成度「AI 发型美学升级报告」。\n\n核心要求：严格保留本人身份相似度、五官结构、脸型比例、年龄感、肤色、表情气质和原始穿搭。只升级发型，不要换脸，不要瘦脸，不要磨皮美颜，不要换衣服，不要靠妆容提升效果。\n\n版式结构：\n1. 左侧为 Before 原始发型大图，尽量保留当前发型真实状态，包括长度、刘海、发量、贴头皮感、凌乱度和精神状态，不要偷偷优化。\n2. 右侧为 After 主推发型大图，同一个人、同样服装、相似光线，只改变发型。方向偏自然、生活化、低维护、精神干净，可带韩系 Clean Cut 或松弛有型质感。\n3. 中下部展示 4 个推荐发型方案卡，每张都必须是同一个人，只改变发型，并写短名称和优势。\n4. 底部展示 3 个避雷发型方案，保留红色叉号，只表现“确实不适合”，不要恶搞、不要丑化。\n5. 增加执行指南：最佳长度、刘海/鬓角/头顶/发尾/层次重点、日常打理方式、建议保养周期和自然发色推荐。\n\n视觉风格：高级时尚顾问报告、白色/米白/浅灰背景，少量浅橄榄绿、灰蓝、柔和红色做功能强调。中文主导，英文作为短标签，排版清晰、留白合理、信息丰富但不拥挤。顶部标题「AI 发型美学升级报告」。\n\n彻底避免：夸张杀马特、舞台造型、明显染漂、二次元、多个方案不像同一个人、文字乱码、把不推荐方案做成羞辱或恶搞。",
  },
  {
    id: "yanai-natural-beauty",
    label: "自然美颜精修",
    description: "保留本人五官，轻度肤质优化",
    category: "照片修复",
    mode: "edit",
    prompt:
      "请对上传的人像照片做自然、真实的轻度美颜精修，目标是像专业摄影师完成的自然修图，而不是明显滤镜或换脸效果。\n\n请严格保留同一个人的身份相似度、五官结构、脸型比例、年龄感、发型轮廓、表情、服装、背景和原始构图。不要改变脸型，不要瘦脸，不要改变眼睛、鼻子、嘴唇的形状，不要让人看起来不像本人。\n\n优化重点：轻微均匀肤色，降低暗沉、泛红和油光；保留真实皮肤纹理、毛孔、细纹和自然绒毛；轻微提亮眼神和面部重点区域；让嘴唇、眉毛、睫毛和发丝更清晰干净；优化整体白平衡、曝光、对比度和肤色。\n\n输出效果：真实摄影、人像精修、自然肤质、清爽干净、高清细节、保留本人特征。彻底避免：换脸、五官变形、过度美颜、网红脸、磨皮过强、假毛孔、过锐化、HDR 过重、肤色发灰或发橙。",
  },
  {
    id: "yanai-photo-portrait-v1",
    label: "写真随机风格 V1",
    description: "随机真人写真风格，保留原貌",
    category: "写真风格",
    mode: "edit",
    prompt:
      "请基于上传的人像照片，随机组合一种大众审美的真人写真风格，并生成一张高质量写真图。\n\n必须严格保留人物身份、五官比例、脸型、年龄感、发型基础、原始气质和人物辨识度，不要换脸，不要改变人脸比例和形象。\n\n随机选择并融合以下元素：\n1. 核心风格：细腻皮肤真实质感、日常快照抓拍、高级感时尚人像、日系清新氛围、电影感光影故事、水润通透感写真。\n2. 机位和景别：俯视、仰视、平视、侧面；脸部特写、半身肖像、全身。\n3. 场景：阳光室外、简约室内、夜晚城市街道、咖啡馆窗边、海边、艺术展厅、隔着水汽玻璃。\n4. 光线：自然柔光、戏剧性侧光、昏暗环境聚光、水波反射光斑、闪光灯快照感。\n5. 氛围细节：自然松弛、直视镜头、高冷魅惑、温柔低垂、忧郁安静、微风发丝、湿发贴脸、手部互动、轻微动态模糊、胶片颗粒、镜头噪点、漂浮粒子、水珠微光。\n\n输出要求：画面真实、健康、积极、非二次元、非油画、非赛博朋克、非哥特。请在画面中保持原比例、原比例、原比例。",
  },
  {
    id: "yanai-photo-portrait-v2",
    label: "写真随机风格 V2",
    description: "商业摄影感人像氛围",
    category: "写真风格",
    mode: "edit",
    prompt:
      "请基于上传的人像照片，生成一张商业摄影感真人写真。请随机创造一种独特但大众容易接受的摄影风格，重点放在氛围、光影、质感、色彩和构图上。\n\n必须保留人物身份相似度、五官比例、脸型、年龄感、发型基础、表情气质和人物辨识度，不要换脸，不要重塑五官，不要生成插画或 3D 渲染。\n\n可从以下方向中随机融合：\n- 场景情绪：清晨窗边的慵懒、都市夜游的疏离、夏日午后的宁静、与宠物互动的温馨、雨后街头、展厅侧光。\n- 摄影基调：日系清新、随性抓拍、时尚杂志、电影故事感、暗调情绪、柔焦空气感。\n- 光影色彩：柔和散射光、硬朗直射光、黄金时刻光、百叶窗光束、水面反射光；冷调蓝白、暖调橘棕、低饱和莫兰迪、浓郁墨绿或深蓝。\n- 构图视角：正面、侧面、45 度、俯拍、仰拍；中心构图、三分法、引导线；面部特写、半身、全身。\n- 质感细节：真实皮肤纹理、微汗水光、自然雀斑、空气微尘、镜头光晕、湿润发丝、衣服褶皱、轻微胶片颗粒。\n\n输出效果：高级、真实、有记忆点、像商业摄影师完成的写真，不要小众怪异风格，不要过度模板化。",
  },
  {
    id: "yanai-photo-enhance",
    label: "照片质感优化",
    description: "修正曝光、色彩、噪点和质感",
    category: "照片修复",
    mode: "edit",
    prompt:
      "请对上传照片做专业摄影后期优化，使它看起来像原照片被更好的相机、更好的镜头和更稳的后期处理呈现出来。\n\n请保持原始主体、人物身份、场景内容、构图、服装、姿态和背景不变，不要新增人物或物体，不要替换背景，不要改变照片含义。\n\n优化重点：修正曝光、白平衡、色温和色偏；增强局部清晰度、微对比和材质细节；降低噪点、压缩痕迹、模糊感和灰雾感；恢复高光和阴影层次；进行自然的摄影级调色。\n\n输出效果：真实照片增强、高清、自然色彩、细节清楚、层次丰富。彻底避免：AI感、插画感、换背景、改变身份、脸部变形、过度锐化、过饱和、油画感、塑料皮肤。",
  },
  {
    id: "yanai-backlight-repair",
    label: "暗光逆光修复",
    description: "提亮主体，保留真实现场氛围",
    category: "照片修复",
    mode: "edit",
    prompt:
      "请修复这张暗光、逆光或曝光不均的照片，让主体更清楚，同时保留现场真实氛围。\n\n请保持人物身份、五官结构、肤色基调、服装、背景、姿态和构图不变，不要重塑脸部，不要替换场景，不要添加不属于原图的光效。\n\n优化重点：提亮面部和主体区域，恢复暗部细节；压回过曝高光；平衡冷暖色温；降低暗部噪点和压缩颗粒；让整体光影更柔和自然。\n\n输出效果：自然补光、真实曝光、清晰主体、层次丰富、照片质感。彻底避免：过亮发灰、HDR 过重、脸部蜡像、肤色失真、强行换天、添加镜头光斑、改变原场景。",
  },
  {
    id: "yanai-detail-restore",
    label: "高清细节修复",
    description: "轻度去模糊，恢复真实细节",
    category: "照片修复",
    mode: "edit",
    prompt:
      "请对上传照片做高清细节修复和轻度去模糊处理，让它更清晰、更干净，但仍然像同一张真实照片。\n\n请严格保持原始人物身份、脸部比例、五官形状、年龄感、发型、服装、场景和构图。不要改变表情，不要替换背景，不要把照片重新画成插画或写真模板。\n\n优化重点：提升整体分辨率和边缘清晰度；恢复眼睛高光、睫毛、眉毛、发丝、皮肤纹理、衣物纹理和背景材质；降低噪点、色块、马赛克和压缩痕迹；保持自然颗粒和镜头质感；适度优化亮度、对比和色彩。\n\n输出效果：真实高清修复、自然锐化、细节增强、同一张照片更清楚。彻底避免：换脸、五官重绘、假毛孔、过度锐化光晕、AI插画感、塑料皮肤、过度降噪涂抹。",
  },
  {
    id: "yanai-cutie-3d-style",
    label: "3D Cutie 风格",
    description: "圆润软萌，极简 3D 插画",
    category: "设计模板",
    mode: "text",
    prompt:
      "请生成一张 cutie style 的极简 3D 插画。主体是：【在这里填写主体】。\n\n风格要求：\n- 形体语言：柔软、圆润、厚实、无尖锐边缘，轮廓简化，整体友好、有触感。\n- 构图：单个主体居中，周围留出充足空白，三分之四俯视角，主体可以轻微悬浮或有柔和落地阴影。\n- 色彩：根据主体材质选择自然色，如金属银、木质棕、天空蓝、陶瓷白；饱和度适中，避免刺眼。\n- 光照：顶部偏右柔和漫反射光，低对比，柔和椭圆阴影。\n- 材质：哑光或轻微缎面质感；玻璃半透明、边缘柔和；金属为柔和拉丝或阳极氧化质感，避免镜面强反射。\n- 背景：纯净中性色，如暖灰、米白、浅沙色，与主体协调。\n- 渲染：干净 3D render、soft ambient occlusion、简化几何、无复杂贴图、细节适中。\n\n整体效果：温暖、现代、可爱、像产品设计和现代 UI 系统里的高级 3D 图标。",
  },
  {
    id: "yanai-xiaohongshu-poster",
    label: "小红书风格海报",
    description: "拼贴手帐感社媒海报",
    category: "设计模板",
    mode: "text",
    prompt:
      "请生成一张小红书风格图片海报。主题是：【在这里填写主题，如城市旅行、美食探索、自然风光、周末闲逛、产品种草】。\n\n默认竖版 3:4。如果用户写明横版，则使用 4:3。\n\n视觉要求：\n- 风格：活泼、明亮、年轻化、社交媒体感，像小红书活动海报或攻略封面。\n- 版式：拼贴风、手帐风、贴纸风、杂志感混合；中心主标题清晰，周围散落照片贴纸、手绘箭头、气泡、标签和小装饰。\n- 色彩：粉色、亮黄、草绿、天蓝、奶油白等 pastel palette，可根据主题加入一个强调色。\n- 元素：相关场景照片感贴纸、手绘线条、中文英文混排标题、日期范围、角标标签、圆角边框和轻微阴影。\n- 文案：中文为主，英文短标签辅助，例如 City Guide、Weekend Plan、Food Map、Travel Notes。\n- 画面：信息丰富但不拥挤，留白合理，像真实可发布的社媒封面。\n\n请避免文字乱码、低质拼贴、脏乱背景、过度渐变、元素堆满画面。",
  },
  {
    id: "yanai-handwritten-notes",
    label: "手写笔记风格",
    description: "结构化笔记和手绘批注",
    category: "设计模板",
    mode: "text",
    prompt:
      "请把主题【在这里填写主题】生成一张手写笔记风格的信息图。\n\n版式要求：\n- 布局可为横向或竖向，默认竖向 3:4；内容必须清晰完整，不能挤压。\n- 字体大小适中，像真实课堂笔记或手帐整理页。\n- 结构清楚：主标题醒目，一级重点用彩色底纹或波浪下划线，普通内容用标准墨色，强调内容用另一种墨色。\n- 加入相关手绘小图、简笔插画、箭头、框线、便利贴、胶带、圈注和轻微涂鸦。\n- 可以加入拼贴式图片碎片或小图标，并在上面做手写批注。\n- 语言默认中文；如果用户指定英文或其他语言，请确保文字准确、字符标准、语法自然。\n\n视觉风格：清爽、学习感、可读性强、像真实人手整理的高质量笔记，不要生成乱码，不要堆太多无意义小字。",
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
