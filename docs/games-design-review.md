# LIST GAMES: game and visual design review

These are playable prototypes with a coherent palette, but their quality varies sharply. Blackjack, the maze, and Hearts have recognizable, mostly sound core loops. Gin rummy and tactical warfare have correctness problems that change results. Chess has substantial rules omissions. The combat games need to explain their decisions and consequences before they need more spectacle.

The strongest lesson from the GTW work is presentation discipline: readable information, a visible current decision, dependable controls, and a clear account of what just happened. Most of these games still present a small block of terminal output in the upper-left corner. Enlarging the title will not finish them.

Reviewed all 14 game files in full, types.ts, game.css, sound.ts, all 14 supplied contact sheets, and selected original phone captures. Used [docs/gtw-design-review.md](../docs/gtw-design-review.md) and the rebuilt GTW layout as the quality reference. Confirmed selected logic findings with small in-memory probes against the source. This is a source and screenshot review, not a complete browser playthrough of every ending.

Game file citations below are relative to src/app/game/games/. Shared stylesheet and sound citations are relative to src/app/game/. Each game heading links to its contact sheet. The contact sheets are scaled composites; their apparent pixel sizes are not measurements of the original viewport. Unchanged after-click frames are not proof of a broken game.

The three changes in each section are ranked by expected impact for effort. S means a localized change, M a component or mechanic with focused verification, and L substantial rules or state-machine work. All proposed graphics are original CSS or vector treatments using the existing terminal palette and font. No film-prop tracing, product artwork, or bitmap reskin is needed.

## 1. [FALKENS MAZE](../visuals/games-review/sheets/falkens-maze.png)

**Today:** A freshly generated 11 by 11 perfect maze, navigated with arrows, WASD, or four buttons, with a move counter and an exit.

**Verdict:** A complete small puzzle and a reasonable short diversion. The iterative backtracker connects the cells, movement respects walls, and reaching the exit produces an explicit win. There is no opponent AI or loss condition, which suits this game. Fresh mazes supply variety, but the counter has no benchmark and there is little reason to improve a route. No definite maze-generation or movement rules error found.

**Visible problems:** The player, exit, and walls share the same blue and glow, so the two important symbols disappear into the diagram. The desktop leaves substantial unused space around a modest maze. On the phone, the four direction words are a thin horizontal strip. The second frame highlights UP without moving the player because the start has a north wall; the missing element is feedback, not permission to walk through it. The heading has the same weight as supporting text.

**Top three changes:**

1. **[MOBILE] Make the direction control a real pad. S.** Arrange UP above LEFT / DOWN / RIGHT with at least 44 by 44 CSS px buttons. Mark blocked directions, and announce WALL when a keyboard command hits one without incrementing the move count. Keep keyboard and button behavior identical.
2. **[VISUAL] Separate navigation information from maze structure. M.** Give @ an amber bracket, the exit a labeled outline, and walls a quieter, crisp blue. Render cells individually or use original vector wall segments so these treatments do not require coloring the entire preformatted string. Fit the maze to a bounded play area and put MOVES beside it, with a short key for player and exit.
3. **[GAMEPLAY] Give the move counter meaning. M.** Calculate the shortest route for the generated maze, reveal efficiency at completion, and offer RETRY THIS MAZE and NEW MAZE. Save the best move count by seed and size. Keep the shortest route hidden during play; an optional hint should mark the run as assisted.

## 2. [BLACK JACK](../visuals/games-review/sheets/blackjack.png)

**Today:** Hit-or-stand blackjack against a fixed-rule dealer, with a $10 bet, $100 starting bankroll, and session wins and losses.

**Verdict:** One of the sounder implementations. Ace adjustment, two-card naturals, pushes, the 3:2 net payout, and standing on all 17s are present. The dealer is an appropriate rule executor, not an opponent that needs strategic AI. Individual outcomes are explicit. It is a blackjack subset without splitting or doubling, and replay is mostly watching the same small bankroll counter change.

**Bug:** The bankroll is not a constraint. Losses subtract $10 at [blackjack.game.tsx:114](../src/app/game/games/blackjack.game.tsx:114), but [blackjack.game.tsx:163](../src/app/game/games/blackjack.game.tsx:163) deals another hand regardless of available funds. A zero bankroll can keep betting and become negative. The payout arithmetic itself does not need another stake subtraction.

**Visible problems:** Cards are tiny bracketed text rather than the visual center of the table. Dealer, player, totals, and account information all compete at almost the same weight. The phone bust result is clear, but most of both viewport sizes is unused. HIT, STAND, and EXIT are narrow text targets, and EXIT looks like another play action.

**Top three changes:**

1. **[BUG] Close the bankroll loop. S.** Require at least the current bet before dealing. At less than $10, show SESSION OVER with final balance and hands played, then NEW SESSION and EXIT. Display the last hand's net change beside the bankroll so a push, ordinary win, and natural are unambiguous.
2. **[VISUAL] Build a compact terminal card table. M.** Use distinct DEALER and YOU hand panels, larger rank/suit tiles, a strong player total, and a consistent hidden-card symbol. Put HIT and STAND side by side below the player hand with 44 px minimum height. Keep account statistics secondary.
3. **[GAMEPLAY] Add one meaningful risk decision. M.** Add DOUBLE on the first two cards when the bankroll covers twice the bet: draw exactly one card, then resolve the dealer. Offer an optional session objective such as reaching $200 from $100. State the supported rules beside HOW TO PLAY, including the absence of splitting.

## 3. [GIN RUMMY](../visuals/games-review/sheets/gin-rummy.png)

**Today:** A ten-card draw/discard hand against WOPR, with exhaustive meld partitioning, deadwood display, knocking, gin, and an immediate hand score.

**Verdict:** The meld analyzer is the strongest part: it searches overlapping runs and sets instead of greedily assigning cards. The surrounding rules are incomplete enough to award the wrong winner. AI discards minimize immediate deadwood, but its pickup decision evaluates an eleven-card hand before considering the discard, so it misses useful exchanges. Results name the scorer, but scores reset every hand. This could become one of the better games once scoring is trustworthy.

**Rules and interface findings:**

- Ordinary knocks skip the defender's layoff entirely. Both callers pass raw independently analyzed deadwood into scoreKnock: [gin-rummy.game.tsx:265](../src/app/game/games/gin-rummy.game.tsx:265) and [gin-rummy.game.tsx:324](../src/app/game/games/gin-rummy.game.tsx:324). The analyzer returns only a union of meld IDs at [gin-rummy.game.tsx:119](../src/app/game/games/gin-rummy.game.tsx:119), not the actual meld groups needed for laying off. A defender with 12 deadwood who can lay off a 7 against a knock of 5 should undercut; the current comparison awards the knocker 7 points.
- The drawn discard is not tracked, and any card can be discarded or used to knock: [gin-rummy.game.tsx:281](../src/app/game/games/gin-rummy.game.tsx:281), [gin-rummy.game.tsx:303](../src/app/game/games/gin-rummy.game.tsx:303), and [gin-rummy.game.tsx:320](../src/app/game/games/gin-rummy.game.tsx:320). This permits immediately returning the pickup. Stock exhaustion is checked at zero rather than the usual two-card stop: [gin-rummy.game.tsx:237](../src/app/game/games/gin-rummy.game.tsx:237) and [gin-rummy.game.tsx:290](../src/app/game/games/gin-rummy.game.tsx:290). There is also no opening upcard pass phase.
- These are gaps against the traditional rules. Gin forbids layoff, while ordinary knocks allow it; pickup and end-of-stock variants should be stated explicitly. The existing 25-point bonuses are a valid option. [Rules reference and variants](https://www.pagat.com/rummy/ginrummy.html).
- With no discard selected, the UI claims DEADWOOD > 10 despite having no projected value: [gin-rummy.game.tsx:343](../src/app/game/games/gin-rummy.game.tsx:343) and [gin-rummy.game.tsx:487](../src/app/game/games/gin-rummy.game.tsx:487). It should request a selection.

**Visible problems:** The phone hand wraps into dense lines of nearly touching glyphs. Amber identifies melded cards but does not reveal which cards form each meld. Ten question-mark cards occupy space without adding information. After drawing, the highlighted DISCARD SELECTED control and inactive KNOCK look actionable even before a card is chosen. The displayed eleven-card deadwood is easy to mistake for the value used to determine knock eligibility.

**Top three changes:**

1. **[BUG] Finish knock settlement and turn legality. M.** Preserve actual meld groups; resolve the defender's best legal meld/layoff arrangement before comparing scores, with no layoff against gin. Track draw source and picked-up card, enforce the chosen return-discard rule, add the opening pass, and stop the hand at the documented stock threshold. Cover both human and AI knocks with the same resolver.
2. **[VISUAL] Make draw, selection, and discard explicit stages. M.** Group melds with labels such as RUN 1 and SET 1, keep deadwood separate, and show AFTER DISCARD: 8 next to the selected card. Replace the premature knock message with SELECT A DISCARD. Use the shared card tiles; summarize the hidden hand as WOPR: 10 CARDS. Show the opponent's pickup and discard in a retained turn report.
3. **[GAMEPLAY] Turn isolated scores into a match. M.** Accumulate scores toward a stated target, retain hand history, and alternate the opening role. For the AI pickup decision, compare the best legal ten-card result after each possible discard with the current hand, rather than comparing raw ten- and eleven-card deadwood. Keep a simple difficulty that uses today's policy.

## 4. [HEARTS](../visuals/games-review/sheets/hearts.png)

**Today:** A four-player match to 50 penalty points, with three-card left passes, legal trick play, hearts breaking, and shooting the moon.

**Verdict:** The most complete multi-hand card game here. The opening two of clubs, follow-suit restrictions, first-trick point restrictions, heart leads, and moon scoring are implemented. Opponents follow legal plays and use sensible local ducking and dumping, but lack longer-term suit or moon awareness. The fixed left pass is an explicit simplified variant. Match continuation creates replay value, although current presentation makes it hard to learn why points were taken.

**Bugs and feedback gaps:** Match ties silently favor the first minimum in the player array, so YOU can be declared sole winner while tied: [hearts.game.tsx:348](../src/app/game/games/hearts.game.tsx:348) and [hearts.game.tsx:405](../src/app/game/games/hearts.game.tsx:405). Completed tricks are cleared immediately at [hearts.game.tsx:273](../src/app/game/games/hearts.game.tsx:273), with AI advancement happening before the next rendered state at [hearts.game.tsx:320](../src/app/game/games/hearts.game.tsx:320). No last-trick card list is preserved. The winner message alone cannot explain the result.

**Visible problems:** In the initial sheet, a card is blue-highlighted while the pass count is still 0/3; after selection, a small star and amber text carry the actual state. Focus and selected state need different treatments. Thirteen tiny card buttons are crowded on desktop and wrap arbitrarily on the phone. Match totals and hand points are two similarly styled strings, making them hard to distinguish. The captures show passing only, not trick-play quality.

**Top three changes:**

1. **[VISUAL] Keep the completed trick visible. M.** Add a four-seat trick area, retain the last four cards and winner until the next human play, and show which card won and how many penalty points it collected. Add TRICK 4/13 and HEARTS OPEN / HEARTS CLOSED. Preserve pacing without forcing a confirmation click after every trick.
2. **[BUG] Finish the match rules and their display. M.** Represent all tied low scorers explicitly, or continue a clearly stated tie-break hand. Add a hand number and the left / right / across / keep pass cycle for standard mode. Keep the existing always-left rule only as a named quick variant. Show selected pass cards in three fixed slots so the confirmation count is unmistakable.
3. **[GAMEPLAY] Improve the opponents' decisions. M.** Track played cards and exposed voids. When last to play on a point-free trick, let the AI shed a dangerous high card instead of automatically using its lowest winner. Consider the resulting lead and remaining low cards. Add a moon-defense rule once one player is collecting nearly all points. Do not give the AI access to hidden hands.

## 5. [BRIDGE](../visuals/games-review/sheets/bridge.png)

**Today:** A declarer practice deal: choose a contract, all opponents pass, then play South and North against East and West.

**Verdict:** A useful foundation for declarer practice, not a full contract-bridge experience. The simplified auction is stated in the interface; the opening leader, follow-suit rules, trump comparison, and thirteen-trick accounting look sound. Made/down is clear. There is no numerical contract score, auction competition, vulnerability, or match, so bidding a higher level adds risk without a corresponding reward. Defenders choose locally winning cards without considering their partner.

**AI limitation:** [bridge.game.tsx:131](../src/app/game/games/bridge.game.tsx:131) does not receive the acting seat or inspect whether the current winner is its partner. It can spend a winner or trump on a trick the defense already owns. This is a weak decision policy, not an illegal play. The completed trick at least survives in the text log at [bridge.game.tsx:177](../src/app/game/games/bridge.game.tsx:177).

**Visible problems:** The seven level controls and five strain controls are tightly packed character-sized buttons, especially on the phone. The selected 1 and NT have thin outlines that compete with the blue focus fill. The hand wraps without suit grouping. Most of the desktop is blank. Both after-click frames remain in bidding because selecting the already selected level changes no contract; they do not demonstrate play or a stalled engine.

**Top three changes:**

1. **[MOBILE] Make bidding and hand selection usable. M.** Give each level a 44 px target and each strain a labeled button, including NO TRUMP. Group the hand by suit. During play, use a persistent compass table with North above, South below, and East/West card slots between them. Label the active hand PLAY FROM NORTH or PLAY FROM SOUTH.
2. **[GAMEPLAY] Give contracts stakes and name the mode. M.** Present this as DECLARER PRACTICE. Add a visible score for an undoubled, non-vulnerable deal, including the contract bonus, overtricks, and undertricks, with a breakdown at the end. Offer REPLAY DEAL at a different contract and NEW DEAL. This makes contract selection meaningful without first building a complete bidding system.
3. **[GAMEPLAY] Make the defense partner-aware. M.** Pass the acting seat into aiPick. When partner is safely winning and the seat is last, discard cheaply instead of overtaking; consider trump preservation and known suit voids. Add a short last-trick explanation, not a generic WOPR THINKING delay.

## 6. [CHECKERS](../visuals/games-review/sheets/checkers.png)

**Today:** An 8 by 8 draughts variant with kings and complete capture sequences, against an AI that maximizes immediate captures and otherwise moves randomly.

**Verdict:** Recognizable and playable, but too weak and too hard to read to sustain many games. King movement and stopping a capture on promotion are implemented. Losing all pieces or all legal moves produces a clear result. Captures are deliberately optional in the source, but that variant is not explained to the player. There is no draw result or history tracking in [checkers.game.tsx:183](../src/app/game/games/checkers.game.tsx:183) and [checkers.game.tsx:210](../src/app/game/games/checkers.game.tsx:210), so king endgames can continue indefinitely.

**Rules and bugs:**

- Standard English/American draughts requires captures; [checkers.game.tsx:144](../src/app/game/games/checkers.game.tsx:144) includes ordinary steps even when jumps exist. The code comment acknowledges the variant, while the visible rules at [checkers.game.tsx:359](../src/app/game/games/checkers.game.tsx:359) omit it. Standard rules also provide draws. [WCDF rules, sections 1.20 and 1.32](https://wcdf.net/rules/rules_of_checkers_english.pdf).
- The UI chooses a full capture solely by its final square at [checkers.game.tsx:283](../src/app/game/games/checkers.game.tsx:283). Different paths to one destination cannot be chosen independently. Worse, a legal king circuit ending on its starting square is unselectable because [checkers.game.tsx:276](../src/app/game/games/checkers.game.tsx:276) handles that click as selecting your own piece. A source probe with a player king at index 42 and opponents at 35, 19, 17, and 33 generates two four-capture paths back to 42; neither can be committed through this handler.
- The intended piece size at [checkers.game.tsx:195](../src/app/game/games/checkers.game.tsx:195) is reset by the later font shorthand at [checkers.game.tsx:207](../src/app/game/games/checkers.game.tsx:207).

**Visible problems:** The discs are pinpoints inside generous squares. Red and blue distinguish sides better than in chess, but the tiny symbols make counting and king recognition unnecessarily difficult. The phone score header wraps WOPR's count onto a separate line. Both supplied board states are unchanged, so there is no visible evidence here of selected destinations or capture feedback.

**Top three changes:**

1. **[BUG] [VISUAL] Restore actual pieces. S.** Remove the conflicting font shorthand or put explicit sizing after it. Prefer CSS discs about 55 to 60 percent of a cell, with an original double ring and K for kings. Keep side colors and add an outline difference. Give counts their own aligned status fields.
2. **[BUG] [GAMEPLAY] Select captures hop by hop. M.** Highlight immediate landing squares, lock the capturing piece during continuation, and allow the final hop back to the original square. Enforce compulsory captures in standard mode and allow a choice among legal branches. Show CAPTURE REQUIRED and CONTINUE JUMP when relevant.
3. **[GAMEPLAY] Make endgames finite and the opponent credible. M.** Add repetition and no-progress draw accounting under the documented rule set. Replace capture-count-only choice with a bounded two-ply evaluation of material, kings, promotion distance, and the opponent's reply. Commit the player's board immediately and highlight the AI's origin and destination afterward.

## 7. [CHESS](../visuals/games-review/sheets/chess.png)

**Today:** A reduced chess ruleset with check, mate, stalemate, and automatic queen promotion, against a greedy capture-first opponent.

**Verdict:** A movement sandbox with a game wrapped around it. Ordinary movement and own-king safety are implemented, and checkmate/stalemate have explicit outcomes. Castling and en passant are intentionally absent, and there is no promotion choice or history-based draw handling. The AI ignores the reply to its capture, making simple defended-piece traps effective. Replay value is low for anyone beyond a beginner.

**Rules and bugs:** The omitted special moves are acknowledged only in [chess.game.tsx:6](../src/app/game/games/chess.game.tsx:6), while the player is simply told CHESS. Promotion is always to a queen at [chess.game.tsx:185](../src/app/game/games/chess.game.tsx:185). End checks at [chess.game.tsx:283](../src/app/game/games/chess.game.tsx:283) and [chess.game.tsx:309](../src/app/game/games/chess.game.tsx:309) only examine available moves and check: a bare-kings position continues because neither side has zero legal moves. Dead positions should end immediately under the chess rules; repetition and move-count draw rules also need explicit handling. [FIDE rules, completion of the game and draws](https://old.fide.com/fide/handbook.html?id=124&view=article). The piece-size declaration at [chess.game.tsx:247](../src/app/game/games/chess.game.tsx:247) is overwritten by font: inherit at [chess.game.tsx:259](../src/app/game/games/chess.game.tsx:259).

**Visible problems:** Both armies are phosphor blue. Filled versus outlined Unicode glyphs are carrying almost the entire side distinction, and the pieces are extremely small relative to their cells. The phone confirms this is an actual size issue, not just contact-sheet downscaling. There are no visible rank/file coordinates even though move messages use coordinates. The desktop board has usable room, but the unused surrounding space contributes nothing to move comprehension. The two captured states do not show an executed move.

**Top three changes:**

1. **[BUG] [VISUAL] Make side and piece identity immediate. S.** Fix the font reset, use blue for the player and red for WOPR, and size symbols to roughly 60 percent of the cell. Preserve outline/filled distinctions as a second cue. Add rank/file labels, a last-move origin/destination mark, and a clear check marker around the king. Verify the chosen glyph font at phone size; use original simple vector symbols if it remains ambiguous.
2. **[BUG] [GAMEPLAY] Complete the promised rules. L.** Track castling rights, the en passant target, position history, and the halfmove clock. Add promotion choice, immediate dead-position draws, and the appropriate claimable/automatic draws. Until that work lands, visibly label the existing omissions in HOW TO PLAY. Verify legal edge cases before describing the engine as complete chess.
3. **[GAMEPLAY] Replace the capture lottery. M.** Use bounded two- or three-ply search with material, mobility, king safety, and promotion evaluation. Recognize mate as a terminal result rather than just a material gain. Offer BEGINNER and STANDARD with different search budgets; keep all choices based on legal moves.

## 8. [POKER](../visuals/games-review/sheets/poker.png)

**Today:** Five-card draw hand comparison against one WOPR opponent, with hold toggles, one replacement draw, and session win/loss/tie totals.

**Verdict:** A functioning hand-ranking exercise with a satisfying reveal, but very little of poker's pressure. Categories, the ace-low straight, and rank-based tie breaks are present. There is no betting, pot, or fold decision. The AI's hold heuristic has a major oversight. Showdown results are clear at category level, but equally ranked hands need a kicker explanation. Fresh cards give variety without much strategic progression.

**Bug:** A made non-flush straight is broken by the AI. [poker.game.tsx:118](../src/app/game/games/poker.game.tsx:118) checks pairs, then four-card flushes, then keeps only the two highest cards. A probe using mixed-suit 5-6-7-8-9 correctly evaluates as STRAIGHT but holds only 8 and 9. The final SPLIT POT message at [poker.game.tsx:212](../src/app/game/games/poker.game.tsx:212) also describes a pot that does not exist.

**Visible problems:** Cards are a short run of text at the upper-left. The after-click state adds a star and amber to one card, but the star changes button width and shifts later cards. A blue hover/focus fill can obscure the distinction between a held card and the active control. The phone has ample space for five legible cards and still uses tiny symbols.

**Top three changes:**

1. **[BUG] Preserve made hands in the AI. S.** Evaluate the hand before choosing discards and keep all cards for a straight, flush, or stronger made hand. Retain pair/set handling, then consider four-card draws. Add fixtures for a mixed-suit straight, wheel, flush, full house, and quads. Say TIED HAND while there is no pot.
2. **[VISUAL] Give hold state a permanent place. M.** Use five fixed-size card tiles with a reserved HELD indicator, visible even when another control has focus. Show the current hand category while choosing holds. At showdown, show both categories and the decisive rank, such as PAIR OF FIVES. ACE KICKER WINS.
3. **[GAMEPLAY] Add a modest stake and fold decision. M.** A labeled QUICK DRAW mode can use a small ante and one capped bet/check, call/fold exchange after drawing. Show the opponent's replacement count before that decision. Track the pot and enforce a bankroll floor. A declared short betting variant is enough to create uncertainty without immediately implementing a full poker table.

## 9. [FIGHTER COMBAT](../visuals/games-review/sheets/fighter-combat.png)

**Today:** A deterministic 7 by 7 turn-based duel combining heading, energy, movement, and short-range gunnery.

**Verdict:** There is a real positioning idea here, and the explicit gun-solution warning creates tension. The enemy turns toward the player, recovers energy, and shoots when aligned. However, resource enforcement is inconsistent and the display omits the orientation that drives the game. A fixed start and fixed opponent policy make replay repetitive. Win/loss is legible; the various draw endings are mislabeled.

**Bugs and information gaps:**

- GUNS clamps energy to zero at [fighter-combat.game.tsx:122](../src/app/game/games/fighter-combat.game.tsx:122), then accepts energy >= 0 at [fighter-combat.game.tsx:156](../src/app/game/games/fighter-combat.game.tsx:156). That check is always true. A probe with player energy zero still inflicted two damage. The AI requires energy >= 1 at [fighter-combat.game.tsx:130](../src/app/game/games/fighter-combat.game.tsx:130), so the sides do not follow the same firing rule.
- Turning and diving also remain possible at zero energy because maneuver simply clamps the deduction: [fighter-combat.game.tsx:110](../src/app/game/games/fighter-combat.game.tsx:110). Costs need a stated eligibility rule.
- The 24-turn limit and simultaneous destruction both become STALEMATE at [fighter-combat.game.tsx:185](../src/app/game/games/fighter-combat.game.tsx:185). The result then claims both fighters are out of ammunition at [fighter-combat.game.tsx:336](../src/app/game/games/fighter-combat.game.tsx:336), although no ammunition resource exists.
- The displayed solution uses the current positions at [fighter-combat.game.tsx:259](../src/app/game/games/fighter-combat.game.tsx:259), while shooting resolves after both maneuvers at [fighter-combat.game.tsx:151](../src/app/game/games/fighter-combat.game.tsx:151). That can be a valid simultaneous-turn design, but the UI should explain that the opponent may move out of the solution.

**Visible problems:** A and V remain fixed letters, not heading indicators; both map markers are blue. The only heading readout belongs to the player. On the phone the map, player telemetry, enemy telemetry, log, and six actions stack into a long column, putting GUNS near the bottom. The desktop has room to make this a proper tactical display. Solid integrity bars are useful, but the segmented energy texture competes with small text.

**Top three changes:**

1. **[BUG] Enforce costs before resolution and record ending reasons. S.** Require enough starting energy for GUNS and the stated cost of each maneuver, with a visible disabled reason and an always-available recovery action. Share that eligibility with the AI. Show TURN n/24 and distinguish time expired, mutual destruction, and any genuine resource deadlock. Recheck whether a zero-energy draw is appropriate when recovery exists.
2. **[VISUAL] Show the geometry the player is choosing. M.** Replace A/V with original oriented blue/red vector markers, a visible firing cone, and a range guide. Display both headings. On the phone put two compact status rows directly below the scope and a two-column action bank above the detailed log. Label the present solution TARGET IN ARC and explain when it is checked.
3. **[GAMEPLAY] Add scenario and opponent variation. M.** Offer a few seeded starting geometries and an AI that evaluates candidate next positions for exposure and energy, rather than always chasing the current bearing. Keep the simple policy as BEGINNER. Compare wins and turns within the same scenario instead of presenting every replay as a new tactical problem.

## 10. [GUERRILLA ENGAGEMENT](../visuals/games-review/sheets/guerrilla-engagement.png)

**Today:** A three-trooper patrol moves across an 8 by 8 hidden-enemy grid, winning by eliminating the opposing cell or holding the far objective twice.

**Verdict:** The hidden-contact premise and alternate objective are promising, but contact resolution is abrupt enough to feel arbitrary. The opponent pursues nearby troops and otherwise waits. Terrain and cover are not modeled despite the jungle/cover language in comments. Spawn variation supplies replay, while the strategic choices are mostly route and grouping. The objective's two-step hold and the two separate contact resolutions need to be explained.

**Findings:**

- One command resolves firefights at [guerrilla-engagement.game.tsx:176](../src/app/game/games/guerrilla-engagement.game.tsx:176) and again at [guerrilla-engagement.game.tsx:181](../src/app/game/games/guerrilla-engagement.game.tsx:181). With two hit points each, a lone healthy trooper and lone healthy hostile already in contact exchange both hit points in one command. This is a balance and feedback problem, not evidence of a random damage bug.
- HOLD says SCANS at [guerrilla-engagement.game.tsx:167](../src/app/game/games/guerrilla-engagement.game.tsx:167), but every command already spots from every live trooper at [guerrilla-engagement.game.tsx:171](../src/app/game/games/guerrilla-engagement.game.tsx:171) using the same range. Holding supplies no additional reconnaissance benefit.
- The global Tab handler prevents normal focus traversal, including Shift+Tab: [guerrilla-engagement.game.tsx:248](../src/app/game/games/guerrilla-engagement.game.tsx:248). A keyboard user cannot normally tab to EXIT.
- Invalid movement still advances combat and time: the blocked test at [guerrilla-engagement.game.tsx:158](../src/app/game/games/guerrilla-engagement.game.tsx:158) does not return before the later phases. There is no warning that hitting an edge spends a turn.
- Holding the objective can win with hostiles alive at [guerrilla-engagement.game.tsx:194](../src/app/game/games/guerrilla-engagement.game.tsx:194), yet the banner always says SECTOR CLEARED at [guerrilla-engagement.game.tsx:350](../src/app/game/games/guerrilla-engagement.game.tsx:350).

**Visible problems:** The grid is a tiny patch of dots beside a larger text block. There is no visible difference between unseen ground and observed empty ground. The objective is one X, and the header does not state the hold requirement. Phone troop health looks like little solid blocks without numbers. Selecting the next trooper changes amber highlighting, but does not make that trooper's possible movement or spotting area visible. The empty log area separates the map from controls.

**Top three changes:**

1. **[GAMEPLAY] Give contact a readable cadence. M.** Resolve one explicit contact phase after movement, instead of two volleys hidden inside a click. Report attacker, target, and health loss. Give HOLD a defined benefit, such as extending this command's observation radius from two cells to three. Reject invalid moves without advancing the opponent or clock. Retune the turn limit after checking objective and elimination routes.
2. **[VISUAL] Turn dots into an inspectable patrol map. M.** Use a larger square grid, distinct observed/unobserved cells, numbered troop markers, and visible movement/observation overlays for the selected unit. Add three selectable troop cards with HEALTH 2/2. Keep OBJECTIVE HOLD 0/2 beside the map and retain that label when a trooper occupies X.
3. **[BUG] Finish control and outcome feedback. S.** Restore normal Tab navigation, bind unit cycling to bracket keys or Q/E within the game, and add direct 1/2/3 selection. Store whether victory came from elimination or holding the objective and render the corresponding result. Treat revealed enemy positions as current intelligence or explicitly label them last known; do not blur those two models.

## 11. [DESERT WARFARE](../visuals/games-review/sheets/desert-warfare.png)

**Today:** Two tanks each take one action per round against two advancing enemies, with fuel, range, dune obstruction, and probabilistic shots.

**Verdict:** Probably the strongest combat-game foundation: selection, finite maneuver fuel, range-dependent damage, and blocking dunes create actual choices. The enemy fires when possible and greedily advances otherwise. However, line-of-sight fairness and the round limit are wrong, and greedy movement can stall at obstacles. The initial map is fixed, so replay mostly changes shot rolls. Elimination results are clear; the stalemate explanation is false.

**Bugs:**

- Line of sight is directional on some slopes. The tie handling in [desert-warfare.game.tsx:62](../src/app/game/games/desert-warfare.game.tsx:62) samples different cells when endpoints are reversed. With the shipped dunes, a tank at (2,0) cannot shoot (4,4), while (4,4) can shoot (2,0). Both are at range four. This was reproduced through canFire, not inferred from the picture.
- The round limit fires before round 30 is playable. enemyTurn checks s.turn + 1 at [desert-warfare.game.tsx:245](../src/app/game/games/desert-warfare.game.tsx:245), while checkOutcome ends at >= 30 at [desert-warfare.game.tsx:116](../src/app/game/games/desert-warfare.game.tsx:116). Holding both tanks through round 29 returns TURN 30 and STALEMATE.
- That same probe leaves both player tanks with all ten fuel, yet [desert-warfare.game.tsx:261](../src/app/game/games/desert-warfare.game.tsx:261) reports FUEL EXHAUSTED. No fuel condition is tested there.
- Tab is globally intercepted at [desert-warfare.game.tsx:295](../src/app/game/games/desert-warfare.game.tsx:295), preventing ordinary keyboard access to controls. F fires at the first eligible enemy at [desert-warfare.game.tsx:311](../src/app/game/games/desert-warfare.game.tsx:311) even though multiple buttons can all advertise the same F shortcut.

**Visible problems:** The terrain is much too small relative to the available desktop and phone space. Identical E markers cannot be matched confidently to ENEMY 1/2 fire actions. No grid coordinates connect the map to logged positions. The armor blocks have no numeric health value, and the first screen does not explain that both tanks act before the enemy. Changing selection is visible, but range and blocked sight are not.

**Top three changes:**

1. **[BUG] Repair fairness and the round boundary. M.** Use a symmetric cell-intersection rule for line of sight and define what happens when a ray touches a cell corner. Require canFire(a,b) to equal canFire(b,a) for the same terrain. End the final round after both sides complete it, and store TIME LIMIT as a separate result reason. Keep fuel exhaustion independent of that clock.
2. **[VISUAL] Make the map the main play surface. M.** Use larger cells, labeled enemy markers E1/E2, numeric armor, and coordinates. Selecting a tank should show reachable cells, visible firing lines, and each target's range/hit chance. Put READY / ACTED on each tank card and state BOTH TANKS ACT, THEN WOPR. Provide direct target selection so F fires at the selected target.
3. **[GAMEPLAY] Improve movement before adding more weapons. M.** Replace the enemy's three greedy candidates at [desert-warfare.game.tsx:221](../src/app/game/games/desert-warfare.game.tsx:221) with a short path search around dunes. Choose and disclose a movement model: currently the enemy can move diagonally without fuel while the player has cardinal movement and ten fuel. Use the same neighborhood for a fair default, reserving asymmetry for a named scenario. Add a few seeded dune layouts after these rules work.

## 12. [AIR-TO-GROUND ACTIONS](../visuals/games-review/sheets/air-to-ground.png)

**Today:** Choose one of six defended targets and a high or low attack profile, rolling aircraft loss and target damage until the mission succeeds or the flight is lost.

**Verdict:** A complete probabilistic mission loop with clear target health, aircraft count, and an explicit ending. It does not need opponent AI; the defenses are the opposition. The current choices are thinner than the names suggest: destroying radar, fuel, or command has no effect on anything else. Low attacks have both better accuracy and twice the damage, so their payoff is much stronger than BETTER ACCURACY suggests. Fixed targets and hidden effective odds limit replay and learning.

**Information and presentation findings:** The displayed SAM/AAA percentages are raw ratings, not the actual aircraft-loss chances. [air-to-ground.game.tsx:85](../src/app/game/games/air-to-ground.game.tsx:85) adds one fifth of the other defense, while [air-to-ground.game.tsx:115](../src/app/game/games/air-to-ground.game.tsx:115) determines hit chance and damage. Against RADAR SITE BRAVO, HIGH loses an aircraft on 31 percent of runs and hits for one damage with 55 percent probability; LOW loses on 59 percent and hits for two with 75 percent probability. Those are much more useful decision inputs than the present labels. Destruction also sets report.crit at [air-to-ground.game.tsx:139](../src/app/game/games/air-to-ground.game.tsx:139), and [air-to-ground.game.tsx:276](../src/app/game/games/air-to-ground.game.tsx:276) paints the entire report red, even for a successful run with no loss.

**Visible problems:** Desktop layout produces five target cards and one orphan on the next row. The phone's six stacked targets are a sensible start, but action selection comes after the entire list. The initial phone sheet fills COMMAND BUNKER blue while the instruction still says SELECT A TARGET; hover/focus paint is visually indistinguishable from an actual target lock. This does not establish a selection-state bug. The after-click prompt is useful, but the two long attack buttons are small text strips. Status wrapping leaves TARGETS LEFT on a distant line.

**Top three changes:**

1. **[VISUAL] Expose the actual profile tradeoff. S.** For the selected target, display LOSS CHANCE, HIT CHANCE, and DAMAGE for both profiles from the same calculation used by resolution. Explain that ordnance can hit even if the aircraft is lost. Replace the accusatory loss advice with a factual debrief showing targets destroyed, sorties flown, and aircraft lost.
2. **[GAMEPLAY] Give target order consequences. M.** Assign small, visible effects to selected target classes. For example, destroying radar reduces remaining SAM ratings by ten percentage points. A surviving command bunker increases remaining AAA ratings by five points after sorties three and six. Clamp ratings to their valid range. Publish these effects on the target cards before commitment and show the changed ratings afterward. Balance them with reproducible mission seeds so success is not just better luck.
3. **[MOBILE] Build a stable target-and-profile layout. M.** Use three by two cards on wide screens and a compact full-width target list on phones. Keep the selected target's profile panel beside the list on desktop and immediately after the selected row on phones. Mark actual lock with an amber border, LOCKED, and aria-pressed. Keep focus separate. Color report lines by event: neutral procedure, amber success, red aircraft loss.

## 13. [THEATERWIDE TACTICAL WARFARE](../visuals/games-review/sheets/theaterwide-tactical.png)

**Today:** Allocate reserve divisions along a five-sector front, resolve a contested sector, and advance toward the opposing capital.

**Verdict:** The concept is a good fit for a WOPR terminal, but the current arithmetic makes it hard to trust. Planning and execution are distinct, and front movement could create a strong short campaign. Right now, reinforcement timing and force accounting distort the player's decisions. The AI is a fixed 70/30 allocation policy. There is little scenario variety, and the result banner can contradict the actual victory condition.

**Bugs confirmed from source and probes:**

- Enemy reinforcement is counted twice between turns. [theaterwide-tactical.game.tsx:128](../src/app/game/games/theaterwide-tactical.game.tsx:128) adds REINFORCE to aiReserve; [theaterwide-tactical.game.tsx:220](../src/app/game/games/theaterwide-tactical.game.tsx:220) stores another REINFORCE in the next reserve. The AI commits 14 on turn one despite displaying about 10, then eight per later turn, while the player receives four.
- A breakthrough calculates survivors and discards them: [theaterwide-tactical.game.tsx:161](../src/app/game/games/theaterwide-tactical.game.tsx:161) and [theaterwide-tactical.game.tsx:164](../src/app/game/games/theaterwide-tactical.game.tsx:164). It leaves surviving staged troops in the old sector and ensures at least one in the new sector instead of transferring the actual survivors. With 13 troops staged at the edge, zero at the target, and rolls of 0/0, the code calculates two losses but leaves 11 behind plus one new occupier. The next attack is then staged from that single new occupier.
- A repulse subtracts the same loss amount from both contributing stacks at [theaterwide-tactical.game.tsx:170](../src/app/game/games/theaterwide-tactical.game.tsx:170). A 5+5 attacking force losing a reported two divisions falls to 3+3, losing four. Counterattack occupation also copies strength into the overrun sector without deducting it from the source at [theaterwide-tactical.game.tsx:180](../src/app/game/games/theaterwide-tactical.game.tsx:180).
- At the turn limit, majority territory produces win/loss at [theaterwide-tactical.game.tsx:201](../src/app/game/games/theaterwide-tactical.game.tsx:201). The banner at [theaterwide-tactical.game.tsx:373](../src/app/game/games/theaterwide-tactical.game.tsx:373) always claims a capital was captured or fell. With five sectors and every sector assigned to one side, the equal-count stalemate branch at [theaterwide-tactical.game.tsx:211](../src/app/game/games/theaterwide-tactical.game.tsx:211) is unreachable.
- CONTESTED cannot appear through [theaterwide-tactical.game.tsx:321](../src/app/game/games/theaterwide-tactical.game.tsx:321): the same target is necessarily reinforceable under [theaterwide-tactical.game.tsx:266](../src/app/game/games/theaterwide-tactical.game.tsx:266).

**Visible problems:** The five-sector desktop strip is a useful spatial model, but it never reflows on phones. Five narrow boxes force tiny labels and cramped plus/minus buttons. The after-click frame only highlights minus at zero; that no-op still looks available. There is no clear front marker, force-transfer visualization, or preview of the next contest. A large blank log reservation separates EXECUTE TURN from its explanation/history.

**Top three changes:**

1. **[BUG] Make combat conserve forces. M.** Resolve against explicit starting stacks, deduct each casualty once, transfer survivors into captured sectors, and deduct counterattacking troops from their origin. Return a structured battle report containing committed, lost, transferred, and remaining forces. Assert that the totals reconcile before tuning the opponent.
2. **[BUG] Make economy and victory rules explicit. S.** Replenish each pool once at the same documented point in the round. Store capital capture, capital loss, and armistice territory outcomes as different reasons. Render the correct banner and state the turn-14 majority rule before play. Remove the unreachable tie outcome or introduce a genuine rule that permits a stalemate.
3. **[MOBILE] Preserve the front without squeezing five control panels. M.** Keep a labeled five-node overview, but show one full-width selected-sector inspector on phones. Offer 44 px minus/plus controls plus COMMIT ALL and CLEAR, disabling adjustments at their bounds. Visibly mark the current edge and contested sector. Preview the contributing troop counts and the 0 to 3 roll range before execution.

## 14. [THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE](../visuals/games-review/sheets/theaterwide-biochem.png)

**Today:** A twelve-turn abstract contamination game with deploy, defend, hold, neighbor spread, stockpiles, and population survival.

**Verdict:** It has a coherent mechanical loop and potentially strong consequences, but the interface barely explains it. AI policy retaliates, cleans its worst region, or initiates a probabilistic attack. HOLD does not create a persistent diplomatic benefit: provocation is only a variable for the current command. Random escalation supplies variation, but the player has little information for learning from it. The survival framing and ending text do not consistently describe the implemented scoring.

**Bugs and rule clarity:** At the ceasefire, either side can win by a population lead greater than ten while both remain at or above 40: [theaterwide-biochem.game.tsx:230](../src/app/game/games/theaterwide-biochem.game.tsx:230). The banner nevertheless says the enemy did not endure or that population collapsed at [theaterwide-biochem.game.tsx:419](../src/app/game/games/theaterwide-biochem.game.tsx:419). The header only asks the player to stay above the survival line at [theaterwide-biochem.game.tsx:264](../src/app/game/games/theaterwide-biochem.game.tsx:264); survival alone does not ensure victory, and exactly 40 is safe under [theaterwide-biochem.game.tsx:219](../src/app/game/games/theaterwide-biochem.game.tsx:219). DEFEND suppresses spread and cleans existing contamination, but incoming deployment increments do not consult defended at [theaterwide-biochem.game.tsx:154](../src/app/game/games/theaterwide-biochem.game.tsx:154) or [theaterwide-biochem.game.tsx:168](../src/app/game/games/theaterwide-biochem.game.tsx:168). Do not describe it as a shield unless that behavior is added.

**Visible problems:** The long title wraps reasonably, but five permanently narrow region cards do not. On the phone, full region names, ownership, contamination, and later defense labels must compete in those slivers. Contamination has only a number; there is no visual link showing adjacency or direction of spread. The survival threshold is a parenthesis in introductory text rather than a marker beside population. After choosing DEPLOY without a target, EXECUTE TURN looks much like an enabled control despite being disabled. A large empty region before the single log line wastes useful space.

**Top three changes:**

1. **[BUG] Report the actual outcome and explain the score. S.** Store separate reasons for own collapse, enemy collapse, mutual collapse, ceasefire advantage, and ceasefire parity. Display both final populations in every case. State SURVIVE AT 40 OR MORE and the ceasefire margin rule in help and status. A healthy side losing by comparison should see CEASEFIRE. ENEMY POPULATION LEADS, not POPULATION COLLAPSE.
2. **[MOBILE] Make the region chain and threshold readable. M.** Show a compact linked region overview with a full-width inspector for the selected region. Add a contamination bar and numeric value, a defense marker, and indicators for known outgoing spread under current conditions. Put a 40 marker on both population bars. Keep the chosen action, eligible targets, and execution requirement together.
3. **[GAMEPLAY] Give restraint an observable consequence. M.** Add a small persistent escalation state that increases on deployment and decreases over consecutive restraint turns. Let it influence the opponent's declared policy and show the current state, without promising safety. Retain a protection-focused path through the existing abstract resources. Make the debrief explain escalation, losses, and surviving population instead of delivering a stock admonition.

## CROSS-CUTTING

### A common shell with room for different games

Use a shared shell for title, objective, phase, statistics, help, restart, exit, and result. Keep game rules and state in their own modules. The current GameProps contract only requires onExit at [types.ts:8](../src/app/game/games/types.ts:8); it does not require replacing the registration mechanism to introduce a shell inside each component.

On desktop, use a bounded content area around 1100 px wide. A board or table can occupy the main column and a roughly 280 px column can hold the current decision and a short report. Compact card games should have a deliberately sized table instead of a full-width empty canvas. On phones, use one vertical scroll surface within the existing fixed .wg container, with board/table, current controls, then history. Keep a compact identity/phase bar available without letting a multiline title consume half the viewport.

The shared .wg-out currently clips overflow at [game.css:166](../src/app/game/game.css:166); only some games override it. Fighter, guerrilla, desert, maze, and the card games can lose access to long content as height shrinks or text grows. This is a source-level overflow risk, not a claim that every initial capture is already clipped. Scope the new flow to the games so terminal transcripts and the hero retain their own layout. The GTW phone treatment at [gtw/gtw.css:800](../src/app/game/gtw/gtw.css:800) is a useful precedent.

Always provide RESTART and EXIT TO GAMES in a consistent location. Separate NEXT HAND, NEW MATCH, RETRY SCENARIO, and NEW SCENARIO where those meanings differ. An in-progress restart can have a small inline confirmation; routine game actions should remain immediate. Cancel pending opponent callbacks when restarting or leaving, particularly the timeouts at [chess.game.tsx:357](../src/app/game/games/chess.game.tsx:357) and [checkers.game.tsx:293](../src/app/game/games/checkers.game.tsx:293).

### Shared interaction and readable visual states

- **Controls:** At least 44 px high for touch, with enough separation to avoid selecting the adjacent command. Small symbols still need accessible names such as Add one division to Central Plain. Disable minus at zero and explain unavailable actions. Avoid making every control equally prominent.
- **Typography:** Keep the existing VT220 identity, with a readable core and restrained halo. Use at least 16 px body text and 14 px supporting text on phones; do not multiply small region text by another 0.78. Most of the current glow comes from [game.css:149](../src/app/game/game.css:149), [game.css:175](../src/app/game/game.css:175), [game.css:177](../src/app/game/game.css:177), and [game.css:213](../src/app/game/game.css:213). Reduce it substantially for rules, numbers, and card ranks. Reserve stronger glow for brief alerts and headings.
- **State:** Separate hover, focus, selection, eligibility, and disabled state. Current .wg-opt uses the same bright fill for hover and focus at [game.css:216](../src/app/game/game.css:216), and its later color declaration overrides direct .wg-amber/.wg-dim button classes at [game.css:204](../src/app/game/game.css:204). Use explicit component variants, persistent selected borders/labels, and a visible focus outline. The gin and theater screenshots show why disabled controls need a distinct treatment.
- **Palette:** Blue identifies the player and normal information, red identifies opposition or damage, amber identifies selection and caution. Add labels, shapes, or outlines so color is not the sole signal. For cards, red remains the hearts/diamonds suit convention; ownership comes from the hand panel, not suit color. Successful attacks should not paint an entire report red.
- **Keyboard:** Keep native Tab/Shift+Tab traversal. Scope shortcuts to the active game and ignore editable fields and modified keys. Let focused buttons own Enter/Space; the global end-screen reset handlers in [fighter-combat.game.tsx:245](../src/app/game/games/fighter-combat.game.tsx:245), [guerrilla-engagement.game.tsx:244](../src/app/game/games/guerrilla-engagement.game.tsx:244), and [desert-warfare.game.tsx:291](../src/app/game/games/desert-warfare.game.tsx:291) should not reset a game when the user activates EXIT. Give boards one roving focus position, arrow-key navigation, and Enter/Space to select, instead of dozens of consecutive Tab stops.
- **Accessible state:** Use aria-pressed for held cards and selected options, full card/piece names, and a concise polite status region for completed actions. Do not announce every map cell or rapidly changing statistic. Respect reduced-motion preferences without hiding game state.

For chess/checkers at 390 px, a nearly full-width board can support approximately 44 px cells. Do not impose that minimum on every square at narrower widths and cause horizontal clipping. Keep the board fitted and supply a usable selected-square inspector or move list when cells must be smaller.

### Shared cards, boards, and reports

Build one original terminal CardTile and CardHand for the five card games. Use crisp rectangular tiles, readable ranks and suit shapes, stable selection indicators, and five columns on a narrow phone where appropriate. Never append a selection marker that changes card width. Cards with no available action should look like information, with the reason the hand is inactive nearby. Reuse the four-seat TrickTable for Hearts and Bridge.

Use a shared BoardFrame for coordinates, a legend, selection, legal destinations, and last-move markers. Share presentation between chess/checkers and between the three small tactical grids, while allowing different movement rules. Map symbols should be designed for their job: visible discs, recognizable pieces, oriented aircraft, and numbered units. Preserve information when a unit occupies an objective.

Replace blank fixed-height log reservations with a short LAST ACTION report and expandable history. The existing [game.css:360](../src/app/game/game.css:360) log hides overflow and bottom-aligns its contents, creating both empty space in the initial sheets and missing context later. A report should name the action, explain its effect, and preserve enough of the opponent's response to understand the new state. Store typed events and result reasons instead of inferring severity or outcome from substrings.

Suggested component structure, proposed only:

    games/ui/
      GameShell.tsx       title, layout variant, phase, help, restart, exit
      GameStatus.tsx      labeled metrics, turn, current objective
      GameActions.tsx     primary/secondary commands, reasons, shortcuts
      GameResult.tsx      outcome reason, final metrics, replay choices
      GameReport.tsx      last action, retained event history, announcements
      cards/
        CardTile.tsx      rank, suit, face-down, held/selected, legal state
        CardHand.tsx      suit grouping, stable order, responsive layout
        TrickTable.tsx    seats, lead, played cards, winner, previous trick
      boards/
        BoardFrame.tsx   coordinates, legend, current selection
        SquareBoard.tsx  chess/checkers cells and keyboard navigation
        TacticalGrid.tsx units, terrain, visibility, range overlays
      SectorStrip.tsx    ordered overview and selected-sector inspector
    games/hooks/
      useGameKeys.ts     scoped shortcuts and repeat handling
      useGameAudio.ts    event cues through the existing sound helpers
      useGameRecords.ts  versioned records by game, mode, and seed

GameShell should accept content slots and callbacks, not inspect arbitrary game state. GameResult needs a reason as well as win/lose/draw. Keep shuffling, card identity, and basic rank/suit rendering shared; keep gin meld evaluation, poker ranking, and trick rules separate. Extract engines when a rules fix benefits from deterministic fixtures, rather than making a universal game engine the prerequisite for every improvement.

### Sound, records, difficulty, and WOPR copy

**[SOUND] Use the existing helpers.** None of the 14 modules calls them. Dispatch one short beep for an accepted selection or move, a chime for a completed hand/objective, and a restrained thud for a capture or damage event. Reserve siren for a major threshold transition rather than every hostile action; [sound.ts:116](../src/app/game/sound.ts:116) schedules a relatively long series of tones. Use beep parameters for subtle game-specific distinctions. Route through the existing sound preference and AudioContext in [sound.ts:32](../src/app/game/sound.ts:32) and [sound.ts:81](../src/app/game/sound.ts:81), including SOUND OFF. Fire cues once per committed event, outside render and replayable state updaters.

Persist useful records under a versioned local-storage key: maze efficiency by seed/size, card match records and best session balance, board-game results by difficulty, and combat outcomes by scenario. Record completed results once using a session ID. Tolerate storage being unavailable. Records persistence is separate from resuming an unfinished match; start with records and add explicit resume where longer games justify it.

Difficulty should change a visible rule or opponent capability. Maze size, tactical scenario setup, and board-game search depth are appropriate. Hidden access to cards or unexplained extra enemy reinforcements are not appropriate difficulty settings. Show the ruleset before the first move, and keep comparisons within the same rules and scenario.

Give WOPR concise observations about actual state. Useful original copy includes SELECT THREE CARDS TO PASS, CAPTURE REQUIRED, TARGET BLOCKED BY DUNE, and CEASEFIRE. THREE SECTORS HELD. Put a brief observation after a hand or mission if desired, but let it name the player's actual decision. Avoid unsupported casualty, fuel, ammunition, or capital-loss claims. Every proposed string here keeps the terminal voice without relying on a repeated film quotation.

Acceptance for these shared changes: inspect initial, meaningful midgame, and result states at 1440 by 900 and 390 by 844, plus a short landscape viewport and enlarged text. Reach help, restart, every legal action, and exit using both touch and keyboard. Check long hands, capture chains, long reports, depleted resources, tied scores, and every distinct ending reason. Seed engine fixtures for the specific correctness findings above. A first click and a screenshot are not sufficient game validation.

## PRIORITIZED ROADMAP

1. **Common game shell and accessible controls. M.** Establish phone scrolling, readable text, distinct focus/selection/disabled states, restart/exit placement, and safe shortcut handling. This removes basic friction across all 14 and fixes the Tab traps.
2. **Tactical warfare accounting. M.** Repair troop conservation, casualty allocation, transfers, and reinforcement timing before balancing the campaign. Use the reproduced 13-troop breakthrough and 5+5 repulse as acceptance cases.
3. **Shared card tiles and hand layout. M.** Make the five card games usable on a phone, with fixed-size selection badges and readable ranks/suits. Convert blackjack and poker first, then the longer hands.
4. **Board pieces and side identity. S.** Fix the chess/checkers font resets, enlarge pieces, distinguish armies, and show coordinates and last moves. This is an unusually cheap improvement to two major games.
5. **Gin rummy settlement and legality. M.** Implement non-gin layoff, the documented draw/discard and stock rules, and honest knock eligibility. Correct winners take precedence over match progression.
6. **Trustworthy action gates and result reasons. M.** Bundle blackjack's bankroll floor, poker's made-straight hold, fighter energy checks, Hearts ties, and false theater/guerrilla ending banners. Keep each fix local and verify its specific scenario.
7. **Desert warfare line of sight and final round. M.** Make sight reciprocal and round 30 playable, then provide the correct ending reason. Reliable terrain is the prerequisite for its larger map and stronger AI.
8. **Board-game rules completion. L.** Fix checkers capture-path selection and compulsory capture, add draw handling, then complete chess special moves and draws. Keep reduced modes labeled until the full rules are ready.
9. **Decision displays and retained reports. L.** Reuse the trick table and last-action report, show air-to-ground effective odds, aircraft headings, selected-unit ranges, and readable theater inspectors. Convert one representative game from each layout family before rolling out.
10. **Replay and feedback layer. M.** Add event-based sound, persisted records, and same-seed replay. Then expose the existing easy AI policies as difficulty choices while stronger policies arrive. Tune new strategic mechanics against comparable seeded runs.
