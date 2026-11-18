// A blinking block cursor. Decorative only: aria-hidden, pointer-events none.
import './crt.css'

export function Cursor() {
  return (
    <span
      className="crt-cursor"
      data-testid="crt-cursor"
      aria-hidden="true"
      style={{ pointerEvents: 'none' }}
    >
      {'█'}
    </span>
  )
}
