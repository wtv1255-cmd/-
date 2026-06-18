import fs from "node:fs"
import path from "node:path"

export function normalizeLocalProjectPath(value) {
  return String(value || "")
    .trim()
    .replace(/\//g, "\\")
    .replace(/\\+$/u, "")
}

export function checkLocalTtsProject(input) {
  const projectPath = normalizeLocalProjectPath(input?.projectPath)
  if (!projectPath) {
    return { ok: false, exists: false, error: "本地 TTS 路径为空" }
  }

  const expectedFiles = ["webui.py", "启动webui.bat", "checkpoints", "venv"]
  const missing = expectedFiles.filter(
    (item) => !fs.existsSync(path.join(projectPath, item))
  )

  return {
    ok: missing.length === 0,
    exists: fs.existsSync(projectPath),
    projectPath,
    missing,
  }
}

export function createLocalTtsProjectIpcHandler() {
  return async (_event, input) => {
    try {
      return checkLocalTtsProject(input)
    } catch (error) {
      return {
        ok: false,
        exists: false,
        error: error instanceof Error ? error.message : "检测本地 TTS 失败",
      }
    }
  }
}
