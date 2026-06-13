"use client"

import {
  Clock3,
  FileVideo,
  Layers3,
  ListChecks,
  RadioTower,
  Sparkles,
} from "lucide-react"

import {
  FeatureFlagList,
  LicenseGate,
  useLicenseVerification,
} from "@/components/license-gate"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"

const workflowSections = [
  ["爆款来源", "关键词、抖音链接或本地视频"],
  ["脚本生成", "结构分析与原创文案"],
  ["套餐和时长", "三类套餐与四档时长"],
  ["分镜提示词", "火柴人镜头和可编辑提示词"],
  ["素材与配音", "图片、炎灵素材、音频和字幕"],
  ["剪辑发布", "导出、标题、封面和确认发布"],
] as const

export default function VideoFactoryPage() {
  return (
    <LicenseGate feature="video_factory" title="视频工厂">
      <VideoFactoryShell />
    </LicenseGate>
  )
}

function VideoFactoryShell() {
  const license = useLicenseVerification()

  return (
    <main className="min-h-svh bg-muted/40 text-foreground">
      <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg border bg-background">
            <FileVideo className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">视频工厂</div>
            <div className="truncate text-xs text-muted-foreground">
              她火助手短视频任务台
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="outline" onClick={() => history.back()}>
            返回
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 p-6 max-lg:p-4">
        <section className="grid grid-cols-[minmax(0,1fr)_340px] gap-5 max-xl:grid-cols-1">
          <div className="rounded-lg border bg-background p-5">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-normal">
                  单条视频成片任务
                </h1>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  当前授权已允许进入视频工厂。任务状态、脚本、分镜、素材、配音、剪辑、发布确认和记录将在这里按步骤推进。
                </p>
              </div>
              <Button>
                <Sparkles className="size-4" />
                新建任务
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
              {workflowSections.map(([title, description], index) => (
                <article
                  key={title}
                  className="min-h-32 rounded-lg border bg-muted/30 p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="grid size-8 place-items-center rounded-lg border bg-background">
                      {index % 3 === 0 ? (
                        <RadioTower className="size-4" />
                      ) : index % 3 === 1 ? (
                        <ListChecks className="size-4" />
                      ) : (
                        <Layers3 className="size-4" />
                      )}
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h2 className="text-sm font-semibold">{title}</h2>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <aside className="grid content-start gap-4">
            <div className="rounded-lg border bg-background p-4">
              <div className="mb-3 flex items-center gap-2">
                <Clock3 className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">授权功能</h2>
              </div>
              <FeatureFlagList result={license.result} />
            </div>
            <div className="rounded-lg border bg-background p-4 text-sm leading-6 text-muted-foreground">
              发布、批量矩阵和 DaVinci 引擎仍受独立功能开关控制。未授权时，相关任务动作保持不可运行状态。
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}
