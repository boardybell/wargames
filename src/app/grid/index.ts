// The grid package surface: the character grid, the branch-trace playback, the
// shared compact breakpoint, and the narrow-viewport hook the cabinet reuses.
export {
  CharacterGrid,
  type CharacterGridProps,
  type GridCell,
  type GridSelection,
} from './CharacterGrid'
export {
  PlayBranchTrace,
  type PlayBranchTraceProps,
} from './playBranchTrace'
export { COMPACT_BREAKPOINT_PX } from './constants'
export { useNarrowViewport } from './useNarrow'
