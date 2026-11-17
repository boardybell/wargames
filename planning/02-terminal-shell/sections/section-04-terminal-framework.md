# Section 04: Terminal Framework and Screens

Section id: `section-04-terminal-framework`
Target file: `/Users/darkpool/wargames/planning/02-terminal-shell/sections/section-04-terminal-framework.md`

## Context

This is part of the terminal shell for SHALL WE PLAY A GAME?, a WarGames-inspired browser game. A headless engine (split 01, pure TypeScript under `src/engine/`) owns all game state and exposes `createCampaign`, `dispatch(state, action, now)`, `advanceToNow`, pure selectors, and a test-double mission via the `@engine/testing` export. The shell (React 18+, Vite, TypeScript, under `src/app/`) renders what the engine says, captures input as typed engine actions, and never invents game state. Tests run in a Vitest jsdom project under `test/app/**` with Testing Library; the engine is real in these tests (node-compatible pure TS), with the test-double mission from `@engine/testing`.

This section builds the terminal framework: the screen model and router, the terminal UI primitives that mission splits consume, the command input and its grammar, context-sensitive HELP, the input precedence stack, menu behavior including the hidden fourth row, and the debrief frame with its ACKNOWLEDGE control.

House rules that apply to all content and code: no em-dashes anywhere, in any content, code, comments, or strings.

## Dependencies

- `section-01-app-scaffold`: src/app tree, jsdom Vitest project, App shell with screen router skeleton and dialog host, `urlFor(path)` helper.
- `section-02-engine-binding`: the store, `useCampaign()`, `send(action)` with rejection surfacing, `wake()`, emitted-event relay.
- `section-03-crt-theme`: palette tokens, CRT layer stack, type-in hook with instant-completion API and reduced-motion behavior.
- `section-09-a11y-glossary`: the shared key-handler utility (bail conditions for editable targets, held modifiers, isComposing), `announce(text, channel)`, `moveFocusTo(screenRoot)`.

This section blocks sections 05 (hero-pushin), 06 (overlays-settings), and 08 (cabinet-grid). Do not implement dialogs, settings content, glossary terms, the character grid, or cabinet chrome here; those live in their own sections. The overlay open/close plumbing this section needs (settings and help as local UI state, not engine phases) is limited to routing hooks; the dialog contents arrive in section 06.

## Files

Create or modify:

    src/app/terminal/
      TerminalText.tsx        styled text block respecting the terminal rhythm
      MenuRows.tsx            numbered rows, arrow/numeric/tap selection
      StatusLine.tsx
      ActionBar.tsx           buttons that send engine actions, inline rejections
      DetailPane.tsx
      CommandInput.tsx        command line, parse to engine actions
      commandGrammar.ts       tokenizer, verb registry, parse
      helpRegistry.ts         per-screen verb registration, context HELP
    src/app/screens/
      ScreenRouter.tsx        ScreenId union, phase-to-screen mapping
      screenRegistry.ts       mission screen registration + fallback frame
      MenuScreen.tsx          the three-row (plus hidden fourth) main menu
      DebriefScreen.tsx       debrief frame with ACKNOWLEDGE control
      precedence.ts           input precedence layers over the shared key handler
    test/app/terminal/
      commandGrammar.test.ts
      commandInput.test.tsx
      helpRegistry.test.ts
      menuRows.test.tsx
    test/app/screens/
      screenRouter.test.tsx
      menuScreen.test.tsx
      debriefScreen.test.tsx
      precedence.test.ts

The router skeleton from section 01 (`App.tsx`) gets its real screen mapping here.

## Tests first (TDD block 6: menu, grammar, precedence, debrief)

Write these before implementation. Stubs say what to test, not how. Use Testing Library for component tests; the engine is real with the `@engine/testing` test-double mission.

### Menu (test/app/screens/menuScreen.test.tsx, test/app/terminal/menuRows.test.tsx)

- Exact opening text and spacing snapshot for the menu screen.
- Selection by numeric key, arrows plus Enter, and tap all dispatch identical actions (assert strict equality of the dispatched action values across the three input paths).
- Fourth row is absent from the DOM until the engine unlock selector says so, then it appears and is selectable by every input path.
- Selecting a settled mission opens its engine-provided record view.

### Command grammar (test/app/terminal/commandGrammar.test.ts, commandInput.test.tsx)

- Case-folding to upper, whitespace trim and collapse, verb-first parse.
- Mission verb shadows shell verb on the active screen (active-screen mission verbs resolve before shell verbs).
- Registering a colliding verb throws in dev at registration time.
- Unknown input renders `UNRECOGNIZED COMMAND: <input>`; engine-rejected commands render `INVALID: <engine reason>` as terminal output.
- Command-button identity: for every verb shared between CommandInput and an ActionBar button, the parsed action value strict-equals the button-dispatched action.

### HELP (test/app/terminal/helpRegistry.test.ts)

- HELP is context-sensitive: lists exactly the verbs registered by the active screen.
- LIST GAMES appears only in idle HELP (menu screen, no active mission), nowhere else.

### Precedence (test/app/screens/precedence.test.ts)

- Input precedence stack, top wins: open native dialog consumes keys over everything; active diegetic prompt consumes only its answer keys; running type-in swallows any non-consumed key and completes; then menu shortcuts and screen actions; then global shortcuts.
- Collision cases pinned by the plan: pressing 1 during a type-in completes the type-in and is swallowed (no row selection); pressing Y during the sound prompt answers the prompt and does not skip a type-in.
- Menu shortcuts are ignored while the command input has focus (the shared handler bails on editable targets; assert through this layer).
- Test per layer and per collision case.

### Debrief (test/app/screens/debriefScreen.test.tsx)

- The ACKNOWLEDGE control (both the button and the ACKNOWLEDGE command) dispatches `ACKNOWLEDGE_DEBRIEF`; returning to menu happens through the resulting engine state, not local navigation.
- After the third acknowledgment, the menu shows row four (drive the real engine through three mission settlements with the test double).

### Router (test/app/screens/screenRouter.test.tsx)

- Screen router renders the correct screen from engine phases (menu, mission, debrief, finale); settings and help are overlays layered over the phase screen, not phases.
- An unregistered mission id renders the plain fallback frame; a registered mission component mounts keyed by its id (exercise with the test-double mission).
- `moveFocusTo` is invoked with the new screen root on every screen change (spy; the focus mechanics themselves are tested in section 09).

## Implementation

### Screen model and router (src/app/screens/)

ScreenId union:

    type ScreenId =
      | 'hero' | 'menu' | `mission:${string}` | 'debrief'
      | 'finale' | 'settings' | 'help'

The App router renders the active screen from engine phase plus local UI state. Settings and help are overlays, not engine phases: they render above whatever phase screen is active and close back to it. Hero routing (skip on active mission, and so on) is section 05's concern; this section provides the mapping from engine phase to menu, mission, debrief, and finale screens, and the overlay slots.

Mission screen registry: mission splits register screen components keyed by mission id.

    function registerMissionScreen(missionId: string, component: ComponentType<MissionScreenProps>): void
    function resolveMissionScreen(missionId: string): ComponentType<MissionScreenProps>
      // returns the registered component or the plain fallback frame

The fallback frame is a plain terminal layout that renders mission title, status, and an ActionBar from engine selectors, so this split is fully testable against the engine's test-double mission before any mission split lands.

On every screen change, call `moveFocusTo(screenRoot)` from the a11y spine (section 09) to focus the new screen's heading or command input.

### Terminal primitives (src/app/terminal/)

Exported to mission splits:

- `TerminalText`: styled block respecting the terminal rhythm (uses the CRT theme tokens and pre/output semantics from section 03).
- `MenuRows`: numbered rows; arrow-key and numeric selection, Enter to commit, row taps; a hidden fourth row driven by the engine unlock selector. All three input paths resolve to one selection callback so the dispatched action is identical by construction.
- `StatusLine`: single-line status readout.
- `ActionBar`: buttons that call `send(action)` from the engine binding (section 02) and render rejection results inline next to the control.
- `DetailPane`: secondary detail region.
- `CommandInput`: the command line (below).

The character grid is section 08; do not build it here, but the primitives' prop surfaces should not assume its absence (mission screens compose both).

### Command grammar (src/app/terminal/commandGrammar.ts)

Pinned grammar rules, from the plan's review integrations:

- Normalize: trim, collapse internal whitespace, case-fold to upper.
- Verb-first tokens; verbs defined by the shell and by missions, for example HELP, SOUND ON, READ M03, SEND M03 BACKUP.
- Resolution order: active-screen mission verbs resolve before shell verbs (shadowing).
- Registry collisions (two registrations of the same verb in the same scope) throw in dev at registration time.
- Parse output is the same typed engine action a button would dispatch; command-button identity is asserted on parsed action values in tests.
- Rejections: unparseable input prints `UNRECOGNIZED COMMAND: <input>`; engine rejections print `INVALID: <engine reason>`. Both render as terminal output lines, not toasts or dialogs.

Sketch:

    interface VerbRegistration {
      verb: string                       // upper-cased at registration
      parse(tokens: string[]): EngineAction | LocalUiCommand | ParseError
      helpText: string
    }
    function registerShellVerb(reg: VerbRegistration): void   // throws on collision in dev
    function registerScreenVerbs(screenId: ScreenId, regs: VerbRegistration[]): void
    function parseCommand(raw: string, activeScreen: ScreenId): ParseResult

### Context HELP (src/app/terminal/helpRegistry.ts)

HELP lists currently valid verbs from the active screen's registration, with their helpText lines. LIST GAMES is registered only in the idle (menu, no active mission) context and triggers the tic-tac-toe demonstration (the demonstration module itself is section 10; wire the verb to a callback prop or event so this section does not depend on it).

### Input precedence stack (src/app/screens/precedence.ts)

Implemented once, layered over the shared key-handler utility from section 09 (which already bails on editable targets, held modifiers, and isComposing). Precedence, top wins:

1. Open native dialog: consumes all keys (native showModal behavior; the stack simply yields when a dialog is open).
2. Active diegetic prompt: consumes only its answer keys (for example Y and N for the sound prompt); other keys fall through.
3. Running type-in: any non-consumed key completes the type-in instantly and is swallowed.
4. Menu shortcuts and screen actions (numeric rows, arrows, Enter, screen-registered keys).
5. Global shortcuts.

The sound prompt itself is section 05's feature; this section implements the prompt layer as a generic "diegetic prompt" slot in the stack so section 05 plugs into it. The type-in hook comes from section 03; the stack calls its completion API.

### Menu behavior (src/app/screens/MenuScreen.tsx)

Exact opening text and spacing per the design (snapshot-pinned in the tests; author the copy once and treat the snapshot as the contract). Numeric shortcuts, arrows with Enter, row taps, all through the single key-handler utility. Selecting a settled mission opens its record view, which the engine provides via selector. The fourth row appears only when the engine unlock selector says so; it must be absent from the DOM when locked, not merely hidden.

### Debrief frame (src/app/screens/DebriefScreen.tsx)

An explicit ACKNOWLEDGE control, both a button in the ActionBar and an ACKNOWLEDGE verb in the command registry, wired to the `ACKNOWLEDGE_DEBRIEF` engine action through `send()`. Returning to the menu happens through the resulting engine state; the debrief screen never navigates locally. The fourth-row unlock follows the engine selector, which the tests exercise end to end by settling three missions on the test double.

## Definition of done

All tests in this section's TDD block pass under `npm test` (jsdom project), alongside the existing engine tests. The fallback mission frame renders and operates against the `@engine/testing` test-double mission: screen registration, action dispatch through buttons and commands with identical action values, settlement into debrief, ACKNOWLEDGE back to menu, and the fourth-row unlock after the third acknowledgment. No em-dashes anywhere in code, comments, copy, or tests.