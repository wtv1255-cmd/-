import { Suspense } from "react"

import { ImageWorkbench } from "@/components/image-workbench"
import { LicenseGate } from "@/components/license-gate"

export default function ImagePage() {
  return (
    <LicenseGate feature="image_workbench" title="图片工作台">
      <Suspense fallback={<div className="grid min-h-svh place-items-center text-sm text-muted-foreground">正在打开图片工作台</div>}>
        <ImageWorkbench />
      </Suspense>
    </LicenseGate>
  )
}
