// The command line. Parses input to the same typed engine action a button
// would dispatch, a local UI command (overlays), or an error line. Unknown
// input prints UNRECOGNIZED COMMAND; an engine rejection prints INVALID with
// the engine reason. Both render as terminal output, never a dialog.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { send } from '../state'
import { parseCommand, type LocalUiCommand } from './commandGrammar'
import './terminal.css'

export interface CommandInputProps {
  readonly activeScreen: string
  readonly onUiCommand: (command: LocalUiCommand) => void
}

// Keep a bounded scrollback so a long campaign cannot grow the output forever.
const MAX_OUTPUT_LINES = 100

export function CommandInput({ activeScreen, onUiCommand }: CommandInputProps) {
  const [value, setValue] = useState('')
  const [output, setOutput] = useState<readonly string[]>([])

  const appendLine = (line: string): void => {
    setOutput((lines) => [...lines, line].slice(-MAX_OUTPUT_LINES))
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (value.trim().length === 0) return
    const result = parseCommand(value, activeScreen)
    if (result.kind === 'error') {
      appendLine(result.message)
    } else if (result.kind === 'ui') {
      onUiCommand(result.command)
    } else {
      const sent = send(result.action)
      if (sent.rejected) appendLine(`INVALID: ${sent.reason}`)
    }
    setValue('')
  }

  return (
    <form className="command-line" onSubmit={submit} data-testid="command-form">
      <label className="command-line">
        <span aria-hidden="true">{'>'}</span>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          data-testid="command-input"
          aria-label="command input"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div className="command-output" data-testid="command-output">
        {output.map((line, i) => (
          <div key={`${i}-${line}`}>{line}</div>
        ))}
      </div>
    </form>
  )
}
