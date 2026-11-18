import { buildCtx, memoryPort, resetAll as resetState } from '../state/harness'
import { __resetGrammar } from '@app/terminal/commandGrammar'
import { __resetDefaultVerbs } from '@app/terminal/helpRegistry'
import { __resetScreenRegistry } from '@app/screens/screenRegistry'
import { __resetScreenUiHandlers } from '@app/screens/screenUiCommands'
import { __resetInputStack } from '@app/screens/inputStack'
import { __resetDialogState } from '@app/screens/dialogState'
import { __resetAnnounce } from '@app/a11y/announce'
import { __resetAudio } from '@app/audio'
import { __resetMotion } from '@app/a11y/motion'
import { __resetReduceGlow } from '@app/theme/reduceGlow'

export { buildCtx, memoryPort }

export function resetAll(): void {
  resetState()
  __resetGrammar()
  __resetDefaultVerbs()
  __resetScreenRegistry()
  __resetScreenUiHandlers()
  __resetInputStack()
  __resetDialogState()
  __resetAnnounce()
  __resetAudio()
  __resetMotion()
  __resetReduceGlow()
}
