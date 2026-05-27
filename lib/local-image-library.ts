"use client"

import type {
  GeneratedImage,
  LocalImageCard,
  SaveLocalImageCardInput,
} from "@/lib/types/image"

const DB_NAME = "prompt-center-image-library"
const DB_VERSION = 1
const CARD_STORE = "cards"
const BLOB_STORE = "image_blobs"

let dbPromise: Promise<IDBDatabase> | null = null
const objectUrls = new Map<string, string>()

function openDb() {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CARD_STORE)) {
        const cards = db.createObjectStore(CARD_STORE, { keyPath: "id" })
        cards.createIndex("createdAt", "createdAt")
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error("打开本地图库失败"))
  })

  return dbPromise
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T> | void) {
  const db = await openDb()

  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    const request = action(store)
    let result = undefined as T

    if (request) {
      request.onsuccess = () => {
        result = request.result
      }
      request.onerror = () => reject(request.error || new Error("本地图库读写失败"))
    }

    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error || new Error("本地图库读写失败"))
  })
}

export async function listLocalImageCards() {
  const cards = await withStore<LocalImageCard[]>(CARD_STORE, "readonly", (store) => store.getAll())
  return cards.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function saveLocalImageCard(input: SaveLocalImageCardInput) {
  const id = crypto.randomUUID()
  const imageKey = `image:${id}`
  const meta = await readImageMeta(input.blob)
  const now = new Date().toISOString()
  const card: LocalImageCard = {
    id,
    title: input.title.trim() || "未命名图片",
    prompt: input.prompt,
    createdAt: now,
    updatedAt: now,
    imageKey,
    width: meta.width,
    height: meta.height,
    bytes: input.blob.size,
    mimeType: input.blob.type || meta.mimeType,
    tags: input.tags,
    settings: input.settings,
    sourcePromptId: input.sourcePrompt?.id,
    sourcePromptTitle: input.sourcePrompt?.title,
  }

  await withStore(BLOB_STORE, "readwrite", (store) => store.put(input.blob, imageKey))
  await withStore(CARD_STORE, "readwrite", (store) => store.put(card))
  return card
}

export async function deleteLocalImageCard(card: LocalImageCard) {
  const url = objectUrls.get(card.imageKey)
  if (url) URL.revokeObjectURL(url)
  objectUrls.delete(card.imageKey)
  await withStore(BLOB_STORE, "readwrite", (store) => store.delete(card.imageKey))
  await withStore(CARD_STORE, "readwrite", (store) => store.delete(card.id))
}

export async function getLocalImageBlob(card: LocalImageCard) {
  const blob = await withStore<Blob | undefined>(BLOB_STORE, "readonly", (store) => store.get(card.imageKey))
  if (!blob) throw new Error("图片文件不存在")
  return blob
}

export async function resolveLocalImageUrl(card: LocalImageCard) {
  const cached = objectUrls.get(card.imageKey)
  if (cached) return cached

  const blob = await getLocalImageBlob(card)
  const url = URL.createObjectURL(blob)
  objectUrls.set(card.imageKey, url)
  return url
}

export async function imageResultToGeneratedImage(image: { id: string; dataUrl?: string; url?: string; mimeType?: string }, durationMs: number): Promise<GeneratedImage> {
  const blob = await imageSourceToBlob(image)
  const meta = await readImageMeta(blob)
  return {
    id: image.id,
    url: URL.createObjectURL(blob),
    blob,
    width: meta.width,
    height: meta.height,
    bytes: blob.size,
    mimeType: blob.type || image.mimeType || meta.mimeType,
    durationMs,
  }
}

export async function imageSourceToBlob(image: { dataUrl?: string; url?: string; mimeType?: string }) {
  const source = image.dataUrl || image.url
  if (!source) throw new Error("图片地址为空")

  const response = await fetch(source)
  const blob = await response.blob()
  if (blob.type || !image.mimeType) return blob
  return new Blob([blob], { type: image.mimeType })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function readImageMeta(blob: Blob) {
  const url = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("读取图片尺寸失败"))
      img.src = url
    })
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      mimeType: blob.type || "image/png",
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function sanitizeFilename(value: string, fallback = "image") {
  const clean = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 48)
  return clean || fallback
}
