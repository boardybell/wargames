<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-repo-workflow
section-02-playwright-matrix
section-03-review-readme
END_MANIFEST -->

# Implementation Sections Index: 08-deploy-and-review

Implements claude-plan.md revision 2 with claude-plan-tdd.md. Section 01
lands early (right after splits 01 and 02 implement); 02 and 03 close
the project.

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-repo-workflow | - | 02, 03 | No |
| section-02-playwright-matrix | 01 | 03 | No |
| section-03-review-readme | 02 | - | No |

## Execution Order

1. section-01-repo-workflow (early, after splits 01 and 02 implement)
2. section-02-playwright-matrix (after split 06; fixture seed from
   @engine/testing)
3. section-03-review-readme (last)

## Section Summaries

### section-01-repo-workflow
git init and house-style first commit, gh repo create boardybell/wargames
--public, the hardened Actions workflow (concurrency, permissions block,
pinned versions, VITE_BASE expression, .nojekyll, phased gates with
Playwright on continue-on-error until split 06), Pages source via gh api,
the pre-publish hygiene scan, services.json registration on the shared
4173 constant, and the first-deploy smoke asserting hashed-asset 200s
under the subpath.

### section-02-playwright-matrix
The full spec matrix from the TDD plan against vite preview at the
/wargames/ base: activation, reload-resume and expired-session on the
short-deadline fixture, page.clock catch-up and clock-jump guards,
keyboard-only campaign, finale receipt-order validation through the UI,
reduced motion, sound and captions, glossary, mobile including the
compact flight list, subpath assets. Gate tightened to full in CI.

### section-03-review-readme
The capture-review script (deterministic walk, numbered shots, WAAPI
seeking, sidecar notes), the codex vision review loop with the
handoff-bundle outage branch, fix and re-capture rounds, the final
pass, the README (commands, walkthrough, Pages setup, verification
mapping table, honest reports, limitations), the live URL hand smoke,
and the final report to Bond.
