// Presentation only. Never use this readable cookie to authorize API requests.
export const PLAYER_PROFILE_COOKIE = 'ladder_player'

export interface PlayerProfile {
  uid: string
  username: string
  exp: number
}

export function readPlayerProfile(cookies: string, now = Date.now()): PlayerProfile | null {
  const raw = cookies.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${PLAYER_PROFILE_COOKIE}=`))
    ?.slice(PLAYER_PROFILE_COOKIE.length + 1)
  if (!raw) return null
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as PlayerProfile
    if (!value || !/^[1-9]\d*$/.test(value.uid) || typeof value.uid !== 'string'
      || typeof value.username !== 'string' || !value.username || value.username.length > 100
      || !Number.isFinite(value.exp) || value.exp * 1000 <= now) return null
    return { uid: value.uid, username: value.username, exp: value.exp }
  } catch {
    return null
  }
}

export function buildPlayerProfileCookie(profile: PlayerProfile | null, now = Date.now()): string {
  const maxAge = profile ? Math.max(0, Math.floor(profile.exp - now / 1000)) : 0
  const value = profile && maxAge > 0
    ? encodeURIComponent(JSON.stringify({ uid: profile.uid, username: profile.username, exp: profile.exp }))
    : ''
  return `${PLAYER_PROFILE_COOKIE}=${value}; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
}
