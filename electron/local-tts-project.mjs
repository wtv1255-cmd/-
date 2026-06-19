import { spawnSync } from "node:child_process"
import fs from "node:fs"
import fsPromises from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const localTtsRunnerPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "synthesize-local-tts.py"
)

export function normalizeLocalProjectPath(value) {
  return String(value || "")
    .trim()
    .replace(/\//g, "\\")
    .replace(/\\+$/u, "")
}

function cleanSegment(value, fallback) {
  const cleaned =
    typeof value === "string"
      ? value
          .trim()
          .replace(/[\\/:*?"<>|]+/g, "-")
          .replace(/\s+/g, "-")
          .replace(/^[.-]+/u, "")
      : ""
  return cleaned || fallback
}

function cleanText(value, fallback = "") {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
  return text || fallback
}

function extensionFromMimeType(mimeType) {
  if (mimeType === "audio/mpeg") return ".mp3"
  if (mimeType === "audio/mp4") return ".m4a"
  if (mimeType === "audio/aac") return ".aac"
  if (mimeType === "audio/ogg") return ".ogg"
  if (mimeType === "audio/flac") return ".flac"
  return ".wav"
}

function mimeTypeFromFilename(filename, fallback = "audio/wav") {
  const ext = path.extname(String(filename || "")).toLowerCase()
  if (ext === ".mp3") return "audio/mpeg"
  if (ext === ".m4a") return "audio/mp4"
  if (ext === ".aac") return "audio/aac"
  if (ext === ".ogg") return "audio/ogg"
  if (ext === ".flac") return "audio/flac"
  return fallback
}

function cleanFilename(value, mimeType, fallback = "cloned-voice.wav") {
  const cleaned = cleanSegment(value, fallback).replace(/\.+$/u, "")
  return path.extname(cleaned)
    ? cleaned
    : `${cleaned}${extensionFromMimeType(mimeType)}`
}

function resolveTaskVoiceOutput({ userDataDir, taskId, filename, mimeType }) {
  const safeTaskId = cleanSegment(taskId, "task")
  const safeFilename = cleanFilename(filename, mimeType)
  const outputDir = path.resolve(userDataDir, "tasks", safeTaskId, "voice_audio")
  const filePath = path.resolve(outputDir, safeFilename)
  const relative = path.relative(outputDir, filePath)

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("TTS 输出路径超出任务目录")
  }

  return { taskId: safeTaskId, filename: safeFilename, outputDir, filePath }
}

function findPythonExecutable(projectPath) {
  const candidates = [
    path.join(projectPath, "venv", "python.exe"),
    path.join(projectPath, "venv", "Scripts", "python.exe"),
    path.join(projectPath, ".venv", "Scripts", "python.exe"),
    "python",
  ]

  return candidates.find((candidate) =>
    candidate === "python" ? true : fs.existsSync(candidate)
  )
}

function normalizeBooleanFlag(args, flag) {
  return Array.isArray(args) && args.includes(flag)
}

function parseRunnerOutput(stdout) {
  const lines = String(stdout || "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
  for (const line of lines.reverse()) {
    try {
      const parsed = JSON.parse(line)
      if (parsed && typeof parsed === "object") return parsed
    } catch {}
  }
  return {}
}

async function defaultRunProcess({ command, args, cwd }) {
  const pathDelimiter = process.platform === "win32" ? ";" : ":"
  const venvDir = path.join(cwd, "venv")
  const hfCache = path.join(cwd, "checkpoints", "hf_cache")
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env,
      PATH: `${venvDir}${pathDelimiter}${process.env.PATH || ""}`,
      PYTHONPATH: ".",
      HF_HOME: hfCache,
      HUGGINGFACE_HUB_CACHE: hfCache,
    },
  })
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  }
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

export async function synthesizeLocalTtsWithReference({
  userDataDir,
  input,
  runProcess = defaultRunProcess,
}) {
  const projectPath = normalizeLocalProjectPath(input?.projectPath)
  const text = cleanText(input?.text)
  const referenceAudioPath = path.resolve(String(input?.referenceAudioPath || ""))
  const mimeType = mimeTypeFromFilename(input?.outputFilename, "audio/wav")
  const output = resolveTaskVoiceOutput({
    userDataDir,
    taskId: input?.taskId,
    filename: input?.outputFilename || "cloned-voice.wav",
    mimeType,
  })

  if (!text) throw new Error("TTS 文案为空")
  const projectCheck = checkLocalTtsProject({ projectPath })
  if (!projectCheck.ok) {
    throw new Error(
      `本地 TTS 未就绪：${
        projectCheck.missing?.join("、") || projectCheck.error || "路径不可用"
      }`
    )
  }
  if (!fs.existsSync(referenceAudioPath)) {
    throw new Error("参考音频不存在")
  }
  if (!fs.existsSync(localTtsRunnerPath)) {
    throw new Error("缺少本地 TTS 合成脚本")
  }

  await fsPromises.mkdir(output.outputDir, { recursive: true })
  const payloadPath = path.join(output.outputDir, `${output.filename}.payload.json`)
  const launchArgs = Array.isArray(input?.launchArgs) ? input.launchArgs : []
  const payload = {
    projectPath,
    text,
    referenceAudioPath,
    outputPath: output.filePath,
    modelDir: path.join(projectPath, "checkpoints"),
    useFp16: normalizeBooleanFlag(launchArgs, "--fp16"),
    useDeepspeed: normalizeBooleanFlag(launchArgs, "--deepspeed"),
    useCudaKernel: normalizeBooleanFlag(launchArgs, "--cuda_kernel"),
    maxTextTokensPerSegment: Math.max(
      20,
      Math.floor(Number(input?.maxTextTokensPerSegment) || 120)
    ),
  }
  await fsPromises.writeFile(payloadPath, JSON.stringify(payload, null, 2), "utf8")

  const command = findPythonExecutable(projectPath)
  const result = await runProcess({
    command,
    args: [localTtsRunnerPath, payloadPath],
    cwd: projectPath,
    payloadPath,
  })
  if (result.status !== 0) {
    throw new Error(
      result.stderr?.trim() ||
        result.stdout?.trim() ||
        "本地 IndexTTS2 合成失败"
    )
  }
  const stat = await fsPromises.stat(output.filePath)
  const runnerOutput = parseRunnerOutput(result.stdout)

  return {
    ok: true,
    taskId: output.taskId,
    filename: output.filename,
    filePath: output.filePath,
    bytes: stat.size,
    mimeType,
    durationMs:
      typeof runnerOutput.durationMs === "number" &&
      Number.isFinite(runnerOutput.durationMs)
        ? Math.max(0, Math.round(runnerOutput.durationMs))
        : undefined,
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

export function createLocalTtsSynthesisIpcHandler(userDataDir) {
  return async (_event, input) => {
    try {
      return await synthesizeLocalTtsWithReference({ userDataDir, input })
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "本地 IndexTTS2 合成失败",
      }
    }
  }
}
