import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MenuRows, type MenuRowItem } from '@app/terminal'

afterEach(cleanup)

const rows3: MenuRowItem[] = [
  { id: 'a', label: 'CRASH OUTLOOK' },
  { id: 'b', label: 'GROUND ALL FLIGHTS' },
  { id: 'c', label: 'FREEZE BANK ACCOUNTS' },
]

describe('MenuRows selection', () => {
  it('numeric, arrows+Enter, and tap all select the same id', () => {
    const onSelect = vi.fn()
    render(<MenuRows rows={rows3} onSelect={onSelect} />)
    const list = screen.getByTestId('menu-rows')
    fireEvent.keyDown(list, { key: '1' }) // numeric -> a
    fireEvent.keyDown(list, { key: 'Enter' }) // selected index 0 -> a
    fireEvent.click(screen.getByTestId('menu-row-a')) // tap -> a
    expect(onSelect).toHaveBeenCalledTimes(3)
    expect(onSelect.mock.calls.every((c) => c[0] === 'a')).toBe(true)
  })

  it('arrow keys move the selection before Enter commits', () => {
    const onSelect = vi.fn()
    render(<MenuRows rows={rows3} onSelect={onSelect} />)
    const list = screen.getByTestId('menu-rows')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('a fourth row appears only when passed and is selectable by every path', () => {
    const onSelect = vi.fn()
    const rows4 = [...rows3, { id: 'finale', label: 'GLOBAL FAILSAFE' }]
    render(<MenuRows rows={rows4} onSelect={onSelect} />)
    const list = screen.getByTestId('menu-rows')
    expect(screen.getByTestId('menu-row-finale')).toBeInTheDocument()
    fireEvent.keyDown(list, { key: '4' })
    fireEvent.click(screen.getByTestId('menu-row-finale'))
    expect(onSelect.mock.calls.filter((c) => c[0] === 'finale')).toHaveLength(2)
  })
})
