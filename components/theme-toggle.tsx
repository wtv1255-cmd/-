"use client"

import { Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === "dark"
  const label = isDark ? "白天" : "黑夜"

  return (
    <Button
      variant="outline"
      className={cn("min-w-20", className)}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={`切换到${label}模式`}
      title={`切换到${label}模式`}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span>{label}</span>
    </Button>
  )
}
