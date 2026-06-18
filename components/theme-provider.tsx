"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"

declare global {
  interface Window {
    promptCenterDesktop?: {
      setTheme: (theme: "light" | "dark") => void
      readDefaultApiSettings?: () => Promise<unknown>
      checkLocalTtsProject?: (input: { projectPath: string }) => Promise<{
        ok: boolean
        exists?: boolean
        projectPath?: string
        missing?: string[]
        error?: string
      }>
      saveFileToDownloads?: (input: {
        filename: string
        mimeType?: string
        data: ArrayBuffer
      }) => Promise<{
        canceled?: boolean
        filePath?: string
        directory?: string
        error?: string
      }>
      saveTaskAssetFile?: (input: {
        taskId: string
        kind: string
        filename: string
        mimeType?: string
        data: ArrayBuffer
      }) => Promise<{
        ok: boolean
        taskId?: string
        filename?: string
        filePath?: string
        bytes?: number
        mimeType?: string
        dataUrl?: string
        error?: string
      }>
      readTaskAssetPreview?: (input: {
        filePath: string
        mimeType?: string
      }) => Promise<{
        ok: boolean
        filePath?: string
        bytes?: number
        mimeType?: string
        dataUrl?: string
        error?: string
      }>
      renderVideoWithFfmpeg?: (input: {
        taskId: string
        timeline: unknown
        outputFilename: string
      }) => Promise<{
        ok: boolean
        taskId?: string
        filename?: string
        filePath?: string
        bytes?: number
        mimeType?: string
        error?: string
      }>
    }
  }
}

function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <ThemeHotkey />
      <DesktopThemeBridge />
      {children}
    </NextThemesProvider>
  )
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.key.toLowerCase() !== "d") {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [resolvedTheme, setTheme])

  return null
}

function DesktopThemeBridge() {
  const { resolvedTheme } = useTheme()

  React.useEffect(() => {
    window.promptCenterDesktop?.setTheme(
      resolvedTheme === "light" ? "light" : "dark"
    )
  }, [resolvedTheme])

  return null
}

export { ThemeProvider }
