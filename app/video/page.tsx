"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  Clock3,
  FileVideo,
  Layers3,
  ListChecks,
  Lock,
  Settings,
  RadioTower,
  Save,
  Sparkles,
  UploadCloud,
} from "lucide-react"

import {
  FeatureFlagList,
  LicenseGate,
  useLicenseVerification,
} from "@/components/license-gate"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  createPublishDraft,
  readPublishDraft,
  recordPublishAutomationResult,
  savePublishDraft,
  sanitizePublishDraftForExport,
  startAuthorizedPublish,
  type PublishAccount,
  type PublishDraft,
} from "@/lib/video-publish"
import { hasLicenseFeature } from "@/lib/licensing"
import {
  createVideoTask,
  readVideoTasks,
  saveVideoTasks,
  type VideoTask,
  type VideoWorkflowStepState,
} from "@/lib/video-task"
import {
  createTaskFileRef,
  createVideoTaskSnapshot,
  saveVideoTaskSnapshot,
} from "@/lib/video-domain"
import {
  API_PROFILE_SERVICES,
  createApiProfileLogEntry,
  createDefaultApiProfileStore,
  readApiProfileStore,
  resolveApiProfile,
  saveApiProfileStore,
  setActiveApiProfile,
  upsertApiProfile,
  type ApiProfile,
  type ApiProfileService,
  type ApiProfileStore,
} from "@/lib/api-profiles"

const defaultPublishAccount: PublishAccount = {
  id: "douyin-main",
  displayName: "抖音主账号",
  platform: "douyin",
  browserProfileId: "work",
  authorized: true,
}

const apiProfileServiceLabels: Record<ApiProfileService, string> = {
  text_model: "文本模型",
  image_generation: "图片生成",
  video_parsing: "视频解析",
  publish_helper: "发布辅助",
}

export default function VideoFactoryPage() {
  return (
    <LicenseGate feature="video_factory" title="视频工厂">
      <VideoFactoryShell />
    </LicenseGate>
  )
}

function VideoFactoryShell() {
  const license = useLicenseVerification()
  const [tasks, setTasks] = useState<VideoTask[]>([])
  const [activeTaskId, setActiveTaskId] = useState("")
  const [apiProfiles, setApiProfiles] = useState<ApiProfileStore>(
    createDefaultApiProfileStore
  )
  const [publishDraft, setPublishDraft] = useState<PublishDraft | null>(null)
  const [toast, setToast] = useState("")
  const autoPublishEnabled = hasLicenseFeature(license.result, "auto_publish")
  const activeTask = tasks.find((task) => task.id === activeTaskId) || tasks[0]

  useEffect(() => {
    let alive = true
    Promise.resolve().then(() => {
      if (!alive) return
      try {
        setPublishDraft(readPublishDraft())
        const restoredTasks = readVideoTasks()
        setTasks(restoredTasks)
        setActiveTaskId(restoredTasks[0]?.id || "")
        setApiProfiles(readApiProfileStore())
      } catch {
        setPublishDraft(null)
        setTasks([])
        setActiveTaskId("")
        setApiProfiles(createDefaultApiProfileStore())
      }
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(""), 2300)
    return () => window.clearTimeout(timer)
  }, [toast])

  const persistTasks = (nextTasks: VideoTask[], nextActiveId?: string) => {
    setTasks(nextTasks)
    saveVideoTasks(nextTasks)
    if (nextActiveId !== undefined) {
      setActiveTaskId(nextActiveId)
    }
  }

  const persistApiProfiles = (store: ApiProfileStore) => {
    setApiProfiles(store)
    saveApiProfileStore(store)
  }

  const saveApiProfile = (profile: ApiProfile) => {
    persistApiProfiles(upsertApiProfile(apiProfiles, profile))
    setToast("API Profile 已保存")
  }

  const selectApiProfile = (
    service: ApiProfileService,
    profileId: string
  ) => {
    persistApiProfiles(setActiveApiProfile(apiProfiles, service, profileId))
  }

  const createTask = () => {
    const task = createVideoTask({
      title: `她火视频任务 ${String(tasks.length + 1).padStart(2, "0")}`,
    })
    const profileRecords = API_PROFILE_SERVICES.map((service, index) => {
      const entry = createApiProfileLogEntry(apiProfiles, service)

      return {
        id: `api_profile_${service}`,
        at: new Date(Date.now() + index).toISOString(),
        kind: "api_profile_selected" as const,
        message: `${apiProfileServiceLabels[service]}：${entry.label}（${
          entry.configured ? "已配置" : "未配置"
        }）`,
      }
    })

    saveVideoTaskSnapshot(
      createVideoTaskSnapshot({
        id: task.id,
        title: task.title,
        status: task.status,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        workflow: task.workflow,
        source: {
          mode: "manual_text",
          userTopic: "等待输入关键词、抖音链接或本地视频",
        },
        records: profileRecords,
        assets: [
          {
            id: "render_placeholder",
            kind: "rendered_video",
            displayName: "rendered-video-placeholder.mp4",
            file: createTaskFileRef({
              taskId: task.id,
              kind: "rendered_video",
              filename: "rendered-video-placeholder.mp4",
              mimeType: "video/mp4",
            }),
          },
        ],
        publish: {
          platform: "douyin",
          accountId: defaultPublishAccount.id,
          displayName: defaultPublishAccount.displayName,
          browserProfileId: defaultPublishAccount.browserProfileId,
          authorizedByUser: defaultPublishAccount.authorized,
          title: "等待生成发布标题",
          topics: [],
          intro: "",
        },
      })
    )
    persistTasks([task, ...tasks], task.id)
    setToast("已创建视频任务")
  }

  const persistDraft = (draft: PublishDraft) => {
    const safeDraft = sanitizePublishDraftForExport(draft)
    setPublishDraft(safeDraft)
    savePublishDraft(safeDraft)
  }

  const generateDraft = () => {
    persistDraft(
      createPublishDraft({
        taskId: "stage1-demo-task",
        renderedVideoPath: "%APPDATA%/她火/tasks/stage1-demo/output/demo.mp4",
        titleSeed: "她火一键做短视频：小白也能拆爆款",
        scriptSummary:
          "用她火助手把爆款结构拆成原创脚本，生成火柴人分镜、素材、配音和发布草稿。",
        coverImagePath: "%APPDATA%/她火/tasks/stage1-demo/output/cover.png",
        account: defaultPublishAccount,
      })
    )
    setToast("已生成发布草稿")
  }

  const updateDraft = (patch: Partial<PublishDraft>) => {
    if (!publishDraft) return
    persistDraft({ ...publishDraft, ...patch })
  }

  const updateAccount = (patch: Partial<PublishAccount>) => {
    if (!publishDraft) return
    updateDraft({
      account: {
        ...publishDraft.account,
        ...patch,
      },
    })
  }

  const confirmPublish = () => {
    if (!publishDraft) return
    if (!autoPublishEnabled) {
      persistDraft(
        recordPublishAutomationResult(
          {
            ...publishDraft,
            status: "blocked",
            manualActionRequired: true,
          },
          {
            kind: "risk_prompt",
            message: "自动发布功能未授权，请先激活自动发布套餐。",
          }
        )
      )
      return
    }

    persistDraft(startAuthorizedPublish(publishDraft, { confirmed: true }))
    setToast("已确认，等待授权浏览器执行")
  }

  const simulateRiskPause = () => {
    if (!publishDraft) return
    persistDraft(
      recordPublishAutomationResult(publishDraft, {
        kind: "captcha",
        message: "检测到验证码或风控提示，已暂停等待用户处理。",
      })
    )
  }

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
          <div className="grid gap-5">
            <div className="rounded-lg border bg-background p-5">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-normal">
                  视频工厂任务
                </h1>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  独立管理单条视频任务，按爆款来源、脚本、套餐、分镜、素材、配音、剪辑、发布和记录推进。
                </p>
              </div>
              <Button onClick={createTask}>
                <Sparkles className="size-4" />
                新建任务
              </Button>
            </div>

            <div className="grid gap-4">
              <TaskList
                tasks={tasks}
                activeTaskId={activeTask?.id || ""}
                onSelectTask={setActiveTaskId}
                onCreateTask={createTask}
              />
              {activeTask ? (
                <WorkflowShell task={activeTask} />
              ) : (
                <EmptyTaskShell onCreateTask={createTask} />
              )}
            </div>
          </div>

            <PublishPanel
              draft={publishDraft}
              autoPublishEnabled={autoPublishEnabled}
              onGenerateDraft={generateDraft}
              onUpdateDraft={updateDraft}
              onUpdateAccount={updateAccount}
              onConfirmPublish={confirmPublish}
              onRiskPause={simulateRiskPause}
            />

            <ApiProfilesPanel
              store={apiProfiles}
              onSaveProfile={saveApiProfile}
              onSelectProfile={selectApiProfile}
            />
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
      {toast ? (
        <div className="fixed right-5 bottom-5 z-[60] rounded-lg border bg-foreground px-3 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      ) : null}
    </main>
  )
}

function TaskList({
  tasks,
  activeTaskId,
  onSelectTask,
  onCreateTask,
}: {
  tasks: VideoTask[]
  activeTaskId: string
  onSelectTask: (taskId: string) => void
  onCreateTask: () => void
}) {
  if (!tasks.length) {
    return (
      <section className="rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">任务列表</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              还没有视频任务。新建后会显示完整的单条成片流程。
            </p>
          </div>
          <Button variant="outline" onClick={onCreateTask}>
            <FileVideo className="size-4" />
            新建任务
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">任务列表</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            每条任务独立保存状态和产物路径。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onCreateTask}>
          <Sparkles className="size-3.5" />
          新建
        </Button>
      </div>
      <div className="grid gap-2">
        {tasks.map((task) => {
          const active = task.id === activeTaskId
          return (
            <button
              key={task.id}
              type="button"
              className={`rounded-lg border px-3 py-2 text-left transition ${
                active
                  ? "border-primary bg-background shadow-sm"
                  : "bg-background/60 hover:bg-background"
              }`}
              onClick={() => onSelectTask(task.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {task.title}
                </span>
                <span className="rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {task.status}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {task.workflow.length} 步流程 ·{" "}
                {task.createdAt.slice(0, 10)}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function EmptyTaskShell({ onCreateTask }: { onCreateTask: () => void }) {
  return (
    <section className="grid min-h-72 place-items-center rounded-lg border border-dashed bg-muted/30 p-6 text-center">
      <div>
        <FileVideo className="mx-auto mb-3 size-9 text-muted-foreground" />
        <h2 className="text-base font-semibold">准备创建单条视频任务</h2>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          视频工厂是独立页面，不复用图片工作台状态。创建任务后会展开爆款来源到任务记录的完整流程。
        </p>
        <Button className="mt-4" onClick={onCreateTask}>
          <Sparkles className="size-4" />
          新建任务
        </Button>
      </div>
    </section>
  )
}

function WorkflowShell({ task }: { task: VideoTask }) {
  return (
    <section className="rounded-lg border bg-background p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{task.title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            任务工作流会把可编辑脚本、分镜、提示词、素材、配音、导出和发布确认分开记录。
          </p>
        </div>
        <span className="rounded-lg border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          状态：{task.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {task.workflow.map((step, index) => (
          <article
            key={step.id}
            className="min-h-36 rounded-lg border bg-muted/30 p-4"
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
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{step.title}</h3>
              <StepStateBadge state={step.state} />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {step.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}

function StepStateBadge({ state }: { state: VideoWorkflowStepState }) {
  const labelMap: Record<VideoWorkflowStepState, string> = {
    active: "当前",
    queued: "排队",
    locked: "待解锁",
    done: "完成",
  }
  return (
    <span className="shrink-0 rounded-md border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
      {labelMap[state]}
    </span>
  )
}

function PublishPanel({
  draft,
  autoPublishEnabled,
  onGenerateDraft,
  onUpdateDraft,
  onUpdateAccount,
  onConfirmPublish,
  onRiskPause,
}: {
  draft: PublishDraft | null
  autoPublishEnabled: boolean
  onGenerateDraft: () => void
  onUpdateDraft: (patch: Partial<PublishDraft>) => void
  onUpdateAccount: (patch: Partial<PublishAccount>) => void
  onConfirmPublish: () => void
  onRiskPause: () => void
}) {
  return (
    <section className="rounded-lg border bg-background p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">发布确认</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            标题、话题、简介、封面和账号必须由用户确认后才会交给授权浏览器 Profile 执行。
          </p>
        </div>
        <Button variant="outline" onClick={onGenerateDraft}>
          <Save className="size-4" />
          生成草稿
        </Button>
      </div>

      {!draft ? (
        <div className="grid min-h-60 place-items-center rounded-lg border border-dashed bg-muted/30 p-6 text-center">
          <div>
            <UploadCloud className="mx-auto mb-3 size-8 text-muted-foreground" />
            <div className="font-medium">等待渲染输出</div>
            <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
              渲染完成后会生成可编辑的发布草稿。这里可以先生成一份本地草稿验证确认门和风险暂停流程。
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
            <TextField
              label="标题"
              value={draft.title}
              onChange={(value) => onUpdateDraft({ title: value })}
            />
            <TextField
              label="封面文件"
              value={draft.coverImagePath}
              onChange={(value) => onUpdateDraft({ coverImagePath: value })}
            />
            <TextField
              label="话题"
              value={draft.topics.join("、")}
              onChange={(value) =>
                onUpdateDraft({
                  topics: value
                    .split(/[、,，\s]+/u)
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
            />
            <TextField
              label="授权浏览器 Profile"
              value={draft.account.browserProfileId}
              onChange={(value) =>
                onUpdateAccount({ browserProfileId: value.trim() })
              }
            />
            <TextField
              label="发布账号"
              value={draft.account.displayName}
              onChange={(value) => onUpdateAccount({ displayName: value })}
            />
            <label className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                账号授权状态
              </span>
              <select
                value={draft.account.authorized ? "yes" : "no"}
                onChange={(event) =>
                  onUpdateAccount({ authorized: event.target.value === "yes" })
                }
                className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
              >
                <option value="yes">已由用户授权</option>
                <option value="no">未授权</option>
              </select>
            </label>
          </div>

          <label className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              简介
            </span>
            <textarea
              value={draft.intro}
              onChange={(event) => onUpdateDraft({ intro: event.target.value })}
              className="min-h-24 rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onConfirmPublish}>
              {autoPublishEnabled ? (
                <UploadCloud className="size-4" />
              ) : (
                <Lock className="size-4" />
              )}
              确认并准备发布
            </Button>
            <Button variant="outline" onClick={onRiskPause}>
              <AlertTriangle className="size-4" />
              记录风控暂停
            </Button>
            <StatusBadge status={draft.status} />
          </div>

          {draft.pauseReason || draft.reason ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {draft.pauseReason || draft.reason}
            </div>
          ) : null}

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              发布记录
            </div>
            <div className="grid gap-2">
              {draft.publishLog.slice(-5).map((entry) => (
                <div
                  key={`${entry.at}-${entry.kind}-${entry.message}`}
                  className="grid grid-cols-[120px_120px_minmax(0,1fr)] gap-2 text-xs max-md:grid-cols-1"
                >
                  <span className="font-mono text-muted-foreground">
                    {entry.at.slice(0, 19).replace("T", " ")}
                  </span>
                  <span>{entry.kind}</span>
                  <span className="min-w-0">{entry.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function ApiProfilesPanel({
  store,
  onSaveProfile,
  onSelectProfile,
}: {
  store: ApiProfileStore
  onSaveProfile: (profile: ApiProfile) => void
  onSelectProfile: (service: ApiProfileService, profileId: string) => void
}) {
  const [editingService, setEditingService] =
    useState<ApiProfileService>("text_model")
  const activeProfile = resolveApiProfile(store, editingService)

  return (
    <section className="rounded-lg border bg-background p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">API Profile</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            文本、图片、视频解析和发布辅助分别选择本机保存的用户 API。Key
            只用于请求，不写入任务日志或导出摘要。
          </p>
        </div>
        <Settings className="size-5 text-muted-foreground" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="grid content-start gap-2">
          {API_PROFILE_SERVICES.map((service) => {
            const profile = resolveApiProfile(store, service)
            const active = service === editingService
            return (
              <button
                key={service}
                type="button"
                className={`rounded-lg border px-3 py-2 text-left transition ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-muted/30 hover:bg-muted"
                }`}
                onClick={() => setEditingService(service)}
              >
                <div className="flex items-center justify-between gap-2 text-sm font-medium">
                  <span>{apiProfileServiceLabels[service]}</span>
                  <span className="text-[11px] opacity-75">
                    {profile.apiKey.trim() ? "已配置" : "未配置"}
                  </span>
                </div>
                <div className="mt-1 truncate text-xs opacity-80">
                  {profile.label}
                </div>
              </button>
            )
          })}
        </div>

        <ApiProfileEditor
          key={`${editingService}:${activeProfile.id}`}
          activeProfile={activeProfile}
          editingService={editingService}
          store={store}
          onSaveProfile={onSaveProfile}
          onSelectProfile={onSelectProfile}
        />
      </div>
    </section>
  )
}

function ApiProfileEditor({
  activeProfile,
  editingService,
  store,
  onSaveProfile,
  onSelectProfile,
}: {
  activeProfile: ApiProfile
  editingService: ApiProfileService
  store: ApiProfileStore
  onSaveProfile: (profile: ApiProfile) => void
  onSelectProfile: (service: ApiProfileService, profileId: string) => void
}) {
  const [draft, setDraft] = useState<ApiProfile>(activeProfile)

  const saveDraft = () => {
    onSaveProfile({
      ...draft,
      service: editingService,
      id: draft.id.trim() || `${editingService}-custom`,
      label: draft.label.trim() || apiProfileServiceLabels[editingService],
      apiBaseUrl: draft.apiBaseUrl.trim(),
      apiKey: draft.apiKey.trim(),
    })
  }

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-4">
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <TextField
          label="Profile ID"
          value={draft.id}
          onChange={(value) => setDraft((current) => ({ ...current, id: value }))}
        />
        <TextField
          label="显示名称"
          value={draft.label}
          onChange={(value) =>
            setDraft((current) => ({ ...current, label: value }))
          }
        />
        <TextField
          label="API 地址"
          value={draft.apiBaseUrl}
          onChange={(value) =>
            setDraft((current) => ({ ...current, apiBaseUrl: value }))
          }
        />
        <label className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            API Key
          </span>
          <input
            value={draft.apiKey}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                apiKey: event.target.value,
              }))
            }
            className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
            type="password"
            placeholder="sk-..."
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={saveDraft}>
          <Save className="size-4" />
          保存 Profile
        </Button>
        <select
          value={store.activeProfileByService[editingService]}
          onChange={(event) =>
            onSelectProfile(editingService, event.target.value)
          }
          className="h-9 min-w-56 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
          aria-label={`${apiProfileServiceLabels[editingService]} Profile`}
        >
          {store.profiles[editingService].map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          当前请求会使用所选 Profile 的地址和 Key。
        </span>
      </div>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
      />
    </label>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex min-h-8 items-center rounded-lg border bg-muted px-2.5 text-xs text-muted-foreground">
      状态：{status}
    </span>
  )
}
