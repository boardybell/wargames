// The glossary term primitive. Renders a term inline as a real button (simpler
// and more robust than a span with role and tabindex) with a dotted underline
// style hook. Pointer hover and keyboard focus open the definition; blur and
// mouse-leave close it; click toggles; Escape closes while open. The popup is a
// plain-text, non-interactive tooltip associated by aria-describedby, so no
// focus trap is needed. A term can be given inline (term + definition) or by
// id, in which case it is looked up in the project glossary and an unregistered
// id fails loudly.
import { useId, useState } from 'react'
import { getGlossaryEntry, hasGlossaryEntry } from './glossary'
import './a11y.css'

function resolveEntry(
  id: string,
): { term: string; definition: string } {
  if (hasGlossaryEntry(id)) return getGlossaryEntry(id)
  // A missing id is a content bug. Fail loudly in dev; in production degrade to
  // the raw id so a bad term never white-screens the game.
  if (import.meta.env.DEV) {
    throw new Error(`glossary: no entry registered for id "${id}"`)
  }
  console.error(`glossary: no entry registered for id "${id}"`)
  return { term: id, definition: '' }
}

export type GlossaryTermProps =
  | { readonly id: string; readonly term?: never; readonly definition?: never }
  | {
      readonly id?: never
      readonly term: string
      /** Plain-language definition for a smart layperson. */
      readonly definition: string
    }

export function GlossaryTerm(props: GlossaryTermProps) {
  const popupId = useId()
  const [open, setOpen] = useState(false)

  const entry =
    'id' in props && props.id !== undefined
      ? resolveEntry(props.id)
      : { term: props.term, definition: props.definition }

  return (
    <span className="glossary-wrap">
      <button
        type="button"
        className="glossary-term"
        data-testid="glossary-term"
        aria-expanded={open}
        aria-describedby={open ? popupId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        // Click OPENS (idempotent with focus) rather than toggling, so a touch
        // tap (which fires focus then click) reliably opens instead of netting
        // to closed. Close is via blur, mouse-leave, or Escape.
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation()
            setOpen(false)
          }
        }}
      >
        {entry.term}
      </button>
      {open ? (
        <span
          role="tooltip"
          id={popupId}
          className="glossary-popup"
          data-testid="glossary-popup"
        >
          {entry.definition}
        </span>
      ) : null}
    </span>
  )
}
