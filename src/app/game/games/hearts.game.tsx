// HEARTS. You plus three WOPR opponents. STANDARD: match to 100 with the
// left / right / across / keep pass cycle. QUICK: match to 50, always pass left.
// Rules and opponent policy live in engines/hearts.ts (pure, tested). The
// completed trick stays on the table, with its winner and penalty points, until
// your next play; the LAST TRICK panel keeps it after that.
// Design: docs/games-design-review.md §4.
import { useEffect, useMemo, useRef, useState } from "react";
import type { GameEntry, GameProps } from "./types";
import {
  Action,
  ActionBar,
  GameReport,
  GameResult,
  GameShell,
  Panel,
  Segmented,
} from "./ui/GameShell";
import {
  CardHand,
  CardTile,
  TrickTable,
  cardName,
  groupBySuit,
  type Seat,
  type TrickSeat,
} from "./ui/cards/CardTile";
import {
  cue,
  fmtWLD,
  newSeed,
  useEventLog,
  useGameKeys,
  useGameRecords,
  useTimers,
  type WLD,
} from "./hooks";
import {
  MAX_TIEBREAK_HANDS,
  PLAYER_NAMES,
  aiStep,
  cardId,
  confirmPass,
  legalPlays,
  newMatch,
  nextHand,
  passDirection,
  passTarget,
  play,
  type Card,
  type Match,
  type Mode,
  type PassDir,
  type Play,
} from "./engines/hearts";
import "./styles/hearts.css";

const SEAT_OF: readonly Seat[] = ["S", "W", "N", "E"];
const SUIT_WORD: Record<string, string> = {
  "♣": "CLUBS",
  "♦": "DIAMONDS",
  "♠": "SPADES",
  "♥": "HEARTS",
};
const short = (c: Card): string => `${c.rank}${c.suit}`;
const DIR_TEXT: Record<PassDir, string> = {
  left: "LEFT",
  right: "RIGHT",
  across: "ACROSS",
  keep: "KEEP",
};
const AI_MS = 420;
const HOLD_MS = 1100;

function describeTrick(
  no: number,
  plays: readonly Play[],
  winner: number,
  pts: number,
): string {
  const win = plays.find((p) => p.player === winner)!;
  const hearts = plays.filter((p) => p.card.suit === "♥").length;
  const q = plays.some((p) => p.card.rank === "Q" && p.card.suit === "♠");
  const parts = [
    q ? "Q♠ 13" : "",
    hearts ? `${hearts} HEART${hearts > 1 ? "S" : ""}` : "",
  ]
    .filter(Boolean)
    .join(" + ");
  return `TRICK ${no}: ${PLAYER_NAMES[winner]} ${winner === 0 ? "WIN" : "WINS"} WITH ${short(win.card)} · ${pts} PT${pts === 1 ? "" : "S"}${parts ? ` (${parts})` : ""}`;
}

function Hearts({ onExit }: GameProps) {
  const rec = useGameRecords("hearts");
  const timers = useTimers();
  const log = useEventLog();
  const [mode, setMode] = useState<Mode>("standard");
  const [m, setM] = useState<Match>(() => newMatch("standard", newSeed()));
  const [selected, setSelected] = useState<string[]>([]);
  const [hint, setHint] = useState("");
  const mRef = useRef(m);
  mRef.current = m;

  const hand = m.hand;
  const myCards: Card[] =
    m.phase === "pass" ? m.dealt[0]! : (hand?.hands[0] ?? []);
  const myTurn = m.phase === "play" && hand?.current === 0;
  const legal = useMemo(
    () =>
      myTurn && hand
        ? new Set(
            legalPlays(
              hand.hands[0]!,
              hand.trick,
              hand.heartsBroken,
              hand.tricksPlayed === 0,
            ).map(cardId),
          )
        : new Set<string>(),
    [myTurn, hand],
  );

  /** Commit a new match state from a handler: report, sound, records. */
  const commit = (prev: Match, next: Match): void => {
    setM(next);
    const lt = next.hand?.lastTrick;
    if (lt && lt !== prev.hand?.lastTrick) {
      log.push({
        text: describeTrick(lt.no, lt.plays, lt.winner, lt.points),
        kind:
          lt.winner === 0 && lt.points > 0
            ? "bad"
            : lt.winner === 0
              ? "info"
              : "good",
      });
      for (const n of next.lastNotes) log.push({ text: n, kind: "warn" });
      if (lt.winner === 0 && lt.points > 0) cue.hit();
    }
    if (
      next.phase !== prev.phase &&
      (next.phase === "handover" || next.phase === "matchover") &&
      next.handScore
    ) {
      const sc = next.handScore;
      log.push({
        text:
          sc.shooter !== null
            ? `HAND ${next.handNo}: ${PLAYER_NAMES[sc.shooter]} SHOT THE MOON. 26 TO EVERYONE ELSE.`
            : `HAND ${next.handNo}: ${sc.points.map((p, i) => `${PLAYER_NAMES[i]} +${p}`).join(" · ")}`,
        kind: sc.shooter === 0 ? "good" : sc.shooter !== null ? "bad" : "info",
      });
      if (next.status.kind === "over") {
        const o = !next.status.winners.includes(0)
          ? "lose"
          : next.status.shared
            ? "draw"
            : "win";
        rec.recordOnce(`${next.seed}-${next.handNo}`, () =>
          rec.tally(next.mode, o),
        );
        if (o === "win") cue.win();
        else if (o === "lose") cue.lose();
        else cue.draw();
      } else cue.draw();
    }
  };

  // Opponents play on a short timer; a completed trick holds on the table first.
  useEffect(() => {
    if (m.phase !== "play" || !m.hand || m.hand.current === 0) return;
    const justClosed = m.hand.trick.length === 0 && m.hand.lastTrick !== null;
    timers.later(
      () => {
        const prev = mRef.current;
        const step = aiStep(prev);
        if (!step) return;
        cue.card();
        commit(prev, step.match);
      },
      justClosed ? HOLD_MS : AI_MS,
    );
    return timers.clear;
  }, [m]);

  const restart = (nextMode: Mode = mode): void => {
    timers.clear();
    log.reset();
    setSelected([]);
    setHint("");
    setM(newMatch(nextMode, newSeed()));
  };

  const toggle = (c: Card): void => {
    if (m.phase !== "pass") return;
    const id = cardId(c);
    if (selected.includes(id)) {
      setSelected(selected.filter((x) => x !== id));
      setHint("");
      cue.select();
    } else if (selected.length < 3) {
      setSelected([...selected, id]);
      setHint("");
      cue.select();
    } else {
      setHint("THREE CARDS CHOSEN. TAP ONE TO RETURN IT FIRST.");
      cue.deny();
    }
  };

  const doPass = (): void => {
    if (m.phase !== "pass" || selected.length !== 3) return;
    const mine = m.dealt[0]!.filter((c) => selected.includes(cardId(c)));
    const next = confirmPass(m, mine);
    setSelected([]);
    cue.card();
    const from = next.receivedFrom;
    log.push({
      text: `HAND ${m.handNo}: YOU PASSED ${mine.map(short).join(" ")} ${DIR_TEXT[m.dir]} TO ${PLAYER_NAMES[passTarget(0, m.dir)]}. RECEIVED ${next.received.join(" ")}${from !== null ? ` FROM ${PLAYER_NAMES[from]}` : ""}.`,
    });
    commit(m, next);
  };

  const playMine = (c: Card): void => {
    if (!myTurn || !legal.has(cardId(c))) {
      cue.deny();
      return;
    }
    cue.card();
    commit(m, play(m, c));
  };

  const goNext = (): void => {
    if (m.phase === "handover") {
      timers.clear();
      setSelected([]);
      const next = nextHand(m, newSeed());
      setM(next);
      cue.card();
      if (next.dir === "keep")
        log.push({ text: `HAND ${next.handNo}: KEEP HAND. NO PASS.` });
    } else if (m.phase === "matchover") restart();
  };

  useGameKeys((k) => {
    const key = k.toLowerCase();
    if (key === "p" && m.phase === "pass" && selected.length === 3) {
      doPass();
      return true;
    }
    if (key === "n" && (m.phase === "handover" || m.phase === "matchover")) {
      goNext();
      return true;
    }
    return false;
  });

  const changeMode = (v: Mode): void => {
    setMode(v);
    const fresh = m.handNo === 1 && m.phase === "pass" && selected.length === 0;
    if (fresh) restart(v);
  };

  // ---------------------------------------------------------------- view
  const trickNo = hand ? Math.min(13, hand.tricksPlayed + 1) : 0;
  const tiebreakHand = m.status.kind === "tiebreak";
  const led = hand?.trick[0]?.card.suit;

  let phase: string;
  if (m.phase === "pass")
    phase = `SELECT THREE CARDS TO PASS ${DIR_TEXT[m.dir]} (${selected.length}/3)`;
  else if (m.phase === "play" && hand) {
    if (hand.current === 0) {
      if (hand.trick.length === 0)
        phase =
          hand.tricksPlayed === 0 ? "YOUR LEAD: TWO OF CLUBS" : "YOUR LEAD";
      else
        phase =
          legal.size && [...legal].every((id) => id.endsWith(led!))
            ? `YOUR PLAY: FOLLOW ${SUIT_WORD[led!]}`
            : `YOUR PLAY: VOID IN ${SUIT_WORD[led!]}, DISCARD`;
    } else phase = `${PLAYER_NAMES[hand.current]} TO PLAY`;
  } else if (m.phase === "handover")
    phase =
      m.status.kind === "tiebreak"
        ? "LOW SCORE TIED: TIE-BREAK HAND NEXT"
        : "HAND COMPLETE";
  else phase = "MATCH OVER";

  // Table: the trick in progress, or the completed trick until your next play.
  const showing: { plays: readonly Play[]; done: boolean } =
    hand && hand.trick.length > 0
      ? { plays: hand.trick, done: false }
      : { plays: hand?.lastTrick?.plays ?? [], done: !!hand?.lastTrick };
  const lt = hand?.lastTrick ?? null;
  const seats = {} as Record<Seat, TrickSeat>;
  for (let p = 0; p < 4; p++) {
    const pl = showing.plays.find((x) => x.player === p);
    const voids = hand?.voids[p] ?? [];
    seats[SEAT_OF[p]!] = {
      name: PLAYER_NAMES[p]!,
      card: pl?.card,
      winner: showing.done && lt?.winner === p,
      active: m.phase === "play" && hand?.current === p,
      lead: showing.plays[0]?.player === p,
      note: `${hand?.taken[p] ?? 0} PT${(hand?.taken[p] ?? 0) === 1 ? "" : "S"}${voids.length ? ` · VOID ${voids.join("")}` : ""}`,
    };
  }
  const center = (
    <div className="ht-center" data-testid="hearts-trick-center">
      {showing.done && lt ? (
        <>
          <strong>
            TRICK {lt.no} TO {PLAYER_NAMES[lt.winner]}
          </strong>
          <span>
            {lt.points} PENALTY PT{lt.points === 1 ? "" : "S"}
          </span>
        </>
      ) : m.phase === "pass" ? (
        <span>PASS {DIR_TEXT[m.dir]}</span>
      ) : hand && hand.trick.length > 0 ? (
        <span>
          TRICK {trickNo}/13 · {SUIT_WORD[led!]} LED
        </span>
      ) : (
        <span>2♣ LEADS</span>
      )}
    </div>
  );

  const received = new Set(m.received);
  const groups = groupBySuit(myCards, ["♣", "♦", "♠", "♥"]);
  const handLabel =
    m.phase === "pass"
      ? "YOUR HAND · TAP THREE TO PASS"
      : myTurn
        ? "YOUR HAND · TAP A LEGAL CARD"
        : "YOUR HAND";
  const inactive =
    m.phase === "play" && !myTurn
      ? `WAITING FOR ${hand ? PLAYER_NAMES[hand.current] : ""}.`
      : undefined;

  const scoreboard = (
    <Panel title={`SCORES · TARGET ${m.target} · LOW WINS`}>
      <table className="ht-score" data-testid="hearts-scores">
        <thead>
          <tr>
            <th scope="col">PLAYER</th>
            <th scope="col">MATCH</th>
            <th scope="col">THIS HAND</th>
          </tr>
        </thead>
        <tbody>
          {PLAYER_NAMES.map((n, i) => {
            const lowNow = m.totals[i] === Math.min(...m.totals);
            const handPts =
              m.handScore && m.phase !== "play" && m.phase !== "pass"
                ? m.handScore.points[i]!
                : (hand?.taken[i] ?? 0);
            return (
              <tr
                key={n}
                className={`${i === 0 ? "is-you" : ""}${lowNow ? " is-low" : ""}${handPts >= 13 ? " is-hot" : ""}`}
              >
                <th scope="row">{n}</th>
                <td className="ht-total">{m.totals[i]}</td>
                <td className="ht-handpts">
                  {m.phase === "pass" ? "—" : `+${handPts}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );

  const passPanel = m.phase === "pass" && (
    <Panel
      title={`PASS ${DIR_TEXT[m.dir]} TO ${PLAYER_NAMES[passTarget(0, m.dir)]}`}
    >
      <div className="ht-slots" data-testid="hearts-pass-slots">
        {[0, 1, 2].map((i) => {
          const id = selected[i];
          const c = id ? myCards.find((x) => cardId(x) === id) : undefined;
          return c ? (
            <CardTile
              key={i}
              card={c}
              size="sm"
              badge={`${i + 1}/3`}
              onClick={() => toggle(c)}
              label={`Pass slot ${i + 1}: ${cardName(c)}. Tap to return it.`}
            />
          ) : (
            <span
              key={i}
              className="gs-card gs-card-sm gs-card-empty"
              role="img"
              aria-label={`Pass slot ${i + 1} empty`}
            >
              {i + 1}
            </span>
          );
        })}
      </div>
      <ActionBar>
        <Action
          variant="primary"
          onClick={doPass}
          disabled={selected.length !== 3}
          reason={`CHOOSE ${3 - selected.length} MORE`}
          testId="hearts-pass"
          shortcut="P"
        >
          PASS {selected.length}/3 {DIR_TEXT[m.dir]}
        </Action>
      </ActionBar>
      {hint && <p className="gs-tone-amber">{hint}</p>}
    </Panel>
  );

  const lastPanel = lt && (
    <Panel title={`LAST TRICK · ${lt.no}/13`}>
      <div className="ht-last" data-testid="hearts-last-trick">
        {lt.plays.map((p) => (
          <span key={p.player} className="ht-last-play">
            <CardTile
              card={p.card}
              size="sm"
              mark={p.player === lt.winner ? "win" : "none"}
              badge={p.player === lt.winner ? "WINS" : undefined}
            />
            {PLAYER_NAMES[p.player]}
          </span>
        ))}
      </div>
      <p>
        {PLAYER_NAMES[lt.winner]} {lt.winner === 0 ? "TAKE" : "TAKES"}{" "}
        {lt.points} PT{lt.points === 1 ? "" : "S"}.
      </p>
      {m.lastNotes.length > 0 && (
        <ul className="ht-notes">
          {m.lastNotes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </Panel>
  );

  const nextDir = passDirection(m.handNo + 1, m.mode);
  const handPanel = m.phase === "handover" && m.handScore && (
    <Panel title={`HAND ${m.handNo} COMPLETE`}>
      <p data-testid="hearts-hand-result">
        {m.handScore.shooter !== null
          ? m.handScore.shooter === 0
            ? "YOU SHOT THE MOON. 26 TO EACH OPPONENT."
            : `${PLAYER_NAMES[m.handScore.shooter]} SHOT THE MOON. 26 TO EVERYONE ELSE.`
          : `YOU TOOK ${m.handScore.points[0]} PT${m.handScore.points[0] === 1 ? "" : "S"} THIS HAND.`}
      </p>
      {m.status.kind === "tiebreak" && (
        <p className="gs-tone-amber">
          {m.status.tied.map((i) => PLAYER_NAMES[i]).join(" AND ")} TIED LOW AT{" "}
          {m.status.low}. TIE-BREAK HAND {m.tiebreaks + 1} OF{" "}
          {MAX_TIEBREAK_HANDS}.
        </p>
      )}
      <ActionBar>
        <Action
          variant="primary"
          onClick={goNext}
          testId="hearts-next"
          shortcut="N"
          autoFocus
        >
          NEXT HAND ·{" "}
          {nextDir === "keep" ? "KEEP" : `PASS ${DIR_TEXT[nextDir]}`}
        </Action>
      </ActionBar>
    </Panel>
  );

  let resultPanel = null;
  if (m.phase === "matchover" && m.status.kind === "over") {
    const s = m.status;
    const o = !s.winners.includes(0) ? "lose" : s.shared ? "draw" : "win";
    const names = s.winners.map((i) => PLAYER_NAMES[i]).join(" AND ");
    const reached = m.totals
      .flatMap((t, i) => (t >= m.target ? [PLAYER_NAMES[i]] : []))
      .join(", ");
    resultPanel = (
      <GameResult
        outcome={o}
        headline={
          o === "win"
            ? "YOU WIN THE MATCH"
            : o === "draw"
              ? "SHARED WIN"
              : `${names} WIN${s.winners.length > 1 ? "" : "S"}`
        }
        reason={
          s.shared
            ? `${names} STILL TIED LOW AT ${s.low} AFTER ${m.tiebreaks} TIE-BREAK HANDS. THE WIN IS SHARED.`
            : `${reached} REACHED ${m.target}. ${names} HOLDS THE LOW SCORE ALONE AT ${s.low}${m.tiebreaks ? ` AFTER ${m.tiebreaks} TIE-BREAK HAND${m.tiebreaks > 1 ? "S" : ""}` : ""}.`
        }
        metrics={[
          { label: "HANDS", value: m.handNo },
          { label: "YOUR TOTAL", value: m.totals[0]! },
        ]}
        testId="hearts-outcome"
      >
        <Action
          variant="primary"
          onClick={() => restart()}
          testId="hearts-again"
          shortcut="N"
        >
          NEW MATCH
        </Action>
      </GameResult>
    );
  }

  const record = rec.get<WLD | undefined>(m.mode, undefined);

  return (
    <GameShell
      slug="hearts"
      title="HEARTS"
      layout="table"
      objective={`AVOID HEARTS AND THE QUEEN OF SPADES. FIRST TO ${m.target} ENDS THE MATCH; LOW SCORE WINS.`}
      phase={phase}
      phaseTone={myTurn || m.phase === "pass" ? "amber" : "dim"}
      metrics={[
        {
          label: "HAND",
          value: tiebreakHand ? `${m.handNo} TIE-BREAK` : m.handNo,
          tone: tiebreakHand ? "amber" : "normal",
        },
        { label: "PASS", value: DIR_TEXT[m.dir] },
        { label: "TRICK", value: hand ? `${trickNo}/13` : "—" },
        {
          label: "HEARTS",
          value: hand?.heartsBroken ? "OPEN" : "CLOSED",
          tone: hand?.heartsBroken ? "red" : "dim",
        },
        { label: "YOU", value: `${m.totals[0]}/${m.target}` },
        {
          label: `RECORD ${m.mode === "quick" ? "QUICK" : "STD"}`,
          value: fmtWLD(record),
          tone: "dim",
          title: "Matches won-lost-shared in this mode",
        },
      ]}
      toolbar={
        <Segmented<Mode>
          label="MODE"
          value={mode}
          onChange={changeMode}
          options={[
            { value: "standard", label: "STANDARD" },
            { value: "quick", label: "QUICK · ALWAYS LEFT" },
          ]}
          testId="hearts-mode"
        />
      }
      help={
        <>
          <p>
            TAKE AS FEW PENALTY POINTS AS POSSIBLE. EACH HEART IS 1 POINT, THE
            QUEEN OF SPADES 13.
          </p>
          <ul>
            <li>
              STANDARD: MATCH TO 100. PASS THREE CARDS LEFT, RIGHT, ACROSS, THEN
              KEEP (NO PASS), REPEATING.
            </li>
            <li>
              QUICK: MATCH TO 50. ALWAYS PASS LEFT. A MODE CHANGE MID-MATCH
              APPLIES TO THE NEXT MATCH.
            </li>
            <li>
              THE TWO OF CLUBS LEADS THE FIRST TRICK. FOLLOW SUIT IF YOU CAN;
              HIGHEST CARD OF THE LED SUIT WINS.
            </li>
            <li>
              NO HEARTS OR QUEEN OF SPADES ON THE FIRST TRICK UNLESS YOU HOLD
              NOTHING ELSE.
            </li>
            <li>
              HEARTS CANNOT BE LED UNTIL ONE HAS BEEN PLAYED (HEARTS OPEN),
              UNLESS YOU HOLD ONLY HEARTS.
            </li>
            <li>
              SHOOT THE MOON: TAKE ALL 26 POINTS AND EVERY OPPONENT SCORES 26
              INSTEAD.
            </li>
            <li>
              WHEN SOMEONE REACHES THE TARGET, THE LOWEST TOTAL WINS. IF THE LOW
              SCORE IS TIED, UP TO {MAX_TIEBREAK_HANDS} TIE-BREAK HANDS ARE
              PLAYED; A TIE THAT SURVIVES THEM IS A SHARED WIN.
            </li>
            <li>
              THE COMPLETED TRICK STAYS ON THE TABLE UNTIL YOUR NEXT PLAY. LAST
              TRICK KEEPS IT AFTER THAT.
            </li>
            <li>
              OPPONENTS SEE ONLY THEIR OWN CARDS AND WHAT HAS BEEN PLAYED. THEY
              TRACK SHOWN VOIDS AND DEFEND AGAINST THE MOON.
            </li>
            <li>
              KEYS: P PASS · N NEXT HAND / NEW MATCH. TAB TO A CARD, ENTER TO
              PLAY IT.
            </li>
          </ul>
        </>
      }
      onRestart={() => restart()}
      inProgress={
        m.phase !== "matchover" && (m.handNo > 1 || m.phase !== "pass")
      }
      restartLabel="NEW MATCH"
      onExit={() => {
        timers.clear();
        onExit();
      }}
      side={
        <div className="ht-side">
          {resultPanel}
          {passPanel}
          {handPanel}
          {lastPanel}
          {scoreboard}
          {mode !== m.mode && (
            <p className="gs-tone-amber">
              {mode === "quick" ? "QUICK" : "STANDARD"} MODE STARTS WITH THE
              NEXT MATCH.
            </p>
          )}
        </div>
      }
      report={<GameReport events={log.events} />}
      announce={log.events[log.events.length - 1]?.text}
    >
      <div className={`ht-table${m.phase === "pass" ? " is-pass" : ""}`}>
        <TrickTable seats={seats} center={center} testId="hearts-table" />
        {(m.phase === "pass" || m.phase === "play") && (
          <CardHand
            label={handLabel}
            testId="hearts-hand"
            inactiveReason={inactive}
          >
            <div className="ht-hand-groups" style={{ display: "contents" }}>
              {groups.map((g) => (
                <div
                  key={g.suit}
                  className="gs-suitgroup"
                  role="group"
                  aria-label={SUIT_WORD[g.suit]}
                >
                  {g.items.map(({ card: c }) => {
                    const id = cardId(c);
                    const isSel = selected.includes(id);
                    const playable = m.phase === "pass" || legal.has(id);
                    return (
                      <CardTile
                        key={id}
                        card={c}
                        selected={isSel}
                        eligible={myTurn && playable}
                        badge={
                          isSel ? "PASS" : received.has(id) ? "NEW" : undefined
                        }
                        disabled={
                          m.phase === "play"
                            ? !myTurn || !playable
                            : m.phase !== "pass"
                        }
                        onClick={() =>
                          m.phase === "pass" ? toggle(c) : playMine(c)
                        }
                        testId={`hearts-card-${id}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </CardHand>
        )}
      </div>
    </GameShell>
  );
}

export const entry: GameEntry = { id: "HEARTS", Component: Hearts };
