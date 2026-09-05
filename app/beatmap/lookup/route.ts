import { NextRequest } from "next/server"

import { withUserApi } from "@/lib/auth"
import { getSessionUser } from "@/lib/session"

export const dynamic = "force-dynamic"

const DIFFICULTY_MODS = ["EZ", "HD", "HR", "DT", "NC", "HT", "FL", "TD"]

export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  const checksum = request.nextUrl.searchParams.get("checksum")
  if (!checksum) {
    return Response.json({ error: "missing checksum" }, { status: 400 })
  }
  const mods = (request.nextUrl.searchParams.get("mods") ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => DIFFICULTY_MODS.includes(m))
  try {
    const { beatmap, starRating } = await withUserApi(user.osu_id, async (api) => {
      const beatmap = await api.lookupBeatmap({ checksum })
      let starRating = beatmap.difficulty_rating
      if (mods.length > 0) {
        try {
          const attributes = await api.getBeatmapDifficultyAttributesOsu(
            beatmap.id,
            mods,
          )
          starRating = attributes.star_rating
        } catch {
        }
      }
      return { beatmap, starRating }
    })
    return Response.json({
      id: beatmap.id,
      title: beatmap.beatmapset.title,
      artist: beatmap.beatmapset.artist,
      creator: beatmap.beatmapset.creator,
      version: beatmap.version,
      starRating,
      maxCombo: beatmap.max_combo,
      url: beatmap.url,
      backgroundUrl: beatmap.beatmapset.covers.cover,
      coverListUrl: beatmap.beatmapset.covers.list,
    })
  } catch {
    return Response.json({ error: "beatmap not found" }, { status: 404 })
  }
}