import { AppShell } from "@/components/app-shell"
import { LoginPage } from "@/components/login-page"
import {
  getSkinLimits,
  listReplaysByUser,
  listSkinsByUser,
  replayRowToApi,
} from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import { userPermissions } from "@/lib/permissions"

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { auth_error } = await searchParams
  const authError = typeof auth_error === "string" ? auth_error : undefined

  const user = await getSessionUser()
  if (!user) {
    return <LoginPage authError={authError} />
  }
  return (
    <AppShell
      user={{
        osuId: user.osu_id,
        username: user.username,
        avatarUrl: user.avatar_url,
        countryCode: user.country_code,
        role: user.role,
        permissions: userPermissions(user),
        bannedAt: user.banned_at,
      }}
      initialReplays={listReplaysByUser(user.osu_id).map((r) =>
        replayRowToApi(r, user.osu_id),
      )}
      initialSkins={listSkinsByUser(user.osu_id).map((skin) => ({
        id: skin.id,
        name: skin.name,
        rulesets: JSON.parse(skin.rulesets) as string[],
        scrollSpeed: skin.scroll_speed,
        createdAt: skin.created_at,
        submitter: { osuId: skin.osu_id, username: skin.uploader_username },
      }))}
      skinLimits={getSkinLimits()}
    />
  )
}
