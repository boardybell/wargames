// Every LIST GAMES entry is a real, self-contained playable game. A game is a
// component given onExit (return to the games list). The id is the exact menu
// label it is reached from. Games register themselves by exporting `entry`; the
// registry collects every *.game.tsx module so adding a game needs no central
// edit.
import type { ReactNode } from 'react'

export interface GameProps {
  /** Return to the LIST GAMES menu. */
  readonly onExit: () => void
}

export interface GameEntry {
  /** Exact LIST GAMES label this game is launched from. */
  readonly id: string
  /** The playable game. */
  readonly Component: (props: GameProps) => ReactNode
}
