# Section 06: Overlays and Settings (Native Dialog Suite)

## Scope

The modal layer of the terminal shell: the pause dialog, the settings dialog, the New Campaign confirmation, the help overlay, and the corrupt-save notice. All five are native `<dialog>` elements opened with `showModal()`, rendered through the dialog host that the App shell already provides. They are UI overlays, not engine phases: the screen router never changes when one opens, and the engine countdown keeps running underneath (the pause dialog says so in its copy).

Everything here renders what the engine says and dispatches typed engine actions through the single `send()` path. No dialog invents game state.

## Project context (self-contained background)

This is the player-facing frame of SHALL WE PLAY A GAME?, a WarGames-inspired browser game. React 18+, Vite, TypeScript, static build for GitHub Pages at a subpath, so every asset URL goes through the `urlFor(path)` helper (no raw absolute paths). Dependencies are react, react-dom, pure-rand, valibot only; no UI libraries. House rule: no em-dashes anywhere, in copy, code, or comments.

The headless engine lives in `src/engine/` and is real in tests. It exposes `createCampaign`, `dispatch(state, action, now)`, `advanceToNow`, pure selectors, seed catalog metadata, and a save codec. Engine calls return `{ state, emitted: EngineEvent[] }`. The shell's state binding (`src/app/state/`, built in section 02) wraps this behind:

    function useCampaign(): CampaignState     // subscription hook
    function send(action: EngineAction): void // the only mutation path;
                                              // samples now = Date.now(),
                                              // surfaces rejections inline

Two engine contract facts this section leans on directly:

1. `CampaignState` carries `startedMissionIds`. The extended-time preference is an engine preference editable only while that array is empty. Once any mission has started, the control locks and must say why.
2. The save binding exposes a recovery flag: `'clean' | 'recovered-backup' | 'reset'`. Anything other than `'clean'` means the corrupt-save notice renders.

The seed catalog metadata (from the engine) provides exactly three named seeds with descriptions. The New Campaign dialog lists these three and nothing else; there is no free seed input.

Audio preferences are `{master, voice, effects, ambience}`, persisted by the audio module (section 07). One persisted master value backs both the diegetic ENABLE SOUND? prompt on the hero path and the settings master switch; the settings dialog reads and writes that same backing value, never a copy.

## Files

Create:

- `/Users/darkpool/wargames/src/app/screens/PauseDialog.tsx`
- `/Users/darkpool/wargames/src/app/screens/SettingsDialog.tsx`
- `/Users/darkpool/wargames/src/app/screens/NewCampaignDialog.tsx`
- `/Users/darkpool/wargames/src/app/screens/HelpOverlay.tsx`
- `/Users/darkpool/wargames/src/app/screens/CorruptSaveNotice.tsx`
- `/Users/darkpool/wargames/src/app/screens/dialogState.ts` (local UI state for which overlay is open; settings and help are overlays, not phases)
- `/Users/darkpool/wargames/test/app/screens/pause-dialog.test.tsx`
- `/Users/darkpool/wargames/test/app/screens/settings-dialog.test.tsx`
- `/Users/darkpool/wargames/test/app/screens/new-campaign-dialog.test.tsx`
- `/Users/darkpool/wargames/test/app/screens/help-overlay.test.tsx`
- `/Users/darkpool/wargames/test/app/screens/corrupt-save-notice.test.tsx`

Modify:

- `/Users/darkpool/wargames/src/app/App.tsx` to mount the dialogs in the existing dialog host and to route Escape and the MENU control into the pause dialog through the shared key handler.

Tests run under the jsdom Vitest project (`test/app/**`), Testing Library, `npm test`. Note that jsdom's `<dialog>` support is partial; if `showModal` is missing in the installed jsdom, polyfill it minimally in test setup (open attribute plus focus behavior) rather than changing the production code to a div-based modal.

## Tests first

Write these before implementation. Stubs describe what to assert, not how.

### pause-dialog.test.tsx

- opens on Escape keypress during an active mission screen, and on activating the visible MENU control; both paths open the same dialog.
- while open, the dialog consumes all keys: a numeric menu shortcut pressed with the pause dialog open selects nothing underneath (input precedence, dialog layer wins).
- copy states that the countdown continues while paused; the dialog never dispatches any pause action to the engine (there is none; assert `send` spy not called on open).
- Resume closes the dialog and returns focus to the element focused before open.
- End Mission requires typed confirmation (the player types a confirmation word into a field) before `send` fires the forfeit action; an unconfirmed activation dispatches nothing; a confirmed one dispatches FORFEIT_MISSION exactly once and the flush-immediately save path applies (assert via the state binding's test seam, reference only, owned by section 02).
- dialog carries aria-labelledby pointing at its heading; initial focus lands on Resume (the safe default).

### settings-dialog.test.tsx

- renders toggles for effects, voice, ambience, and master; the voice toggle carries the AI-generated-voice label text.
- toggling persists: flip a toggle, unmount, remount, the toggle reflects the stored value (audio pref storage mocked or real localStorage per the audio module's port).
- master switch and the diegetic prompt share one backing value: with the prompt previously answered Y, settings shows master on; flipping it off in settings is visible to a fresh read of the same persisted key (single source assertion).
- motion setting defaults from prefers-reduced-motion (mock matchMedia) and is overridable in-app; the override flows through useMotionPreference (from section 09, reference only).
- reduce-glow toggle applies and removes the single reduce-glow class hook.
- extended-time control: enabled and editable when `startedMissionIds` is empty; disabled once it is nonempty, with visible explanatory text stating that the option locked because a mission has started; editing while unlocked dispatches the engine preference action through `send`.
- New Campaign entry point opens the New Campaign dialog, never resets directly.
- aria-labelledby present; focus restored on close.

### new-campaign-dialog.test.tsx

- lists exactly the three named seeds from the engine catalog metadata, each with its description; assert the count is exactly three and there is no free-text seed input in the DOM.
- requires explicit confirmation: selecting a seed alone dispatches nothing; confirming dispatches NEW_CAMPAIGN with the chosen seed exactly once (and NEW_CAMPAIGN is in the immediate-flush set, owned by section 02).
- cancel closes without dispatch; focus restored.

### help-overlay.test.tsx

- opens as an overlay without changing the active screen (router state unchanged).
- content is context-sensitive: it surfaces the active screen's registered verbs via the terminal framework's HELP registry (section 04 export, reference only); idle context includes LIST GAMES, mission context does not.
- Escape closes help; when both help and the sound prompt could claim a key, the open dialog wins (precedence spot check).
- aria-labelledby, initial focus on the dialog body heading, focus restore on close.

### corrupt-save-notice.test.tsx

- recovery flag 'recovered-backup' renders the notice with copy saying a backup was restored; 'reset' renders the notice with copy saying the save was unreadable and a fresh campaign started; 'clean' renders nothing.
- the notice is dismissible, dismissal is remembered for the session (does not reopen on re-render), and dismissing never dispatches an engine action.

## Implementation details

### Dialog mechanics, shared

Every dialog is a native `<dialog>` opened with `showModal()`. Native modality supplies the focus trap, inerting of the background, and Escape-to-close by default. Shared conventions, applied to all five:

- `aria-labelledby` referencing the dialog's heading element.
- Chosen initial focus per dialog (set explicitly after open; do not rely on autofocus attribute quirks across browsers): Resume for pause, first toggle for settings, first seed option for New Campaign, heading for help and the corrupt notice.
- Focus restored on close to the previously focused element. Capture `document.activeElement` before `showModal()` and restore in the close handler.
- The `cancel` event (native Escape) is allowed for every dialog except where it would skip a confirmation: in the pause dialog's End Mission confirmation sub-state, Escape backs out of the confirmation to the main pause view instead of closing the dialog.
- Visual styling rides the CRT theme tokens from section 03 (already present): glass background token, electric blue glyphs, luminous border. No new effects; dialogs sit above the scanline overlay.

Input precedence is implemented once in the shared key-handler utility (section 04 owns it; section 09 owns the bail conditions). The rule this section depends on: an open native dialog is the top of the stack and consumes keys before diegetic prompts, type-ins, menu shortcuts, and global shortcuts. This section's tests assert the dialog layer behavior from the outside; the handler itself is not reimplemented here.

`dialogState.ts` holds a tiny local UI state (which overlay is open, plus the corrupt-notice dismissed bit). Plain module state or a context is fine; it must not live in engine state and must not persist, except that the corrupt-notice dismissal lasts for the session.

### Pause dialog

Opens from Escape or the MENU control during mission play. Content, in order: a heading, a line stating plainly that the mission clock continues to run, Resume, and End Mission. Resume just closes. End Mission expands an inline confirmation: a short prompt plus a text field where the player types the confirmation word (pick one word, render it in the prompt, compare case-folded); only a match enables the confirm control, which dispatches the engine forfeit action through `send`. The engine owns all consequences of forfeiture; the shell dispatches and renders the resulting state. There is no engine pause concept and the dialog must not fake one.

### Settings dialog

Sections top to bottom:

1. Sound: master, effects, voice, ambience toggles. The voice toggle's label discloses that voice lines are AI-generated. All four read and write the audio module's persisted prefs. Master is the same persisted value the diegetic hero prompt wrote; no shadow copy.
2. Motion: defaults to the prefers-reduced-motion media query, overridable either way. The composed value flows through `useMotionPreference` so every motion consumer (type-in, push-in, grid traces, lamp breathing) sees one truth. A preference change must not abort in-flight WAAPI animations (they complete; the hook owns this, section 09).
3. Reduce glow: toggles the single class that drops the outer text-shadow layers and the breathing layer (class defined in section 03).
4. Extended time: an engine preference. Editable only while `startedMissionIds` is empty; dispatch the preference change through `send`. When nonempty, render the control disabled with adjacent text explaining the lock (the campaign has begun, timing options are fixed for its duration). Never hide the control; the explanation is the point.
5. New Campaign: a button that opens the New Campaign dialog.

Financial-and-technical-term hover definitions are the glossary primitive's job (section 09); any jargon term appearing in settings copy (for example EXTENDED TIME) should render through that primitive.

### New Campaign dialog

Lists exactly the three named seeds from the engine's seed catalog metadata, each with name and description, as a selectable group. No free seed input, ever. Confirmation is a separate explicit control, enabled once a seed is chosen, with copy warning that the current campaign is erased. Confirm dispatches NEW_CAMPAIGN with the seed id through `send`; the immediate-flush save behavior is the state binding's obligation. Cancel closes with no dispatch.

### Help overlay

An overlay, not a screen: the router's active screen does not change. Body content comes from the context HELP source that the terminal framework exposes (the active screen's verb registrations, section 04). Render the verb list plus one line per verb; include whatever static orientation copy the terminal HELP command would print, so HELP-the-command and help-the-overlay show the same truth from the same registry. LIST GAMES appears only when the idle context registers it.

### Corrupt-save notice

Driven solely by the recovery flag the state binding surfaces. `'recovered-backup'`: copy says the primary save was unreadable and an earlier backup was restored, so recent progress may be missing. `'reset'`: copy says the save could not be recovered and a fresh campaign has started. Neutral diegetic tone, no blame, one dismiss control. Shown once per session on first render where the flag is not clean; dismissal recorded in dialogState for the session only. The notice reads state; it never writes any.

## Dependencies

- Section 01 (app scaffold): App shell, dialog host, jsdom Vitest project. Done before this section by execution order.
- Section 02 (engine binding): `useCampaign`, `send`, recovery flag surface, immediate-flush set. Referenced, not reimplemented.
- Section 03 (CRT theme): tokens and the reduce-glow class.
- Section 04 (terminal framework): shared key handler with the precedence stack, MENU control, HELP verb registry. Hard dependency.
- Section 07 (audio engine): persisted audio prefs and their storage port. If section 07 lands after this one, test against the prefs port interface with a mock; the port shape is `{master, voice, effects, ambience}` persisted with corrupt reads falling to muted defaults.
- Section 09 (a11y and glossary): `useMotionPreference`, key-handler bail conditions, glossary term primitive. Hard dependency.

## Definition of done

All five test files green under `npm test` in the jsdom project; dialogs open and close with correct focus behavior; extended-time lock and the three-seed constraint asserted; no engine action dispatched by any dialog except FORFEIT_MISSION (confirmed), NEW_CAMPAIGN (confirmed), and the extended-time preference (unlocked only). No em-dashes in any copy.
## As Built (section-06 implementation)

Built and committed. 361 tests green; tsc, eslint, and build clean.

- Five native <dialog> overlays through a shared Dialog wrapper (aria-labelledby, explicit initial focus, focus restore, inputStack dialog-layer wiring, cancel guard, and an unmount safety net): PauseDialog (typed End-Mission forfeit, no faked engine pause, Escape backs out of the confirmation), SettingsDialog (four audio toggles sharing one master value with the hero prompt, motion override, reduce-glow class, extended-time lock, New Campaign entry), NewCampaignDialog (exactly the three catalog seeds, no free input), HelpOverlay (context HELP registry), CorruptSaveNotice (recovery-flag driven, session-dismissed).
- dialogState (overlay + corrupt-dismissed), wired through ScreenRouter (openOverlay, DialogLayer as a sibling of the screen root, Escape/MENU open pause during a mission).
- Stand-ins extended for sections 07/09: audio prefs {master,voice,effects,ambience} with master as the single hero/settings value; motion override; reduce-glow store; GlossaryTerm.
- Engine fix: loadCampaign returns clean for an empty store (first-time), reset only for a present-but-corrupt or erroring save, so a new player is never told their save could not be recovered.
- Review fix: CorruptSaveNotice keeps mounted and closes by flipping open (an unmount-on-dismiss would strand the precedence stack and deafen the app to keys); the Dialog wrapper also releases the stack on unmount-while-open.
