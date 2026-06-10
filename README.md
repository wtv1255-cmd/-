# 她火

独立本地工具，用于管理真实提示词数据、把提示词发送到图片工作台，并将生成结果整理到本地卡片图库。

## 一键启动

桌面端：

```text
dist-desktop\win-unpacked\她火.exe
```

桌面程序会自动启动真实提示词后端和本地 Next 前端，关闭窗口时会清理它自己启动的进程。
打包后的桌面程序会内置提示词后端 exe 和 `backend\data\infinite-canvas.db`，不需要每次手动输入启动命令。

开发脚本：

双击：

```bat
start-prompt-center.bat
```

脚本会启动：

- 真实提示词后端：`backend`
- 当前 Next 前端：`http://127.0.0.1:48218`

关闭启动窗口或按 `Ctrl+C` 会关闭前端和后端进程。

## 手动启动

```bash
cd backend
go run .
```

```bash
cd D:\GenericAgent\temp\open-design\.od\projects\4f868a81-28af-4b46-8148-eee083074202\prompt-center-shadcn
pnpm exec next dev --turbopack --port 48218
```

## 本地配置

图片工作台右上角“设置”里可以分别填写：

- 生图 API：每个生图模型都有独立的 Base URL 和 Key。`gpt-image-2*` 默认使用 `https://api.xxiaozhi.com`，Agnes Image 2.1 Flash 默认使用 `https://apihub.agnes-ai.com/v1`。
- 语言模型 API：用于反推提示词、优化提示词和规避敏感表达，默认使用 `https://ai.hybgzs.com/v1`。

这些配置只保存在本机浏览器存储。

`.env.local` 不再保存 CodexProxy 地址和密钥。

如果要打包给朋友并让首次启动自动带入默认 API 配置，可以把
`desktop-default-api-settings.example.json` 复制为
`desktop-default-api-settings.local.json` 后填写地址和 Key。这个 local
文件不会提交到 Git，但 `pnpm run desktop:build` 会把它内置进桌面包。

## 开发准备

首次拉取源码后安装依赖：

```bash
pnpm install
```

## 桌面打包

```bash
pnpm run desktop:build
```

默认会从项目内 `backend` 编译提示词后端，并复制其中的 `data\infinite-canvas.db` 到桌面包。后端源码目录变更时可以这样指定：

```powershell
$env:PROMPT_BACKEND_SOURCE_DIR='D:\path\to\prompt-backend'
pnpm run desktop:build
```

## 数据说明

`backend\data\infinite-canvas.db` 保留真实提示词数据，当前 `prompts` 表为 1361 条。用户、积分、素材和设置表已清空，只作为她火的可重建种子数据包使用。

打包后的桌面端第一次启动时，会把内置种子数据库复制到 Electron 用户数据目录：

```text
%APPDATA%\她火\data\infinite-canvas.db
```

后续同步源写入的是这份用户数据库。同步成功后，正常重新启动会读取同步后的结果；重新打包或升级也不会覆盖这份用户数据库。

图片工作台“我的图库”保存到本机浏览器 IndexedDB，生成接口返回的远程图片会先转成本地 Blob 再入库。

如果 Electron 或 electron-builder 二进制下载慢，可以临时设置镜像：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
pnpm run desktop:build
```
