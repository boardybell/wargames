// Shared native-dialog mechanics for the overlay suite. showModal gives the
// focus trap, background inerting, and Escape-to-close for free; this wrapper
// adds aria-labelledby, explicit initial focus, focus restore to the
// previously focused element, an optional cancel guard (for confirmation
// sub-states), and it raises the input precedence stack's dialog layer so an
// open dialog consumes keys before anything underneath. Parent state is the
// single source of truth: onClose is the dialog REQUESTING close (Escape or a
// button); a prop-driven close (open went false) restores focus but does not
// re-fire onClose, so switching between overlays never clobbers the new one.
import { useEffect, useRef } from 'react'
import type { ReactNode, SyntheticEvent } from 'react'
import { setDialogOpen } from './inputStack'
import './dialog.css'

export interface DialogProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly labelledBy: string
  readonly initialFocus?: () => HTMLElement | null
  readonly allowCancel?: boolean
  readonly testId?: string
  readonly children: ReactNode
}

export function Dialog({
  open,
  onClose,
  labelledBy,
  initialFocus,
  allowCancel = true,
  testId,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const prevFocus = useRef<Element | null>(null)
  const programmatic = useRef(false)
  const openRef = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      prevFocus.current = document.activeElement
      dialog.showModal()
      setDialogOpen(true)
      openRef.current = true
      initialFocus?.()?.focus()
    } else if (!open && dialog.open) {
      programmatic.current = true
      dialog.close()
    }
  }, [open, initialFocus])

  // Safety net: removing a <dialog open> from the DOM dispatches no close
  // event, so a dialog that unmounts while open would otherwise strand the
  // precedence stack's dialog layer true and swallow every key app-wide.
  useEffect(() => {
    return () => {
      if (openRef.current) {
        setDialogOpen(false)
        if (prevFocus.current instanceof HTMLElement) prevFocus.current.focus()
      }
    }
  }, [])

  const handleNativeClose = (): void => {
    setDialogOpen(false)
    openRef.current = false
    if (prevFocus.current instanceof HTMLElement) prevFocus.current.focus()
    const wasProgrammatic = programmatic.current
    programmatic.current = false
    if (!wasProgrammatic) onClose()
  }

  const handleCancel = (event: SyntheticEvent): void => {
    if (!allowCancel) event.preventDefault()
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      data-testid={testId}
      className="crt-dialog"
      onClose={handleNativeClose}
      onCancel={handleCancel}
    >
      {children}
    </dialog>
  )
}
