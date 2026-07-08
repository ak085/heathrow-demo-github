export interface ExpiryTag {
  text:  string
  color: string
}

function formatDuration(hours: number): string {
  if (hours > 48) return `${Math.round(hours / 24)}d`
  return `${hours}h`
}

/** Static (non-ticking) "expires in Xh/Xd" / "Expired Xh/Xd ago" label from a UTC timestamp. */
export function expiryTag(expiresAt: string | null): ExpiryTag | null {
  if (!expiresAt) return null
  const hours = Math.round((new Date(expiresAt).getTime() - Date.now()) / 3_600_000)
  if (hours <= 0) return { text: `Expired ${formatDuration(Math.abs(hours))} ago`, color: 'red' }
  if (hours <= 24) return { text: `Expires in ${formatDuration(hours)}`, color: 'orange' }
  return { text: `Expires in ${formatDuration(hours)}`, color: 'default' }
}
