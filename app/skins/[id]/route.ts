import { rm } from "node:fs/promises"
import { NextRequest } from "next/server"

import { deleteSkin, getSkinById } from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import { hasPermission } from "@/lib/permissions"

export const dynamic = "force-dynamic"

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  const { id } = await params
  const skin = getSkinById(Number(id))
  if (!skin) {
    return Response.json({ error: "not found" }, { status: 404 })
  }
  if (skin.osu_id !== user.osu_id && !hasPermission(user, "delete_skins")) {
    return Response.json({ error: "forbidden" }, { status: 403 })
  }
  deleteSkin(skin.id)
  if (skin.file_path) {
    await rm(skin.file_path, { force: true })
  }
  return new Response(null, { status: 204 })
}
