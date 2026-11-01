# Live judge discovery — 2026-10-31

Outcome: Done (read-only discovery; no product changes).

## Observed result

- Run `run-mvx1t6il-3d751ec6`: 24 provider calls, $1.1671215, 528382 ms; no accepted Flow, oracle result or replay.
- The final whole trial's seven tool calls succeeded, but its read collected and would store **7** rows. Execution success does not establish the requested complete answer.
- All four final judge replies (0056–0059) rejected the same missing row. The authored read and record-output schema declare four columns; the receipt's `rows` objects deliberately summarize labels only. That receipt does not prove the other three output columns were absent.
- The missing row is in the final page evidence. In its own item block, the predicate-measured earlier text is followed by the requested identifier badge and a numeric identifier. It was excluded only by the second predicate, whose equality read measured that earlier text instead of the badge. The independent Domain discovery owns the binding/reader cause.
- No missing-page conclusion follows from this trace: the rejected row was already observed on the final page. My preliminary false-judge inference from the predicate's literal text occurring in the instruction is retracted; an authored predicate is not task authority.

## Exact judge and stop chain

- Read-only replay through current Core source reconstructed initial 0041/0042 as `does_not_answer / model / core.result.does_not_answer_request`.
- The final defect locator returns `located=0`, `refuted=0`, one finding: Core lacks the measured cell for the claimed column. This is **unmeasured evidence**, not a refuted claim or proof that the missing row is unasked.
- Final 0056/0057, then saved 0058/0059 replayed through actual verdict/agreement code, return `unsure / model_unconfirmed / core.result.refutation_unsupported`, `unsupportedNo.calls=[1,2]`, no model yes.
- `result-verification/located-defects/row-cells.ts:33` obtains build-test cells only from parsed label/value text (`:55`); final labels carry no such cell. `request-rows/summary-reads.ts:172` reads build-test labels and conditions but does not carry their `observations` into the derived condition record (`:182`).
- `result-verification/agreement/unsupported-no.ts:112` re-asks each unsupported rejection once. If it remains unsupported, `:160` returns model-unconfirmed. `:161` and `:322` intentionally retain expected/request interpretation only and discard observed/advice, preventing invented advice from becoming a repair instruction.
- `result-verification/build-test/judge.ts:375` maps that outcome to `unknown` (`:385`) with `unsupportedNo=true`; it has no observed/advice or `stillAchievable`.
- `flow-bootstrap/unfinished-build/judgement.ts:240` maps unknown into the round judgement; `:243` retains verdict/findings/reading but drops the typed `unsupportedNo` marker. Only the `no` branch (`:252`) retains advice and achievability.
- `flow-bootstrap/unfinished-build/progress.ts:67` counts no→unknown as progress only if a model call said yes. None did here. The remaining measured progress did not move.
- `flow-bootstrap/unfinished-build/phases.ts:598` grants one stalled repair only when `judgedFixNamed` is true; `:626` requires `verdict === "no"` and nonempty advice. Unknown therefore ends at `:599` after this first stalled repair.
- **Exact stop: `no_progress`, not money, time, calls, repeated-unchanged or inability.** Saved final chat matches both source templates at `not-finished.ts:124` (one stalled repair) and `:184` (unknown after prior no); it does not match the repeated-unchanged template.
- All four final calls completed in 43108 ms, the last at 330444 ms relative to the first chat request; the build settled at 330933 ms. There was no final judge timeout. The authorized ceiling was $5 and 26 calls; this stop occurred before the next-round funding check (`phases.ts:607`).

## Bounded implementation recommendation

- Keep the uncertain verdict unaccepted. Fix actual field-reader/binding behavior in the parallel Domain lane; do not treat failure of an authored predicate as proof a row is outside the request.
- Preserve a **typed, unconfirmed evidence-investigation hint** when a structured defect cannot be located because its row/column was not measured. It should ask the builder to inspect/re-read the relevant read and its excluded item, never claim the model's defect/advice is true and never grant permission or effect authority.
- Carry that marker/hint through verification → build-test verdict → unfinished-round judgement. Do not simply restore arbitrary unsupported observed/advice that the existing safety boundary deliberately drops.
- Let that actionable unconfirmed hint buy the existing **one** no-progress grace repair. On the next unchanged/unprogressed round, stop normally. Preserve normal purse, calls, duration, retry and final model-yes requirements.
- Minimum Core ownership: `result-verification/contracts/verification.ts`; `agreement/unsupported-no.ts` (plus a focused hint module if needed); `build-test/judge.ts`; `flow-bootstrap/unfinished-build/contracts.ts`, `judgement.ts`, `phases.ts`; their owning tests. If evidence transfer is corrected instead, `request-rows/summary-reads.ts` and `located-defects/row-cells.ts` own that separate seam.
- The existing synthetic `answers` branch at `agreement/unsupported-no.ts:243` was **not reached** here (`refuted=0`). It must not be used to bypass this failed result or substitute for the user-required model yes.

## Suggested narrow acceptance checks (not run)

- Package typecheck: `pnpm --filter fluxiq check`.
- From `packages/fluxiq`: `pnpm exec vitest run src/programs/automation-studio/runtime/result-verification/build-test/tests/judge-unsupported-no.test.ts src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/tests/judgement-value.test.ts src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/tests/no-progress-ending.test.ts src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/tests/repair-rounds.test.ts` plus the new hint-owner tests.
- Require: unknown stays unknown; hint is explicitly unconfirmed; builder must re-read rather than obey alleged defect; one grace repair only; next stall stops; budget/cancellation still stop; no synthetic yes or ordinary runtime authority change.
- Also test measured correct claims versus unmeasured claims versus actually refuted claims separately, with generic unrelated fixture data. Product guidance must remain generic.

## Validation and limits

- `node --experimental-transform-types` (read-only stdin probes over saved artifacts and current source) → final location `0/0`, final agreement `core.result.refutation_unsupported`, re-asked calls `[1,2]`; final-chat source-template matches confirm `no_progress`.
- Earlier `node --experimental-strip-types` probe could not import a TypeScript runtime construct; re-run using transform-types succeeded. No source/artifact was changed by either probe.
- No browser, provider, paid run, package test suite, git mutation or source edit. Literal resolved selectors and physical field binding remain with the Domain discovery; all four actual output cell values and the oracle/replay remain unverified.

Changed: this report only.
Not verified: fix behavior, browser behavior, acceptance/oracle/replay, literal reader binding.
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/completion-parameters/live-judge-discovery.md`.
