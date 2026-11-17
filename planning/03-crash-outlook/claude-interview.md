# Interview: 03-crash-outlook

2026-11-17. Mode: autonomous. Bond's standing directive from this date: "no
more questions just build it and do what you think is best." Interview
questions are therefore self-answered with the reasoning recorded; every
answer follows the requirements, the fixture table, and the locked decisions
from earlier splits.

Q1: How many messages and what mix?
A: Twelve messages in the fixture seed: three required deliveries (weather
correction, payroll clearance, directive audit), the high-priority D-83
exercise bulletin decoy (the C17 surface), two plausible decoys with real
authority but wrong scope, two duplicates of required messages with stale
or wrong recipients, one correction superseding an earlier message, and
three routine-noise messages. Rationale: the spec says 10 to 12; twelve
gives each teaching beat a concrete artifact without padding.

Q2: Channel model numbers?
A: Primary channel: fast ETA, degrades in three authored stages at explicit
clock milestones (full, slowed, dark), each stage announced by a scheduled
event. Backup channel: fixed capacity of five sends for the whole mission,
constant slow ETA, never degrades. Required deliveries are three, so five
backup slots tolerate one wasted send plus one decoy mistake but not
spray-and-pray. All integers; exact ETAs authored per seed.

Q3: Success tiers?
A: Settlement tiers by acknowledged-before-deadline count of the three
required deliveries with correct version and recipient: 3 = full success,
2 = partial, 1 = poor, 0 = failed. Timeout and forfeit evaluate the same
count at settlement. Debrief reports each delivery individually per the
requirements. Consequence emitted: commsDelayed magnitude scales inversely
with tier (authored integer table, capped by the engine).

Q4: Command verbs?
A: READ <id>, FLAG <id>, QUEUE <id> <CHANNEL>, SEND <id> <CHANNEL>,
TRACE <id>, CHECK SOURCE <id>, HELP. Buttons expose identical actions per
the shell grammar identity rule. Reading, flagging, queueing are free;
SEND spends capacity.

Q5: How does the player verify recipients?
A: Evidence lives in the message bodies: sender authority lines, reply
chains naming the intended desk, timestamps, and parent references. The
directive audit message carries the D-83 clue (R04 reference) and TRACE on
the exercise bulletin shows EXERCISE origin, run R04, while the observed
weather correction shows an OBSERVED field origin; a desk CHECK SOURCE on
the bulletin returns CONTRADICTED after the authored wait.
