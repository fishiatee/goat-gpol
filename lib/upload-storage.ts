import "server-only"

import { randomUUID } from "node:crypto"
import { createWriteStream } from "node:fs"
import { mkdir, open, rename, rm } from "node:fs/promises"
import path from "node:path"
import { Readable, Transform, type TransformCallback } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ReadableStream as NodeReadableStream } from "node:stream/web"

export class UploadError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

class UploadGuard extends Transform {
  private seen = 0
  private prefix = Buffer.alloc(0)

  constructor(
    private maxBytes = Infinity,
    private expectedBytes?: number,
    private magic?: Buffer,
  ) {
    super()
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
    this.seen += chunk.length
    if (this.seen > this.maxBytes) {
      callback(new UploadError("file too large", 413))
      return
    }
    if (this.magic && this.prefix.length < this.magic.length) {
      this.prefix = Buffer.concat([
        this.prefix,
        chunk.subarray(0, this.magic.length - this.prefix.length),
      ])
      if (this.prefix.length === this.magic.length && !this.prefix.equals(this.magic)) {
        callback(new UploadError("invalid file type", 400))
        return
      }
    }
    callback(null, chunk)
  }

  _flush(callback: TransformCallback) {
    if (this.seen === 0) {
      callback(new UploadError("invalid file size", 400))
    } else if (this.magic && this.prefix.length < this.magic.length) {
      callback(new UploadError("invalid file type", 400))
    } else if (this.expectedBytes !== undefined && this.seen !== this.expectedBytes) {
      callback(new UploadError("incomplete upload", 400))
    } else {
      callback()
    }
  }
}

export async function removeUpload(filePath: string) {
  try {
    await rm(filePath, { force: true })
  } catch (error) {
    console.error("Could not clean up upload", error)
  }
}

export async function validateZipUpload(filePath: string) {
  const file = await open(filePath, "r")
  try {
    const { size } = await file.stat()
    if (size < 22) throw new UploadError("invalid file type", 400)
    const tail = Buffer.alloc(Math.min(size, 22 + 65535))
    const { bytesRead } = await file.read(tail, 0, tail.length, size - tail.length)
    if (bytesRead !== tail.length) throw new UploadError("incomplete upload", 400)
    for (let offset = tail.length - 22; offset >= 0; offset--) {
      if (tail.readUInt32LE(offset) !== 0x06054b50 ||
        offset + 22 + tail.readUInt16LE(offset + 20) !== tail.length) continue
      const directorySize = tail.readUInt32LE(offset + 12)
      const directoryOffset = tail.readUInt32LE(offset + 16)
      if (directorySize === 0xffffffff || directoryOffset === 0xffffffff) return
      if (directorySize < 46 || directoryOffset + directorySize > size - tail.length + offset) continue
      const signature = Buffer.alloc(4)
      const directoryRead = await file.read(signature, 0, 4, directoryOffset)
      if (directoryRead.bytesRead === 4 && signature.readUInt32LE(0) === 0x02014b50) return
    }
    throw new UploadError("invalid file type", 400)
  } finally {
    await file.close()
  }
}

export async function storeUpload({
  body,
  directory,
  extension,
  maxBytes,
  expectedBytes,
  magic,
  signal,
  validate,
}: {
  body: ReadableStream<Uint8Array>
  directory: "skins" | "replays"
  extension: ".osk" | ".osr"
  maxBytes?: number
  expectedBytes?: number
  magic?: Buffer
  signal: AbortSignal
  validate?: (filePath: string) => Promise<void>
}): Promise<string> {
  const dir = path.join(process.cwd(), "data", directory)
  const filePath = path.join(dir, `${randomUUID()}${extension}`)
  const tempPath = `${filePath}.part`
  try {
    await mkdir(dir, { recursive: true })
    await pipeline(
      Readable.fromWeb(body as unknown as NodeReadableStream),
      new UploadGuard(maxBytes, expectedBytes, magic),
      createWriteStream(tempPath, { flags: "wx" }),
      { signal },
    )
    await validate?.(tempPath)
    signal.throwIfAborted()
    await rename(tempPath, filePath)
    return filePath
  } catch (error) {
    await removeUpload(tempPath)
    if (signal.aborted) throw new UploadError("upload aborted", 400)
    throw error
  }
}
