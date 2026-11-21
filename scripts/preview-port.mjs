// The single source of truth for the Vite preview port. Section 01 owns this
// constant; section 02's playwright.config imports it so nothing hardcodes
// 4173 a second time. The services.json wargames-preview entry and the
// preview-port vitest both read this value.
// Not 4173: that port belongs to another always-on local service on the
// development Mac, and Playwright's reuseExistingServer would silently test it.
export const PREVIEW_PORT = 4797
