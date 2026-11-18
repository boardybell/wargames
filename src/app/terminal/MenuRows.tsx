// Numbered rows selectable by numeric key, arrow keys plus Enter, or tap. All
// three paths resolve to a single onSelect(id) callback, so the action the
// parent dispatches is identical by construction. The hidden fourth row is
// simply not passed in until the engine unlock selector includes it, so it is
// absent from the DOM when locked, not merely hidden.
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { shouldHandleKey } from '../a11y/keyHandler'
import './terminal.css'

export interface MenuRowItem {
  readonly id: string
  readonly label: string
}

export interface MenuRowsProps {
  readonly rows: readonly MenuRowItem[]
  readonly onSelect: (id: string) => void
}

export function MenuRows({ rows, onSelect }: MenuRowsProps) {
  const [selected, setSelected] = useState(0)

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
    if (
      !shouldHandleKey({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        isComposing: event.nativeEvent.isComposing,
        target: event.target,
      })
    ) {
      return
    }
    if (/^[1-9]$/.test(event.key)) {
      const digit = Number(event.key)
      if (digit <= rows.length) {
        event.preventDefault()
        onSelect(rows[digit - 1]!.id)
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((s) => Math.min(rows.length - 1, s + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((s) => Math.max(0, s - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const row = rows[selected]
      if (row) onSelect(row.id)
    }
  }

  return (
    <ul
      className="menu-rows"
      role="menu"
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-testid="menu-rows"
    >
      {rows.map((row, i) => (
        <li key={row.id}>
          <button
            type="button"
            className="menu-row"
            role="menuitem"
            data-selected={i === selected ? 'true' : 'false'}
            data-testid={`menu-row-${row.id}`}
            onClick={() => onSelect(row.id)}
          >
            {`${i + 1}. ${row.label}`}
          </button>
        </li>
      ))}
    </ul>
  )
}
