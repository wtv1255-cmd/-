# 提示词中心

独立本地工具，用于管理真实提示词数据、把提示词发送到图片工作台，并将生成结果整理到本地卡片图库。

## 一键启动

桌面端：

```text
dist-desktop\提示词中心 0.0.1.exe
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

CodexProxy API 地址和 Key 在图片工作台右上角“设置”里填写，只保存在本机浏览器存储。

`.env.local` 不再保存 CodexProxy 地址和密钥。

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

`backend\data\infinite-canvas.db` 保留真实提示词数据，当前 `prompts` 表为 1361 条。用户、积分、素材和设置表已清空，只作为本地提示词中心的可重建数据包使用。

如果 Electron 或 electron-builder 二进制下载慢，可以临时设置镜像：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
pnpm run desktop:build
```
