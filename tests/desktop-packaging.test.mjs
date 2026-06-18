import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)

test("desktop packaging script does not bundle local IndexTTS2 model directories", async () => {
  const script = await readFile(
    path.join(projectRoot, "scripts", "prepare-desktop.mjs"),
    "utf8"
  )

  assert.equal(script.includes("Index-TTS2_ZZDH"), false)
  assert.equal(script.includes("indextts"), false)
  assert.equal(script.includes("checkpoints"), false)
  assert.equal(script.includes("venv"), false)
})
