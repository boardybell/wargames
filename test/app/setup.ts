import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Vitest globals are off, so Testing Library's auto-cleanup does not run on
// its own. Unmount between tests to keep one render per test in the DOM.
afterEach(cleanup)
