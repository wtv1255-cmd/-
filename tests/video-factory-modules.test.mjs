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

async function readVideoAssets() {
  return readFile(path.join(projectRoot, "lib", "video-assets.ts"), "utf8")
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

test("video factory shows persistent task progress header and run console across modules", async () => {
  const source = await readVideoPage()

  assert.match(source, /TaskProgressHeader/)
  assert.match(source, /TaskRunConsole/)
  assert.match(source, /ModuleProgressStrip/)
  assert.match(source, /TaskRunEventList/)
  assert.match(source, /TaskRunFailurePanel/)
  assert.match(source, /任务运行控制台/)
  assert.match(source, /实时日志/)
  assert.match(source, /总进度/)
  assert.match(source, /暂无运行日志/)
  assert.match(source, /grid-cols-\[minmax\(0,1fr\)_360px\]/)
  assert.match(source, /max-xl:grid-cols-1/)
})

test("video factory restores task run logs through desktop progress ipc", async () => {
  const source = await readVideoPage()

  assert.match(source, /readTaskRunEvents/)
  assert.match(source, /readTaskRunSummary/)
  assert.match(source, /appendTaskRunEvent/)
  assert.match(source, /reportTaskProgress/)
  assert.match(source, /setTaskRunEvents/)
  assert.match(source, /setTaskRunSummary/)
})

test("video factory reports progress for script images tts and Jianying draft paths", async () => {
  const source = await readVideoPage()

  assert.match(source, /stage: "script"[\s\S]*state: "running"/)
  assert.match(source, /stage: "script"[\s\S]*state: "success"/)
  assert.match(source, /stage: "script"[\s\S]*state: "failed"/)
  assert.match(source, /stage: "images"[\s\S]*current:/)
  assert.match(source, /stage: "images"[\s\S]*total:/)
  assert.match(source, /state: "fallback"/)
  assert.match(source, /stage: "voice"[\s\S]*IndexTTS2/)
  assert.match(source, /stage: "voice"[\s\S]*state: "success"/)
  assert.match(source, /stage: "voice"[\s\S]*state: "failed"/)
  assert.match(source, /stage: "draft"[\s\S]*state: "artifact"/)
  assert.match(source, /artifact: \{[\s\S]*kind: "jianying_draft"/)
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
  assert.match(source, /selectedDuration/)
  assert.match(source, /onDurationChange/)
  assert.match(source, /durationPreset: selectedDuration/)
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
  assert.match(source, /补齐缺失/)
  assert.match(source, /全部重新生成/)
  assert.match(source, /重新生成/)
  assert.match(source, /onRegenerateShot/)
  assert.match(source, /onRegenerateAllStickman/)
  assert.match(source, /prepareStickmanRegenerationBatch/)
  assert.match(source, /clearExistingTargets/)
  assert.match(source, /stickmanGenerationQueueRef/)
  assert.match(source, /enqueueStickmanGeneration/)
  assert.match(source, /removeVideoAssetFromInventory/)
  assert.match(source, /缺图/)
  assert.match(source, /previewAsset/)
  assert.match(source, /fixed inset-0/)
  assert.match(source, /max-h-\[calc\(100svh-5rem\)\]/)
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

test("asset module exposes optional product icon brand sticker labels", async () => {
  const pageSource = await readVideoPage()
  const assetSource = await readVideoAssets()

  assert.match(pageSource, /VIDEO_ASSET_CATEGORY_OPTIONS\.map/)
  assert.match(pageSource, /EXTERNAL_MATERIAL_LABEL_OPTIONS\.map/)
  assert.match(assetSource, /brand_sticker/)
  assert.match(assetSource, /品牌贴片/)
  assert.match(assetSource, /doubao_icon/)
  assert.match(assetSource, /豆包图标/)
  assert.match(assetSource, /yanling_icon/)
  assert.match(assetSource, /炎灵图标/)
  assert.match(assetSource, /jianying_icon/)
  assert.match(assetSource, /剪映图标/)
})

test("storyboard module can delete a shot and keeps prompt edits feeding asset regeneration", async () => {
  const source = await readVideoPage()

  assert.match(source, /onDeleteShot/)
  assert.match(source, /deleteStoryboardShot/)
  assert.match(source, /deleteStoryboardShotAndReindex/)
  assert.match(source, /删除/)
  assert.match(source, /storyboard_shot_deleted/)
  assert.match(source, /generateStickmanStoryboardAsset\({[\s\S]*shot,/)
  assert.match(source, /onUpdateShot\(shot\.id, \{ prompt: event\.target\.value \}\)/)
})

test("asset module keeps generated stickman images in shot rows, not duplicate inventory rows", async () => {
  const source = await readVideoPage()

  assert.match(source, /visibleInventoryAssets/)
  assert.match(source, /isGeneratedStickmanInventoryAsset/)
  assert.match(source, /const shotAssetLabels = shotAsset/)
  assert.match(source, /onAssetLabelsChange\(\s*shotAsset\.id/)
  assert.match(source, /onRemoveAsset\(shotAsset\.id\)/)
  assert.match(source, /外部素材库存/)
  assert.match(source, /自动生成的火柴人图已合并到上方分镜行/)
})

test("asset module can export generated images directly to a Jianying draft", async () => {
  const source = await readVideoPage()

  assert.match(source, /导出图片到剪映草稿/)
  assert.match(source, /exportImageAssetsToJianyingDraft/)
  assert.match(source, /createImageAssetsDraftTimeline/)
  assert.match(source, /onExportImagesToDraft/)
  assert.match(source, /generatedStickmanShotCount === 0/)
  assert.match(source, /kind: "asset_images_jianying_draft"/)
  assert.match(source, /promptCenterDesktop\?\.createJianyingDraft/)
})

test("desktop Jianying export prefers native imported draft path when available", async () => {
  const source = await readVideoPage()

  assert.match(source, /draftResult\.nativeDraftPath \|\| draftResult\.draftPath/)
  assert.match(source, /剪映原生草稿已导入/)
  assert.match(source, /原生导入未完成/)
})

test("edit draft module lets users choose the native Jianying draft root", async () => {
  const source = await readVideoPage()

  assert.match(source, /选择剪映草稿目录/)
  assert.match(source, /jianyingDraftsRoot/)
  assert.match(source, /selectJianyingDraftsRoot/)
  assert.match(source, /window\.promptCenterDesktop\?\.selectJianyingDraftsRoot/)
  assert.match(source, /desktopDraft\(\{[\s\S]*jianyingDraftsRoot/)
  assert.match(source, /JianyingPro Drafts/)
})

test("single-shot regenerate remains queueable while image generation is running", async () => {
  const source = await readVideoPage()

  assert.match(source, /const regenerateStickmanShot = \(shotId: string\) =>/)
  assert.match(source, /enqueueStickmanGeneration/)
  assert.match(source, /pendingShotIds/)
  assert.doesNotMatch(source, /disabled=\{generatingStickman\}\s+onClick=\{\(\) => onRegenerateShot\(shot\.id\)\}/)
  assert.match(source, /\{generatingStickman && !queued \? "加入队列" : "重新生成"\}/)
})

test("voice module exposes local tts voice presets and manual audio fallback", async () => {
  const source = await readVideoPage()

  assert.match(source, /COMMON_VIDEO_TTS_VOICE_PRESETS/)
  assert.match(source, /云端 TTS/)
  assert.match(source, /cloud_tts/)
  assert.match(source, /全局默认音色/)
  assert.match(source, /任务临时音色/)
  assert.match(source, /参考音频/)
  assert.match(source, /音色样本/)
  assert.match(source, /选择音频/)
  assert.match(source, /手动音频/)
  assert.match(source, /manualAudioPath/)
  assert.match(source, /referenceAudioPath/)
  assert.match(source, /selectAudioFile/)
  assert.match(source, /apiProfileServiceLabels\.cloud_tts/)
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

test("task list can delete a task and clear its local cache without deleting Jianying drafts", async () => {
  const source = await readVideoPage()

  assert.match(source, /onDeleteTask/)
  assert.match(source, /deleteVideoTask/)
  assert.match(source, /deleteVideoTaskSnapshot/)
  assert.match(source, /promptCenterDesktop\?\.deleteTaskCache/)
  assert.match(source, /删除任务/)
  assert.match(source, /仅删除她火本地缓存/)
  assert.match(source, /剪映草稿不会删除/)
})

test("video factory wires api profile failover into live text image and EDP calls", async () => {
  const source = await readVideoPage()

  assert.match(source, /createApiFailoverPlan/)
  assert.match(source, /runApiProfileFailover/)
  assert.match(source, /createApiFailoverLogEntry/)
  assert.match(source, /createModuleFailoverPlan\(apiProfiles, "text_model"\)/)
  assert.match(source, /createModuleFailoverPlan\(apiProfiles, "image_generation"\)/)
  assert.match(source, /createModuleFailoverPlan\(apiProfiles, "edit_director"\)/)
  assert.match(source, /requestAiDirectorGeneration/)
  assert.match(source, /createModelEditDecisionPlan/)
  assert.match(source, /createJianyingAiDirectorFromEditDecisionPlan/)
  assert.match(source, /failedAttempts/)
  assert.match(source, /pauseReason/)
  assert.doesNotMatch(source, /message: .*apiKey/)
})

test("video factory scopes api profile runtime failover claims to wired modules", async () => {
  const source = await readVideoPage()

  assert.match(source, /文本、图片和剪辑决策已接入运行时主备切换/)
  assert.match(source, /云端 TTS、视频解析和发布辅助目前是配置预留/)
  assert.doesNotMatch(source, /文本、图片、视频解析和发布辅助分别选择本机保存的用户 API。Key/)
})

test("edit draft module exposes AI director controls and keeps editable draft as primary output", async () => {
  const source = await readVideoPage()

  assert.match(source, /生成 AI 剪辑决策/)
  assert.match(source, /aiDirectorStatus/)
  assert.match(source, /onGenerateAiDirectorPlan/)
  assert.match(source, /AI 剪辑决策/)
  assert.match(source, /createJianyingDraftPlan\({[\s\S]*aiDirectorPlan/)
  assert.match(source, /剪映可编辑草稿/)
})

test("edit draft module routes AI through EditDecisionPlan before Jianying adaptation", async () => {
  const source = await readVideoPage()

  assert.match(source, /buildEditDecisionGenerationRequest/)
  assert.match(source, /createBasicEditDecisionPlan/)
  assert.match(source, /createModelEditDecisionPlan/)
  assert.match(source, /createJianyingAiDirectorFromEditDecisionPlan/)
  assert.match(source, /editDecisionPlan/)
  assert.match(source, /AI 精剪决策已写入统一 EDP/)
  assert.doesNotMatch(source, /一键全自动生成/)
})

test("edit draft module keeps long AI director errors from breaking layout", async () => {
  const source = await readVideoPage()

  assert.match(source, /break-words/)
  assert.match(source, /whitespace-normal/)
  assert.doesNotMatch(
    source,
    /<span className="min-w-0 truncate font-mono">\{aiDirectorStatus\}<\/span>/
  )
})
