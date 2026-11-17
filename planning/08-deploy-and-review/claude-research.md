# Research: 08-deploy-and-review

2026-11-17. No new web research: the requirements already cite the
official GitHub Pages workflow and Vite deployment guides, and the
Playwright-for-production-preview pattern is standard. Machine facts:
gh CLI available (boardybell account per global config), codex vision
lane confirmed for the screenshot review (codex exec -i). Local
service-registration house rule applies to the preview server
(~/mainframe/services.json).

## Testing approach

This split IS the verification: the full automated matrix from the
requirements runs in CI (engine node tests, shell jsdom tests, mission
suites) plus a Playwright layer against vite preview with a
repository-style base path for browser-level checks (hero activation
paths, reload resume, keyboard-only campaign, reduced motion, mobile
widths, audio unlock smoke). Known-seed deterministic runs make the
screenshot set reproducible for the codex review.
