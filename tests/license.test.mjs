import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import ts from "typescript"

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)

function base64UrlEncode(input) {
  const bytes =
    typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input)
  return bytes
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "")
}

async function importLicensingModule() {
  const sourcePath = path.join(projectRoot, "lib", "licensing.ts")
  const source = await readFile(sourcePath, "utf8")
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      strict: true,
    },
    fileName: sourcePath,
  })
  const outDir = path.join(tmpdir(), "ta-huo-license-tests")
  await mkdir(outDir, { recursive: true })
  const compiledPath = path.join(outDir, `licensing-${Date.now()}.mjs`)
  await writeFile(compiledPath, output.outputText, "utf8")
  return import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`)
}

async function createSignedLicense(payload) {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  )
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", pair.publicKey)
  const payloadPart = base64UrlEncode(JSON.stringify(payload))
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    pair.privateKey,
    new TextEncoder().encode(payloadPart)
  )

  return {
    token: `THL1.${payloadPart}.${base64UrlEncode(new Uint8Array(signature))}`,
    publicKeyJwk,
  }
}

test("malformed activation packages fail closed", async () => {
  const { verifyLicensePackage } = await importLicensingModule()

  const result = await verifyLicensePackage("not-a-license")

  assert.equal(result.valid, false)
  assert.equal(result.status, "malformed")
  assert.deepEqual(result.features, [])
})

test("valid signed licenses enable only included features", async () => {
  const { hasLicenseFeature, verifyLicensePackage } =
    await importLicensingModule()
  const now = "2026-06-14T00:00:00.000Z"
  const { token, publicKeyJwk } = await createSignedLicense({
    licenseId: "lic_test_video",
    subject: "local-test",
    deviceId: "device-a",
    issuedAt: "2026-06-13T00:00:00.000Z",
    expiresAt: "2026-07-14T00:00:00.000Z",
    features: ["video_factory"],
  })

  const result = await verifyLicensePackage(token, {
    deviceId: "device-a",
    now,
    publicKeyJwk,
  })

  assert.equal(result.valid, true)
  assert.equal(result.status, "valid")
  assert.equal(hasLicenseFeature(result, "video_factory"), true)
  assert.equal(hasLicenseFeature(result, "image_workbench"), false)
})

test("expired and device-mismatched licenses are rejected", async () => {
  const { verifyLicensePackage } = await importLicensingModule()
  const { token, publicKeyJwk } = await createSignedLicense({
    licenseId: "lic_test_expired",
    subject: "local-test",
    deviceId: "device-a",
    issuedAt: "2026-05-01T00:00:00.000Z",
    expiresAt: "2026-06-01T00:00:00.000Z",
    features: ["video_factory", "image_workbench"],
  })

  const expired = await verifyLicensePackage(token, {
    deviceId: "device-a",
    now: "2026-06-14T00:00:00.000Z",
    publicKeyJwk,
  })
  const mismatch = await verifyLicensePackage(token, {
    deviceId: "device-b",
    now: "2026-05-14T00:00:00.000Z",
    publicKeyJwk,
  })

  assert.equal(expired.valid, false)
  assert.equal(expired.status, "expired")
  assert.equal(mismatch.valid, false)
  assert.equal(mismatch.status, "device_mismatch")
})
