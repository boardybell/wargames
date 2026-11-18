// Replays the optimal game at a watchable pace on an injected cell renderer
// (the character grid in production, any matrix stub in tests). Skippable, and
// instant under reduced motion. Entirely outside campaign state; closing it
// leaves nothing behind. Section 04's idle HELP wires LIST GAMES to mount this.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { playOptimalGame, boardAfter, type Cell, type Move } from './tictactoe'

export interface TicTacToeViewProps {
  /** Defaults to the module's own optimal game. */
  readonly moves?: readonly Move[]
  readonly renderBoard: (cells: readonly Cell[]) => ReactNode
  readonly reducedMotion: boolean
  readonly stepMs?: number
  readonly onDone?: () => void
}

const DEFAULT_STEP_MS = 500

export function TicTacToeView({
  moves,
  renderBoard,
  reducedMotion,
  stepMs = DEFAULT_STEP_MS,
  onDone,
}: TicTacToeViewProps) {
  const list = moves ?? playOptimalGame().moves
  const total = list.length
  // Identity of the actual game, not the array reference, so a re-render with a
  // fresh-but-equal move list does not restart playback or re-arm the latch.
  const signature = list.map((m) => `${m.player}${m.cell}`).join(',')
  const [revealed, setRevealed] = useState(() => (reducedMotion ? total : 0))
  const doneFired = useRef(false)
  const lastSignature = useRef(signature)

  useEffect(() => {
    // Only a NEW game re-arms the done latch; a motion or pace change does not,
    // so onDone cannot re-fire for an already-finished game.
    if (lastSignature.current !== signature) {
      lastSignature.current = signature
      doneFired.current = false
    }
    if (reducedMotion || total === 0) {
      setRevealed(total)
      return
    }
    setRevealed(0)
    let count = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = (): void => {
      count += 1
      setRevealed(count)
      if (count < total) timer = setTimeout(tick, stepMs)
    }
    timer = setTimeout(tick, stepMs)
    return () => clearTimeout(timer)
  }, [signature, reducedMotion, stepMs])

  useEffect(() => {
    if (revealed >= total && total > 0 && !doneFired.current) {
      doneFired.current = true
      onDone?.()
    }
  }, [revealed, total, onDone])

  const skip = (): void => setRevealed(total)
  const complete = revealed >= total
  const cells = boardAfter(list, revealed)

  return (
    <div className="tictactoe" data-testid="tictactoe">
      <div data-testid="tictactoe-board">{renderBoard(cells)}</div>
      <p className="tictactoe-status" data-testid="tictactoe-status">
        {complete ? 'A STRANGE GAME. THE ONLY WINNING MOVE IS NOT TO PLAY.' : null}
      </p>
      {!complete ? (
        <button
          type="button"
          className="tictactoe-skip"
          data-testid="tictactoe-skip"
          onClick={skip}
        >
          SKIP
        </button>
      ) : null}
    </div>
  )
}
