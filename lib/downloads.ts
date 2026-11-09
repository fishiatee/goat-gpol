export function skinDownloadDisposition(player: string, skinName: string): string {
  const filename = `${player} - ${skinName}.osk`
    .toWellFormed()
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, "_")
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_")
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}
