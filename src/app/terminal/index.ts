export { TerminalText, StatusLine, DetailPane } from './TerminalText'
export { MenuRows, type MenuRowItem, type MenuRowsProps } from './MenuRows'
export { ActionBar, type ActionBarItem } from './ActionBar'
export { CommandInput, type CommandInputProps } from './CommandInput'
export {
  parseCommand,
  normalizeCommand,
  registerShellVerb,
  registerScreenVerbs,
  unregisterScreenVerbs,
  resolveVerb,
  verbsForScreen,
  type VerbRegistration,
  type ParseResult,
  type LocalUiCommand,
} from './commandGrammar'
export {
  getContextHelp,
  registerDefaultVerbs,
  type HelpLine,
} from './helpRegistry'
