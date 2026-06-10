import { spawn, spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)
const backendDir =
  process.env.PROMPT_BACKEND_SOURCE_DIR || path.join(projectDir, "backend")
const frontendUrl = "http://127.0.0.1:48218"
const children = []
let stopping = false

function startProcess(label, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    shell: true,
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_PROMPT_API_BASE: "http://127.0.0.1:8080",
    },
  })

  children.push({ label, child })
  child.on("exit", (code) => {
    if (!stopping && code && code !== 0) {
      console.log(`${label} 已退出，代码 ${code}`)
    }
  })
  return child
}

function killTree(pid) {
  if (!pid) return
  spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" })
}

function shutdown() {
  if (stopping) return
  stopping = true
  console.log("\n正在关闭她火...")
  for (const { child } of children.reverse()) {
    killTree(child.pid)
  }
}

process.on("SIGINT", () => {
  shutdown()
  process.exit(0)
})
process.on("SIGTERM", () => {
  shutdown()
  process.exit(0)
})
process.on("exit", shutdown)

console.log("启动真实提示词后端...")
startProcess("提示词后端", "go", ["run", "."], backendDir)

console.log("启动她火前端...")
startProcess(
  "她火前端",
  "pnpm",
  ["exec", "next", "dev", "--turbopack", "--port", "48218"],
  projectDir
)

setTimeout(() => {
  spawn("cmd", ["/c", "start", "", frontendUrl], {
    detached: true,
    stdio: "ignore",
  }).unref()
}, 3500)

console.log("")
console.log(`打开地址：${frontendUrl}`)
console.log("关闭这个窗口或按 Ctrl+C，会同时关闭前端和后端进程。")
setInterval(() => {}, 1000)
