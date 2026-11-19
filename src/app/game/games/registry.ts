// Auto-collecting game registry. Every src/app/game/games/*.game.tsx module that
// exports `entry: GameEntry` is picked up here, so a new game is just a new file
// (no central edit, no merge conflicts when several are added at once).
import type { GameEntry } from './types'

const mods = import.meta.glob('./*.game.tsx', { eager: true }) as Record<
  string,
  { entry?: GameEntry }
>

export const GAME_REGISTRY: Record<string, GameEntry> = {}
for (const mod of Object.values(mods)) {
  if (mod.entry) GAME_REGISTRY[mod.entry.id] = mod.entry
}

/** The game launched from a LIST GAMES label, or undefined if none is wired. */
export function gameFor(id: string): GameEntry | undefined {
  return GAME_REGISTRY[id]
}
