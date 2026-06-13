"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  cacheLicensePackage,
  clearCachedLicensePackage,
  getOrCreateLicenseDeviceId,
  hasLicenseFeature,
  LICENSE_FEATURE_LABELS,
  readCachedLicensePackage,
  verifyLicensePackage,
  type LicenseFeature,
  type LicenseVerificationResult,
} from "@/lib/licensing"
import { cn } from "@/lib/utils"

type LicenseState = {
  checking: boolean
  deviceId: string
  result: LicenseVerificationResult | null
}

const initialState: LicenseState = {
  checking: true,
  deviceId: "",
  result: null,
}

const gatedFeatures: LicenseFeature[] = [
  "image_workbench",
  "video_factory",
  "auto_publish",
  "batch_matrix",
  "davinci_engine",
]

export function useLicenseVerification() {
  const [state, setState] = useState<LicenseState>(initialState)

  const readCachedState = useCallback(async () => {
    const deviceId = getOrCreateLicenseDeviceId()
    const result = await verifyLicensePackage(readCachedLicensePackage(), {
      deviceId,
    })
    return { deviceId, result }
  }, [])

  const verifyCached = useCallback(async () => {
    const next = await readCachedState()
    setState({ checking: false, ...next })
    return next
  }, [readCachedState])

  useEffect(() => {
    let alive = true
    readCachedState().then((next) => {
      if (alive) setState({ checking: false, ...next })
    })
    return () => {
      alive = false
    }
  }, [readCachedState])

  const activate = useCallback(
    async (rawCode: string) => {
      const deviceId = state.deviceId || getOrCreateLicenseDeviceId()
      const result = await verifyLicensePackage(rawCode, { deviceId })
      if (result.valid) cacheLicensePackage(rawCode)
      setState({ checking: false, deviceId, result })
      return result
    },
    [state.deviceId]
  )

  const clear = useCallback(async () => {
    clearCachedLicensePackage()
    await verifyCached()
  }, [verifyCached])

  return {
    ...state,
    refresh: verifyCached,
    activate,
    clear,
  }
}

export function LicenseGate({
  feature,
  children,
  title,
}: {
  feature: LicenseFeature
  title?: string
  children: ReactNode
}) {
  const license = useLicenseVerification()
  const allowed = hasLicenseFeature(license.result, feature)

  if (license.checking) {
    return (
      <main className="grid min-h-svh place-items-center bg-muted/40 p-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          正在校验本地授权
        </div>
      </main>
    )
  }

  if (allowed) return children

  return (
    <ActivationFlow
      feature={feature}
      title={title}
      deviceId={license.deviceId}
      result={license.result}
      onActivate={license.activate}
      onClear={license.clear}
    />
  )
}

export function FeatureFlagList({
  result,
  className,
}: {
  result: LicenseVerificationResult | null
  className?: string
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      {gatedFeatures.map((feature) => {
        const enabled = hasLicenseFeature(result, feature)
        return (
          <div
            key={feature}
            className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <span className="min-w-0 truncate">
              {LICENSE_FEATURE_LABELS[feature]}
            </span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                enabled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "border-border bg-muted text-muted-foreground"
              )}
            >
              {enabled ? (
                <Check className="size-3" />
              ) : (
                <Lock className="size-3" />
              )}
              {enabled ? "已启用" : "未授权"}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ActivationFlow({
  feature,
  title,
  deviceId,
  result,
  onActivate,
  onClear,
}: {
  feature: LicenseFeature
  title?: string
  deviceId: string
  result: LicenseVerificationResult | null
  onActivate: (rawCode: string) => Promise<LicenseVerificationResult>
  onClear: () => Promise<void>
}) {
  const [code, setCode] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const featureLabel = LICENSE_FEATURE_LABELS[feature]
  const statusLabel = useMemo(() => {
    if (!result || result.status === "missing") return "未激活"
    if (result.status === "valid") return "授权缺少当前功能"
    if (result.status === "expired") return "授权已过期"
    if (result.status === "device_mismatch") return "设备不匹配"
    if (result.status === "invalid_signature") return "签名无效"
    if (result.status === "not_yet_valid") return "授权尚未生效"
    return "激活码格式不正确"
  }, [result])

  const activate = async () => {
    if (!code.trim()) {
      setMessage("请输入激活码或离线授权包")
      return
    }

    setSubmitting(true)
    setMessage("")
    try {
      const next = await onActivate(code)
      if (hasLicenseFeature(next, feature)) {
        setMessage("激活成功，正在打开功能")
      } else if (next.valid) {
        setMessage("授权有效，但未包含当前功能")
      } else {
        setMessage(statusLabelFromResult(next))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const copyDeviceId = async () => {
    try {
      await navigator.clipboard.writeText(deviceId)
      setMessage("设备码已复制")
    } catch {
      setMessage("复制失败，请手动选择设备码")
    }
  }

  return (
    <main className="min-h-svh bg-muted/40 p-6 text-foreground">
      <section className="mx-auto grid min-h-[calc(100svh-3rem)] max-w-5xl grid-cols-[minmax(0,1fr)_320px] items-center gap-6 max-lg:grid-cols-1">
        <div className="grid gap-5">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
              <ShieldAlert className="size-3.5" />
              {statusLabel}
            </div>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-normal">
              {title || featureLabel} 需要激活
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              激活码只控制本机功能权限，不包含模型服务密钥。图片、文本和视频服务的
              API 地址与 Key 仍需由用户在设置中自行填写。
            </p>
          </div>

          <div className="grid gap-3 rounded-lg border bg-background p-4">
            <label className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                激活码 / 离线授权包
              </span>
              <textarea
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="min-h-32 resize-y rounded-lg border bg-muted p-3 font-mono text-xs outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
                placeholder="THL1.payload.signature"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={submitting} onClick={() => void activate()}>
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                激活
              </Button>
              <Button variant="outline" onClick={() => void copyDeviceId()}>
                <Copy className="size-4" />
                复制设备码
              </Button>
              <Button variant="outline" onClick={() => void onClear()}>
                <Trash2 className="size-4" />
                清除本地授权
              </Button>
            </div>
            {message ? (
              <div className="rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground">
                {message}
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border bg-background p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              本机设备码
            </div>
            <div className="break-all rounded-md bg-muted p-3 font-mono text-xs">
              {deviceId}
            </div>
          </div>
        </div>

        <aside className="grid gap-4 rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-lg border bg-muted">
              <ShieldCheck className="size-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">功能开关</div>
              <div className="text-xs text-muted-foreground">
                本地验签通过后启用
              </div>
            </div>
          </div>
          <FeatureFlagList result={result} />
        </aside>
      </section>
    </main>
  )
}

function statusLabelFromResult(result: LicenseVerificationResult) {
  if (result.status === "malformed") return "激活码格式不正确"
  if (result.status === "invalid_signature") return "授权签名无效"
  if (result.status === "expired") return "授权已过期"
  if (result.status === "not_yet_valid") return "授权尚未生效"
  if (result.status === "device_mismatch") return "授权不属于本机设备"
  return "激活失败"
}
