import { readFile } from "node:fs/promises"
import { NextRequest } from "next/server"

import { getReplayById, getSkinForReplay } from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import { canJudge } from "@/lib/roles"

export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  const { id } = await params
  const replay = getReplayById(Number(id))
  if (!replay) {
    return Response.json({ error: "not found" }, { status: 404 })
  }
  if (replay.osu_id !== user.osu_id && !canJudge(user.role)) {
    return Response.json({ error: "forbidden" }, { status: 403 })
  }
  if (!replay.skin_name) {
    return Response.json({ error: "not found" }, { status: 404 })
  }
  const skin = getSkinForReplay(replay.osu_id, replay.skin_name)
  if (!skin) {
    return Response.json({ error: "not found" }, { status: 404 })
  }
  if (!skin.file_path) {
    return Response.json({ error: "not found" }, { status: 404 })
  }
  try {
    const buffer = await readFile(skin.file_path)
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="skin-${skin.id}.osk"`,
      },
    })
  } catch {
    return Response.json({ error: "not found" }, { status: 404 })
  }
}
