import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)

async function readVideoPage() {
  return readFile(path.join(projectRoot, "app", "video", "page.tsx"), "utf8")
}

test("video factory uses seven top modules instead of one long wall", async () => {
  const source = await readVideoPage()
  const labels = [
    "任务总览",
    "文案",
    "分镜",
    "素材",
    "配音字幕",
    "剪辑草稿",
    "设置",
  ]

  for (const label of labels) {
    assert.match(source, new RegExp(`label: "${label}"`))
  }

  assert.match(source, /aria-label="视频工厂模块"/)
  assert.match(source, /useState<VideoFactoryModuleId>\("overview"\)/)
  assert.match(source, /activeModule === "overview"/)
  assert.match(source, /activeModule === "script"/)
  assert.match(source, /activeModule === "storyboard"/)
  assert.match(source, /activeModule === "assets"/)
  assert.match(source, /activeModule === "voice"/)
  assert.match(source, /activeModule === "draft"/)
  assert.match(source, /activeModule === "settings"/)
})

test("script module exposes workflow modes passthrough and advanced rewrite channels", async () => {
  const source = await readVideoPage()

  assert.match(source, /全自动/)
  assert.match(source, /半自动/)
  assert.match(source, /原文直通/)
  assert.match(source, /显示高级改写/)
  assert.match(source, /SCRIPT_REWRITE_MODE_OPTIONS\.filter/)
  assert.match(source, /option\.label/)
  assert.match(source, /option\.description/)
  assert.match(source, /onUsePastedScript/)
  assert.match(source, /onSaveWorkflowSettings/)
})

test("script module exposes copywriting boards and optional product theme controls", async () => {
  const source = await readVideoPage()

  assert.match(source, /COPYWRITING_BOARD_OPTIONS/)
  assert.match(source, /文案板子/)
  assert.match(source, /模板/)
  assert.match(source, /option\.label/)
  assert.match(source, /option\.description/)
  assert.match(source, /引流产品\/主题/)
  assert.match(source, /DEFAULT_PRODUCT_CONVERSION_THEME/)
  assert.match(source, /scriptCopywritingBoard/)
  assert.match(source, /scriptConversionTheme/)
  assert.match(source, /copywritingBoard: effectiveCopywritingBoard/)
  assert.match(source, /conversionTheme: scriptConversionTheme/)
  assert.match(source, /copywritingBoard: scriptCopywritingBoard/)
  assert.match(source, /copywritingBoard === "product_conversion"/)
  assert.match(source, /评论区/)
  assert.match(source, /粉丝群/)
  assert.match(source, /shouldRequestTextModelForScriptMode\(effectiveRewriteMode\)/)
})

test("asset module exposes preset parameters per-shot actions and preview expansion", async () => {
  const source = await readVideoPage()

  assert.match(source, /IMAGE_GENERATION_PRESETS/)
  assert.match(source, /IMAGE_GENERATION_PRESETS\.map/)
  assert.match(source, /preset\.id/)
  assert.match(source, /preset\.label/)
  assert.match(source, /显示高级参数/)
  assert.match(source, /补图/)
  assert.match(source, /重新生成/)
  assert.match(source, /onRegenerateShot/)
  assert.match(source, /expandedAssetIds/)
  assert.match(source, /toggleVideoAssetPreviewExpansion/)
})

test("asset module exposes manual external material labels and timeline placeholders", async () => {
  const source = await readVideoPage()

  assert.match(source, /EXTERNAL_MATERIAL_LABEL_OPTIONS/)
  assert.match(source, /EXTERNAL_MATERIAL_LABEL_OPTIONS\.map/)
  assert.match(source, /option\.label/)
  assert.match(source, /用途标签/)
  assert.match(source, /onAssetLabelsChange/)
  assert.match(source, /requiredMaterialLabel/)
  assert.match(source, /externalAssets/)
})

test("voice module exposes local tts voice presets and manual audio fallback", async () => {
  const source = await readVideoPage()

  assert.match(source, /COMMON_VIDEO_TTS_VOICE_PRESETS/)
  assert.match(source, /全局默认音色/)
  assert.match(source, /任务临时音色/)
  assert.match(source, /手动音频/)
  assert.match(source, /onTaskVoicePresetChange/)
  assert.match(source, /resolveVideoTtsVoiceSelection/)
})

test("video factory records recovery strategy for resumable task state", async () => {
  const source = await readVideoPage()

  assert.match(source, /createRecoveryPlanFromSnapshot/)
  assert.match(source, /executeVideoTaskRecovery/)
  assert.match(source, /planVideoTaskRecovery/)
  assert.match(source, /recovery_plan/)
  assert.match(source, /恢复策略：已续跑/)
  assert.match(source, /恢复摘要/)
  assert.match(source, /completedStepIds\.length/)
})

test("video factory wires api profile failover into live text and image calls", async () => {
  const source = await readVideoPage()

  assert.match(source, /createApiFailoverPlan/)
  assert.match(source, /runApiProfileFailover/)
  assert.match(source, /createApiFailoverLogEntry/)
  assert.match(source, /createModuleFailoverPlan\(apiProfiles, "text_model"\)/)
  assert.match(source, /createModuleFailoverPlan\(apiProfiles, "image_generation"\)/)
  assert.match(source, /failedAttempts/)
  assert.match(source, /pauseReason/)
  assert.doesNotMatch(source, /message: .*apiKey/)
})

test("video factory scopes api profile runtime failover claims to wired modules", async () => {
  const source = await readVideoPage()

  assert.match(source, /文本和图片生成已接入运行时主备切换/)
  assert.match(source, /视频解析和发布辅助目前是配置预留/)
  assert.doesNotMatch(source, /文本、图片、视频解析和发布辅助分别选择本机保存的用户 API。Key/)
})
