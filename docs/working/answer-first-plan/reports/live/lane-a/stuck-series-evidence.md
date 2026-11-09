# Stuck series keeps its evidence

## Outcome
Partial. The fix is in and its checks pass. The one scripted proof named in the brief does not pass, for a reason I believe predates this change (below).

## What changed and why
The stuck path (`AttemptProofStuck`, and `AttemptScriptRefused`) skipped A4's keeper in `run-attempt-command.ts`. I extended A4's `writeUnscoredAttemptEvidence` instead of adding a second writer.
- `live/unscored-attempt-evidence.ts`:
  - New `scored` input: the attempts the driver had already scored. Their record in `attempt.json` carries the answer verdict, the series row, `startedFrom`, `askedAgain`, plus the site change and rows as before. They are not marked `notScored`.
  - New `didNotEnd` input `{ordinal, attempt?}`. `attempt.json` gets a `didNotEnd` object with the ordinal, the number of attempts asked for, the reason (name and message, which includes the stuck text and what the chat showed) and Core's last record of the unfinished attempt (`stoodAt`).
  - `attempt-report.txt` says "Attempt N ended X and was scored right." and "Attempt 2 of 2 did not start: ..." or "did not end (it stood at working, ...)".
  - The bundle is written for a paid run even when no attempt ended. The verdict is "failed". The spend is every ended attempt plus the unfinished attempt's recorded spend.
- `live/attempt/proof-stuck.ts` and `live/follow-attempt.ts`: `AttemptProofStuck` now carries the attempt Core had recorded (`attempt`, default null), so its spend is not lost.
- `live/run-attempt-command.ts`:
  - The driver is wrapped so each scored outcome and its report row are kept as it returns.
  - The catch block now keeps evidence for every ending (stuck, refused, any other throw). A stuck or refused follow marks `didNotEnd.ordinal` as the highest kept ordinal plus 1.
  - The stuck and refused paths still print `not_judged` and exit 1. A generic throw still rethrows.
- The ledger needed no change. `scripts/lab/live-guards/rules/unchanged.mjs` treats any verdict other than "passed" as blocking a relaunch on unchanged source. "failed" is what A4 already writes and is correct for a stuck run: the product did not finish, and the relaunch should wait for a source change. `not_judged` would block in the same way, so I kept "failed" and touched nothing in `scripts/lab`.

## Commands run and observed results
- `pnpm.cmd --filter @fluxiq-web-extension/test-runner check` -> passed (tsc, no errors).
- `pnpm.cmd --filter @fluxiq-web-extension/test-runner build` -> built.
- `node --test` over `dist/attempt-lane/live/tests`, `live/attempt/tests` and `attempt-lane/tests` -> 62 tests, 62 pass, 0 fail. This includes 3 new tests in `live/tests/unscored-attempt-evidence.test.ts`:
  - Attempt 1 scored right and attempt 2 stuck: the verdict and the stuck reason are kept, and the ledger reads the run id, "failed" and $0.50.
  - Attempt 2 had stood unended: its recorded spend is added ($0.75).
  - Attempt 1 stuck with nothing ended: the record and the ledger's run id are written.
- `node scripts/structure-audit.mjs` -> "passed (244 warning(s), 552 baselined)".
- Scripted proof as given (`company-website`, `--attempts 2`) -> attempt 1 ended achieved and scored right. Attempt 2 was refused by the scripted model: "The script for company-website-apprentices expects no request 2 of kind panel_command". That script only has requests for one attempt. The new code ran on this path and wrote `attempt.json` and `attempt-report.txt` with "Attempt 1 ended achieved and was scored right. / Attempt 2 of 2 did not start: ...", and the run printed `not_judged`. The refusal comes from the scripted server, which my change does not touch, so I believe it is not a regression. I could not compare against the old code, because git stash and checkout are not allowed.
- Also ran the everything-store scripted two-attempt proof as a check of the normal, non-throwing path through my driver wrapper. It ran through the wrapper and ended with its scored verdict. That script's attempt 1 answer is "wrong" and the series stopped short, so it is not a pass either.

## Not verified
- No live or paid run. The real `run-mw4907db-c3992394` situation (a stuck follow with a recorded in-flight attempt) is covered by unit tests only.
- Whether a two-attempt scripted proof passes at all today (the company-website script has no second-attempt requests).
- The `run-again` form of the proof.
- Attempt 1's site change and picture on the stuck path are the A4 and `onEnded` evidence (`site.json`, `answer-turn.*`, written as it ends), not re-derived.

## Open questions or contradictions found
- The brief's proof command cannot pass as written, because the company-website scripted model supports only a single attempt. Needs a decision: add second-attempt requests to that script, or point the proof at a task whose script supports `--attempts 2`.
- `attempt.json` for a short series has a top-level `notScored` (the stop reason) and a `didNotEnd` object, but not the `series`, `continuation` or `stoppedShort` keys of a complete run. Readers that expect `series` must tolerate it, as they already did for A4's unscored form.

Outcome: Partial
Changed: packages/test-runner/src/attempt-lane/live/{unscored-attempt-evidence.ts, run-attempt-command.ts, follow-attempt.ts, attempt/proof-stuck.ts, tests/unscored-attempt-evidence.test.ts}
