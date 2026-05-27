import { Suspense } from "react"

import { ImageWorkbench } from "@/components/image-workbench"

export default function ImagePage() {
  return (
    <Suspense fallback={<div className="grid min-h-svh place-items-center text-sm text-muted-foreground">正在打开图片工作台</div>}>
      <ImageWorkbench />
    </Suspense>
  )
}
