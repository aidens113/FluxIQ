# A saved Flow's road: what the run stage holds back

How a saved Flow runs at the answer-first attempt's run stage, where the rule for a repeated
press changed (t869). The cause and the tests are in
`docs/working/answer-first-plan/reports/attempt-road/saved-flow-defects.md`.

## A plain press is not a lasting one

The run gate (`answer-first/run-acts/`) used to read the floor `effectClass: "commit"` as lasting.
Every click has that floor (`action-effect/table.ts`), and it means "a page decides what this
does, so do not repeat it after a lost answer", not "this lasts". So every repeated press was
held back and the second press of a Flow's own loop was refused.

A press lasts at the run stage when any of these holds:

- it declared a consequence class (`metadata.declaredConsequences`);
- a floor names a consequence;
- it is marked destructive;
- its draft step claims a lasting act of the person's request (`flow-run/act-claims.ts`), using
  the same kinds as the build (`AUTOMATION_STUDIO_INSTRUCTED_ACT_LASTING_KINDS`). `set`, `open`
  and a choice do not count.

Anything else with a commit floor is a plain press and runs each time the Flow says. The engine's
own retry rule is unchanged: it still treats a commit floor as lasting, so a plain press whose
answer was lost is not sent twice by a retry.

An undeclared press that answered with an effect is recorded `may_have_landed` and `undeclared`:
told to the next round, left out of the result's acts and of every refusal. One that answered with
nothing certain is held to a look. One that did nothing, or found the state already there, records
nothing.

## What follows

- A declared or claimed press never goes twice in a run, across steps or by hand. A plain press of
  a control a declared one already pressed is refused. The row-left-behind guard covers plain
  presses too.
- A plain repeat is not capped by "add 3": the count applies only to a step that says it lasts.
  A toggle whose step neither declares nor claims is pressed as often as its Flow says.
- A control already in the state asked for answers `skipped: "already_in_state"`, so it is not
  counted as a change.
- A remembered prompt that appears with the press that opens a dialog no longer stops a saved
  Flow once the page stops showing it again.
