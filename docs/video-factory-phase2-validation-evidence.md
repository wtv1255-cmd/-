# 视频工厂二阶段验收证据归档

## 可提交证据

- 桌面包输出：`dist-desktop/win-unpacked/她火.exe`
- 后端可执行文件：`dist-desktop/win-unpacked/resources/app/desktop-backend/prompt-backend.exe`
- 剪映草稿桥接：`dist-desktop/win-unpacked/resources/app/electron/jianying-draft.mjs`
- 用户手册：`docs/video-factory-phase2-user-manual.md`
- 打包排除测试：`tests/desktop-packaging.test.mjs`

## 已执行验证

- `node --test tests/api-profiles.test.mjs tests/video-factory-modules.test.mjs tests/video-analysis.test.mjs tests/video-assets.test.mjs`
- `pnpm exec tsc --noEmit`
- `pnpm exec eslint app/video/page.tsx tests/api-profiles.test.mjs tests/video-factory-modules.test.mjs`
- Playwright MCP 打开 `http://127.0.0.1:48606/video`，确认设置模块显示 API Profile，并明确文本和图片生成的 API Profile 设置已接入运行时主备；视频解析和发布辅助是配置预留。
- Playwright MCP 截图：`follow01-api-profile-settings.png`。

## 文案板子与品牌贴片补充验证

- `node --test tests/video-analysis.test.mjs tests/video-storyboard.test.mjs tests/video-assets.test.mjs tests/video-factory-modules.test.mjs tests/video-rendering.test.mjs tests/electron-jianying-draft.test.mjs`
- `pnpm tsc --noEmit`
- 文案板子验证：产品引流是可选板子，默认主题为豆包 + 炎灵 + 剪映；通用洗稿不强制产品名、产品图标或品牌贴片。
- 合规验证：产品引流 prompt 会降低粗口、收益承诺、保证赚钱和直接站外导流说法；最终视频口播不应直接承诺日入/月入、保证收益或要求加微信/加群。
- 分镜验证：图片提示词描述场景，不要求 AI 生图生成 logo、字幕、对话框、气泡或 App UI 文案。
- 素材验证：豆包图标、炎灵图标、剪映图标作为可选 `brand_sticker` 人工素材管理，不污染火柴人分镜图片行。
- 剪映草稿验证：产品引流板子的 `task-materials.json` 记录已上传品牌贴片素材和 `brandOverlays` 手动贴片意图；非产品板子不生成产品贴片占位。

## 包体检查

`dist-desktop/win-unpacked` 根目录包含 Electron 运行文件、`resources/app`、`desktop-backend` 和 `electron` 桥接脚本。精确递归检查没有发现以下本地 TTS 或大模型内容：

- `Index-TTS2_ZZDH`
- `checkpoints`
- `venv`
- `indextts`
- `.safetensors`
- `.ckpt`
- `.pth`

注意：Electron 自带的 `snapshot_blob.bin` 和 `v8_context_snapshot.bin` 是 Chromium/V8 运行文件，不是 TTS checkpoint。

## 受限验收

生产签名 `video_factory` license 不在仓库内，当前环境也没有可用的 `computer-use` 桌面控制工具。因此，已安装包的 post-activation 点击流没有冒充为已通过。

已完成的替代证据是：

- 桌面包已生成并可检查文件结构。
- 包体没有内置 Index-TTS2、checkpoint、venv 或常见大模型权重。
- 开发服务器 UI 已通过 Playwright 验证核心模块、恢复摘要和 API Profile 设置页；API failover 的运行时证据限定为文本和图片生成路径。
- 运行时 failover、恢复续跑、素材补图、TTS/字幕、时间线和剪映草稿合同由自动化测试覆盖。
- AI director 当前按本地结构化草稿规划验收；本阶段没有把 AI director 外部 provider failover 记录为已通过。
- 品牌贴片当前按 manifest/manual placement intent 验收；没有把剪映原生 overlay 轨道自动插入包装成已通过。

## 手工验收清单

拿到有效生产 `video_factory` license 和真实 API Profile 后，按以下步骤做安装包验收：

1. 启动 `dist-desktop/win-unpacked/她火.exe`。
2. 输入有效签名 license，确认视频工厂功能启用。
3. 在设置中配置文本模型和图片生成的主备 API Profile；视频解析和发布辅助配置只作为预留项检查。
4. 创建视频任务，执行文案生成、分镜、火柴人生图、补图、TTS、字幕、时间线和剪映草稿生成。
5. 人为让主 API 返回 503/429 或移除主 key，确认备份 profile 被使用，任务记录不出现 API Key。
6. 关闭并重启应用，确认安全步骤自动续跑，已成功图片、音频、字幕和草稿不被重做。
7. 确认发布、上传、删除、覆盖草稿和替换人工编辑结果仍要求人工确认。
