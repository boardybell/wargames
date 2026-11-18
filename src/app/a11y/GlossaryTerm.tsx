// Glossary term primitive stand-in. Section 09 builds the real
// focus-and-tap-friendly definition popover with the per-project glossary;
// this renders the term with its definition as an accessible description, so
// settings and mission copy can wrap jargon now and section 09 upgrades the
// presentation without touching callers.
import type { ReactNode } from 'react'

export interface GlossaryTermProps {
  readonly term: ReactNode
  /** Plain-language definition for a smart layperson. */
  readonly definition: string
}

export function GlossaryTerm({ term, definition }: GlossaryTermProps) {
  return (
    <abbr
      className="glossary-term"
      title={definition}
      data-testid="glossary-term"
      tabIndex={0}
    >
      {term}
    </abbr>
  )
}
