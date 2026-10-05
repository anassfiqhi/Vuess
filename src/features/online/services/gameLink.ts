const GAME_ID = /^[A-Za-z0-9_-]{6,32}$/

/** The link a player sends to invite someone to an online game. */
export function inviteLink(gameId: string, origin = location.origin): string {
  return `${origin}/online/${gameId}`
}

/** Accepts a full invite link or just the game code; returns the game id or null. */
export function parseGameReference(text: string): string | null {
  const trimmed = text.trim()
  if (GAME_ID.test(trimmed)) return trimmed
  const match = /\/online\/([A-Za-z0-9_-]{6,32})(?:[/?#]|$)/.exec(trimmed)
  return match ? match[1]! : null
}
