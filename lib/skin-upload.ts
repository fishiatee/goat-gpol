import type { SkinApi } from "@/lib/replay-types"
import { MAX_SKIN_NAME_LENGTH } from "@/lib/upload-limits"

export const SKIN_RULESETS = ["osu", "mania", "catch", "taiko"] as const

export type SkinRuleset = (typeof SKIN_RULESETS)[number]

export type UploadProgress = {
  percent: number
  mbps: number
  phase?: "uploading" | "processing"
}

export function uploadSkin({
  name,
  file,
  rulesets,
  scrollSpeed,
  onProgress,
}: {
  name: string
  file: File
  rulesets: SkinRuleset[]
  scrollSpeed?: number
  onProgress?: (progress: UploadProgress) => void
}): Promise<SkinApi> {
  return new Promise((resolve, reject) => {
    if (!name.trim() || name.trim().length > MAX_SKIN_NAME_LENGTH) {
      reject(new Error("invalid name"))
      return
    }
    if (file.size === 0 || !file.name.toLowerCase().endsWith(".osk")) {
      reject(new Error(file.size === 0 ? "invalid file size" : "invalid file type"))
      return
    }
    const params = new URLSearchParams({
      name: name.trim(),
      fileName: file.name,
      rulesets: rulesets.join(","),
    })
    if (scrollSpeed !== undefined) {
      params.set("scrollSpeed", String(scrollSpeed))
    }
    const xhr = new XMLHttpRequest()
    xhr.open("POST", `/skins?${params}`)
    xhr.responseType = "json"
    xhr.timeout = 30 * 60 * 1000
    const startedAt = performance.now()
    let lastProgressAt = startedAt
    xhr.upload.onprogress = (e) => {
      if (!onProgress) {
        return
      }
      const now = performance.now()
      if (now - lastProgressAt < 100 && (!e.lengthComputable || e.loaded < e.total)) return
      lastProgressAt = now
      const elapsed = (now - startedAt) / 1000
      onProgress({
        percent: e.total > 0 ? Math.round((e.loaded / e.total) * 100) : 0,
        mbps: elapsed > 0 ? e.loaded / elapsed / (1024 * 1024) : 0,
        phase: e.lengthComputable && e.loaded === e.total ? "processing" : "uploading",
      })
    }
    xhr.upload.onload = () => {
      const elapsed = (performance.now() - startedAt) / 1000
      onProgress?.({ percent: 100, mbps: elapsed > 0 ? file.size / elapsed / (1024 * 1024) : 0, phase: "processing" })
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const skin = xhr.response as SkinApi | null
        if (!skin || typeof skin.id !== "number" || typeof skin.name !== "string" ||
          !Array.isArray(skin.rulesets) || !skin.rulesets.every((ruleset) => typeof ruleset === "string") ||
          typeof skin.createdAt !== "number" || typeof skin.submitter?.osuId !== "number" ||
          typeof skin.submitter?.username !== "string") {
          reject(new Error("skin-upload-failed"))
          return
        }
        resolve(skin)
      } else {
        reject(
          new Error(
            (xhr.response as { error?: string } | null)?.error ??
              "skin-upload-failed",
          ),
        )
      }
    }
    xhr.onerror = () => reject(new Error("skin-upload-failed"))
    xhr.onabort = () => reject(new Error("skin-upload-failed"))
    xhr.ontimeout = () => reject(new Error("skin-upload-timeout"))
    xhr.setRequestHeader("Content-Type", "application/octet-stream")
    xhr.send(file)
  })
}
