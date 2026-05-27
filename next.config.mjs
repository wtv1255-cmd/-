import path from "node:path"
import { fileURLToPath } from "node:url"

const projectDir = path.dirname(fileURLToPath(import.meta.url))
const promptApiBase =
  process.env.NEXT_PUBLIC_PROMPT_API_BASE || "http://127.0.0.1:8080"

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: projectDir,
  turbopack: {
    root: projectDir,
  },
  async rewrites() {
    return [
      {
        source: "/api/prompts",
        destination: `${promptApiBase}/api/prompts`,
      },
    ]
  },
}

export default nextConfig
