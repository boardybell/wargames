// The single source of truth for the Vite preview port. Section 01 owns this
// constant; section 02's playwright.config imports it so nothing hardcodes
// 4173 a second time. The services.json wargames-preview entry and the
// preview-port vitest both read this value.
export const PREVIEW_PORT = 4173
