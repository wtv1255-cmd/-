import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
} from "electron"
import { execFileSync, spawn } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const PREFERRED_FRONTEND_PORT = 48218
const FRONTEND_PORT_CANDIDATES = [48218, 48219, 48220, 48221, 48222]
const PREFERRED_BACKEND_PORT = 8080
const BACKEND_PORT_CANDIDATES = [8080, 18080, 18081, 18082, 18083]
const HOST = "127.0.0.1"
const isDev = !app.isPackaged
const projectDir = isDev
  ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  : app.getAppPath()
const FALLBACK_BACKEND_DIR =
  process.env.PROMPT_BACKEND_SOURCE_DIR || path.join(projectDir, "backend")
const bundledBackendDir = path.join(projectDir, "desktop-backend")
const bundledBackendExe = path.join(
  bundledBackendDir,
  process.platform === "win32" ? "prompt-backend.exe" : "prompt-backend"
)
const windowIcon = path.join(projectDir, "desktop-assets", "icon.ico")
const preloadPath = path.join(projectDir, "electron", "preload.cjs")
const defaultApiSettingsPath = path.join(
  projectDir,
  "desktop-default-api-settings.json"
)
const childProcesses = []

let mainWindow = null
let frontendPort = PREFERRED_FRONTEND_PORT
let backendPort = PREFERRED_BACKEND_PORT

app.setName("她火")
nativeTheme.themeSource = "dark"

function applyWindowTheme(theme) {
  const resolvedTheme = theme === "light" ? "light" : "dark"
  nativeTheme.themeSource = resolvedTheme
  mainWindow?.setBackgroundColor(
    resolvedTheme === "light" ? "#ffffff" : "#0a0a0a"
  )
}

ipcMain.on("prompt-center:set-theme", (_event, theme) => {
  applyWindowTheme(theme)
})

ipcMain.handle("ta-huo:read-default-api-settings", () => {
  try {
    if (!fs.existsSync(defaultApiSettingsPath)) return null
    return JSON.parse(fs.readFileSync(defaultApiSettingsPath, "utf8"))
  } catch (error) {
    logStartup(
      `读取默认 API 配置失败：${error instanceof Error ? error.message : String(error)}`
    )
    return null
  }
})

function logStartup(message) {
  try {
    const logPath = path.join(app.getPath("userData"), "startup.log")
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`)
  } catch {}
}

function readRegistryValue(name) {
  if (process.platform !== "win32") return ""

  try {
    const output = execFileSync(
      "reg",
      [
        "query",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        name,
      ],
      { encoding: "utf8", windowsHide: true }
    )
    const line = output
      .split(/\r?\n/)
      .find((item) => item.trim().startsWith(name))
    const match = line?.match(/\s+REG_\w+\s+(.+)$/)
    return match?.[1]?.trim() || ""
  } catch {
    return ""
  }
}

function normalizeProxyValue(value) {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed
  return `http://${trimmed}`
}

function parseProxyServer(value) {
  const raw = value.trim()
  if (!raw) return {}

  if (!raw.includes("=")) {
    const proxy = normalizeProxyValue(raw)
    return { httpProxy: proxy, httpsProxy: proxy }
  }

  const entries = Object.fromEntries(
    raw
      .split(";")
      .map((item) => item.split("="))
      .filter(([key, proxy]) => key && proxy)
      .map(([key, proxy]) => [
        key.trim().toLowerCase(),
        normalizeProxyValue(proxy),
      ])
  )
  return {
    httpProxy: entries.http || entries.https || entries.socks || "",
    httpsProxy: entries.https || entries.http || entries.socks || "",
  }
}

function getSystemProxyEnv() {
  if (
    process.env.HTTP_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.https_proxy
  ) {
    return {}
  }

  const proxyEnabled = readRegistryValue("ProxyEnable")
  if (proxyEnabled !== "0x1" && proxyEnabled !== "1") return {}

  const { httpProxy, httpsProxy } = parseProxyServer(
    readRegistryValue("ProxyServer")
  )
  const proxyEnv = {}
  if (httpProxy) {
    proxyEnv.HTTP_PROXY = httpProxy
    proxyEnv.http_proxy = httpProxy
  }
  if (httpsProxy) {
    proxyEnv.HTTPS_PROXY = httpsProxy
    proxyEnv.https_proxy = httpsProxy
  }
  if (httpProxy || httpsProxy) {
    proxyEnv.NO_PROXY = "127.0.0.1,localhost,::1"
    proxyEnv.no_proxy = proxyEnv.NO_PROXY
    logStartup(`检测到系统代理，已用于本地后端：${httpsProxy || httpProxy}`)
  }
  return proxyEnv
}

function prepareUserDatabase(seedDbPath) {
  const dataDir = path.join(app.getPath("userData"), "data")
  const userDbPath = path.join(dataDir, "infinite-canvas.db")
  const legacyDbPath = path.join(
    app.getPath("appData"),
    "prompt-center-desktop",
    "data",
    "infinite-canvas.db"
  )

  fs.mkdirSync(dataDir, { recursive: true })
  if (!fs.existsSync(userDbPath)) {
    if (fs.existsSync(legacyDbPath)) {
      fs.copyFileSync(legacyDbPath, userDbPath)
      logStartup(`已继承旧版同步数据库：${legacyDbPath}`)
    } else if (fs.existsSync(seedDbPath)) {
      fs.copyFileSync(seedDbPath, userDbPath)
      logStartup(`初始化用户数据库：${userDbPath}`)
    }
  }

  return userDbPath
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: HOST, port })
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("error", () => resolve(false))
    socket.setTimeout(700, () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function isPromptBackendReady(port) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)

  try {
    const response = await fetch(`http://${HOST}:${port}/api/health`, {
      cache: "no-store",
      signal: controller.signal,
    })
    const text = await response.text()
    return response.ok && text.trim() === "ok"
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function isTaHuoFrontendReady(port) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)

  try {
    const response = await fetch(`http://${HOST}:${port}`, {
      cache: "no-store",
      signal: controller.signal,
    })
    const text = await response.text()
    return response.ok && text.includes("<title>她火</title>")
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function findBackendPort() {
  for (const port of BACKEND_PORT_CANDIDATES) {
    if (await isPromptBackendReady(port)) {
      return { port, reuse: true }
    }
    if (!(await isPortOpen(port))) {
      return { port, reuse: false }
    }
    logStartup(`端口 ${port} 已被非她火服务占用，尝试备用端口`)
  }

  for (let port = 18084; port < 18120; port += 1) {
    if (!(await isPortOpen(port))) return { port, reuse: false }
  }

  throw new Error("没有可用的提示词后端端口")
}

async function findFrontendPort() {
  for (const port of FRONTEND_PORT_CANDIDATES) {
    if (await isTaHuoFrontendReady(port)) {
      return { port, reuse: true }
    }
    if (!(await isPortOpen(port))) {
      return { port, reuse: false }
    }
    logStartup(`端口 ${port} 已被非她火前端占用，尝试备用端口`)
  }

  for (let port = 48223; port < 48260; port += 1) {
    if (!(await isPortOpen(port))) return { port, reuse: false }
  }

  throw new Error("没有可用的她火前端端口")
}

async function waitForPort(port, timeoutMs = 45000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(port)) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`本地端口 ${port} 启动超时`)
}

async function waitForPromptBackend(port, timeoutMs = 45000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPromptBackendReady(port)) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`提示词后端 ${port} 启动超时`)
}

function startChild(label, command, args, cwd, env = {}) {
  const useShell = command === "go" || command === "pnpm"
  logStartup(`${label} 启动：${command} ${args.join(" ")}，cwd=${cwd}`)
  const child = spawn(command, args, {
    cwd,
    shell: useShell,
    stdio: isDev ? "inherit" : "ignore",
    env: {
      ...process.env,
      ...env,
    },
  })
  childProcesses.push(child)
  child.on("error", (error) => {
    logStartup(`${label} 启动失败：${error.message}`)
  })
  child.on("exit", (code) => {
    logStartup(`${label} 已退出：${code ?? 0}`)
    if (code && isDev) console.log(`${label} 已退出：${code}`)
  })
  return child
}

function findStandaloneServer(standaloneDir) {
  const directServer = path.join(standaloneDir, "server.js")
  if (fs.existsSync(directServer)) return directServer

  const queue = [standaloneDir]
  while (queue.length) {
    const currentDir = queue.shift()
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue
      const entryPath = path.join(currentDir, entry.name)
      if (entry.isFile() && entry.name === "server.js") return entryPath
      if (entry.isDirectory()) queue.push(entryPath)
    }
  }

  throw new Error("没有找到 Next standalone server.js。请重新构建桌面端。")
}

async function startBackend() {
  logStartup(`准备启动后端：appPath=${projectDir}，packaged=${app.isPackaged}`)
  const selectedBackend = await findBackendPort()
  backendPort = selectedBackend.port
  if (selectedBackend.reuse) {
    logStartup(`复用已启动的提示词后端：http://${HOST}:${backendPort}`)
    return
  }

  if (fs.existsSync(bundledBackendExe)) {
    const userDbPath = prepareUserDatabase(
      path.join(bundledBackendDir, "data", "infinite-canvas.db")
    )
    logStartup(`使用内置后端：${bundledBackendExe}`)
    startChild("提示词后端", bundledBackendExe, [], bundledBackendDir, {
      ...getSystemProxyEnv(),
      PORT: String(backendPort),
      STORAGE_DRIVER: "sqlite",
      DATABASE_DSN: userDbPath,
      IMAGE_CACHE_DIR: path.join(app.getPath("userData"), "image-cache"),
    })
    await waitForPromptBackend(backendPort, 45000)
    return
  }

  if (!fs.existsSync(FALLBACK_BACKEND_DIR)) {
    throw new Error(
      "没有找到提示词后端。请重新打包桌面端，或确认开发后端目录存在。"
    )
  }

  logStartup(`使用开发后端：${FALLBACK_BACKEND_DIR}`)
  startChild("提示词后端", "go", ["run", "."], FALLBACK_BACKEND_DIR, {
    ...getSystemProxyEnv(),
    PORT: String(backendPort),
  })
  await waitForPromptBackend(backendPort, 45000)
}

async function startFrontend() {
  logStartup("准备启动前端")
  const selectedFrontend = await findFrontendPort()
  frontendPort = selectedFrontend.port
  if (selectedFrontend.reuse) {
    logStartup(`复用已启动的她火前端：http://${HOST}:${frontendPort}`)
    return
  }

  const env = {
    ...getSystemProxyEnv(),
    PORT: String(frontendPort),
    HOSTNAME: HOST,
    NEXT_PUBLIC_PROMPT_API_BASE: `http://${HOST}:${backendPort}`,
  }

  if (isDev) {
    startChild(
      "她火前端",
      "pnpm",
      ["exec", "next", "dev", "--turbopack", "--port", String(frontendPort)],
      projectDir,
      env
    )
  } else {
    const standaloneDir = path.join(projectDir, ".next", "standalone")
    const serverPath = findStandaloneServer(standaloneDir)
    logStartup(`使用 Next server：${serverPath}`)
    for (const [key, value] of Object.entries(env)) {
      process.env[key] = value
    }
    process.chdir(path.dirname(serverPath))
    await import(pathToFileURL(serverPath).href)
  }

  await waitForPort(frontendPort, 45000)
}

function createWindow() {
  logStartup("创建主窗口")
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: "#0a0a0a",
    icon: fs.existsSync(windowIcon) ? windowIcon : undefined,
    title: "她火",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: fs.existsSync(preloadPath) ? preloadPath : undefined,
      sandbox: true,
    },
  })

  mainWindow.removeMenu()
  mainWindow.loadURL(`http://${HOST}:${frontendPort}`)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: "deny" }
  })
}

function stopChildren() {
  for (const child of childProcesses.reverse()) {
    if (!child.pid || child.killed) continue
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      })
    } else {
      child.kill("SIGTERM")
    }
  }
}

app
  .whenReady()
  .then(async () => {
    logStartup("Electron ready")
    await startBackend()
    await startFrontend()
    createWindow()

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error) => {
    logStartup(
      `启动失败：${error instanceof Error ? error.stack || error.message : String(error)}`
    )
    dialog.showErrorBox(
      "她火启动失败",
      error instanceof Error ? error.message : String(error)
    )
    stopChildren()
    app.quit()
  })

app.on("window-all-closed", () => {
  stopChildren()
  if (process.platform !== "darwin") app.quit()
})

app.on("before-quit", stopChildren)
