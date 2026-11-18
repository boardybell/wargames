import { buildCtx, memoryPort, resetAll as resetState } from '../state/harness'
import { __resetGrammar } from '@app/terminal/commandGrammar'
import { __resetDefaultVerbs } from '@app/terminal/helpRegistry'
import { __resetScreenRegistry } from '@app/screens/screenRegistry'
import { __resetInputStack } from '@app/screens/inputStack'
import { __resetAnnounce } from '@app/a11y/announce'

export { buildCtx, memoryPort }

export function resetAll(): void {
  resetState()
  __resetGrammar()
  __resetDefaultVerbs()
  __resetScreenRegistry()
  __resetInputStack()
  __resetAnnounce()
}
