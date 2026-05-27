import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)
const sourcePackage = JSON.parse(
  fs.readFileSync(path.join(projectDir, "package.json"), "utf8")
)
const stagingDir = path.join(projectDir, ".desktop-app")
const backendSourceDir =
  process.env.PROMPT_BACKEND_SOURCE_DIR || path.join(projectDir, "backend")
const backendOutputDir = path.join(stagingDir, "desktop-backend")

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectDir,
    shell: options.shell ?? true,
    stdio: "inherit",
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  })
  if (result.status !== 0) process.exit(result.status || 1)
}

function copyDir(source, target) {
  if (!fs.existsSync(source)) return
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.cpSync(source, target, { recursive: true })
}

function findStandaloneServerDir(standaloneDir) {
  const directServer = path.join(standaloneDir, "server.js")
  if (fs.existsSync(directServer)) return standaloneDir

  const queue = [standaloneDir]
  while (queue.length) {
    const currentDir = queue.shift()
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue
      const entryPath = path.join(currentDir, entry.name)
      if (entry.isFile() && entry.name === "server.js") return currentDir
      if (entry.isDirectory()) queue.push(entryPath)
    }
  }

  throw new Error(`没有找到 Next standalone server.js：${standaloneDir}`)
}

function prepareBackend() {
  const sourceDb = path.join(backendSourceDir, "data", "infinite-canvas.db")
  const binaryName =
    process.platform === "win32" ? "prompt-backend.exe" : "prompt-backend"

  if (!fs.existsSync(backendSourceDir)) {
    throw new Error(`没有找到提示词后端源码目录：${backendSourceDir}`)
  }
  if (!fs.existsSync(sourceDb)) {
    throw new Error(`没有找到提示词数据库：${sourceDb}`)
  }

  fs.mkdirSync(backendOutputDir, { recursive: true })
  run("go", ["build", "-o", path.join(backendOutputDir, binaryName), "."], {
    cwd: backendSourceDir,
    shell: false,
  })

  fs.mkdirSync(path.join(backendOutputDir, "data"), { recursive: true })
  fs.copyFileSync(
    sourceDb,
    path.join(backendOutputDir, "data", "infinite-canvas.db")
  )
}

run("pnpm", ["exec", "next", "build"])

fs.rmSync(stagingDir, { recursive: true, force: true })
fs.mkdirSync(stagingDir, { recursive: true })
const standaloneTargetDir = path.join(stagingDir, ".next", "standalone")
copyDir(path.join(projectDir, "electron"), path.join(stagingDir, "electron"))
copyDir(
  path.join(projectDir, "desktop-assets"),
  path.join(stagingDir, "desktop-assets")
)
copyDir(path.join(projectDir, ".next", "standalone"), standaloneTargetDir)
const standaloneServerDir = findStandaloneServerDir(standaloneTargetDir)
copyDir(
  path.join(projectDir, ".next", "static"),
  path.join(standaloneServerDir, ".next", "static")
)
copyDir(
  path.join(projectDir, "public"),
  path.join(standaloneServerDir, "public")
)
prepareBackend()

fs.writeFileSync(
  path.join(stagingDir, "package.json"),
  `${JSON.stringify(
    {
      name: "prompt-center-desktop",
      version: "0.0.1",
      description: "本地提示词中心和图片工作台",
      author: "local",
      private: true,
      type: "module",
      main: "electron/main.mjs",
      dependencies: sourcePackage.dependencies || {},
      build: {
        appId: "local.prompt-center",
        productName: "提示词中心",
        electronVersion: "39.8.10",
        icon: "desktop-assets/icon.ico",
        win: {
          icon: "desktop-assets/icon.ico",
        },
        asar: false,
        npmRebuild: false,
        files: ["**/*"],
        directories: {
          output: "../dist-desktop",
        },
      },
    },
    null,
    2
  )}\n`
)

run(
  "pnpm",
  [
    "install",
    "--prod",
    "--ignore-workspace",
    "--no-frozen-lockfile",
    "--ignore-scripts",
    "--config.node-linker=hoisted",
    "--config.confirm-modules-purge=false",
  ],
  { cwd: stagingDir, env: { CI: "true" } }
)

console.log("桌面端构建资源已准备完成。")
