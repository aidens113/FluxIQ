# Report: fhl-synthesis

## Outcome

Done. Eleven audit reports are synthesised into the owning plan
(`docs/working/framework-heavy-lifting-plan.md`: Current State at 101 lines, Findings F0-F11, a 40-row responsibility
map, contracts CC1-CC14 and K1-K7, phases P0-P10, what not to do, 9 owned open questions). The paired web document
(`../!FluxIQWebExtension/docs/working/framework-heavy-lifting-plan.md`) holds the contract fills W0-W10, the move of web
concepts out of Core, and 7 web open questions. Nothing outside these three files was edited.

Top three recommendations:

1. Judge only the semantic residue, after computed checks (P5).
2. One truthful undo and reset answer (P4).
3. An honest trial door, with region and landing witnesses and a dead-requirement stop (P2, P3).

The bookkeeping folds (P1) are the cheapest unit to run first.

## What changed and why

- Rewrote Core's `framework-heavy-lifting-plan.md` below the header block. The header and `## Worker Briefs` are
  unchanged and the Work Ledger is empty, as the brief asked.
- Rewrote the web `framework-heavy-lifting-plan.md` below the header. Only `Paired document` changed, and `## Worker
  Briefs` is unchanged.
- Findings are ranked by runs decided in the debug notes, then by step-workload arithmetic. Unit costs used: decide
  $0.000724 and 1.93 s; later decides about $0.0008; judge first ask about $0.0014, twin $0.0003; run_node 3.58 s.

## Contradictions resolved

1. **Cache churn cause.** fhl-step-workload called the mechanism "unidentified"; fhl-core-build-tools traced it to old
   views being replaced. Checked: `runtime/llm/context-window.ts:16-25` states design B1 (2026-10-01), "a view the
   target has left is not sent again". Resolved for build-tools. P9's append-only design keeps B1's rule by writing the
   reference at entry time.
2. **Why dead brief 1 happened, and why it ran 49 decides.** fhl-core-build-tools blames a witness deadlock;
   fhl-core-data-supervisor blames a no-progress counter that resets on new pages. Both are true.
   - The cause is the door: `flow-bootstrap/site-reset/project-reset.ts:136-141` always gives `canMeet: "another_page"`,
     and the witness kinds are closed (`reset-admission/witness.ts:24-29`).
   - The duration is the counter: `llm/evidence-progress/no-progress.ts:43-47` counts an applied call that reaches an
     unseen state as progress, and `refusedAgain` clears on a new signature (`:177-181`).
   - The plan fixes both, in P2 (door plus K6).
3. **Judge twins.** fhl-step-workload could not tell whether the 7 byte-identical pairs were deliberate or concurrent;
   fhl-core-judging said serial.
   - Checked: `result-verification/verify.ts:270-279` and `agreement/ask-again.ts:59-62`. A non-yes is always asked
     again with the same evidence. A yes is asked again only with `confirmAnswer` (and then as the converse question,
     `ask-again.ts:69-72`) or with `exclusionEvidenceMissing`.
   - So the 5 no-pairs are deliberate and correlated (a cache hit). Why the 2 yes-pairs (230/231, 249/250) were
     byte-identical is not settled (see Not verified).
4. **Drop the twin judge?** fhl-step-workload estimate E drops it; fhl-core-judging option F says that is negative
   alone. Resolved: P5 drops a re-ask only where the no's defect is grounded, and a re-ask varies its wording.
5. **May Core settle a yes?** fhl-core-build-tools row 16 lets a verbatim pre-check settle a yes; fhl-core-judging
   requires a model yes unless explicitly gated. Resolved: a model yes stays required, because settling a pass in Core
   is close to forcing one. Open question 1 asks the user.
6. **Consequences floor.** fhl-core-build-tools row 8 would derive `[]` for a navigation-only press (lowering the
   model's `create_new`). fhl-core-trials-resets uses the union, and fhl-core-runtime B3 the max. Resolved:
   declarations are never lowered (permission safety). The observed effect instead decides which witness a step needs,
   so a navigation-only press needs only a landing (P3).
7. **Auto-paging.** fhl-core-grammar row 13 has Core add the paging loop; fhl-core-data-supervisor D5 says "do not
   auto-page for the model". Resolved: Core adds or requires paging only from a client-reported `continues` and next
   control (P7).
8. **`clearsInterference`.** fhl-core-runtime found no writer in Core and did not search downstream. Checked: grep over
   `!FluxIQWebExtension/domain/src` and `apps/extension/src` finds nothing, and Core has readers only
   (`executor/ladder-run.ts`, `executor/lifecycle/graph-registrations.ts`, `registration.ts`, `model/validation/flow.ts`).
   The rung is dormant in both repositories.
9. **Count of `web.` lines.** fhl-core-client-seam says 57 hits; `grep -c "web\.\(dom\|browser\)"` on
   `flow-script-format.ts` gives 56 lines. The plan says 56 lines.

## Claims checked in source (top five ranked findings)

- F1:
  - `result-verification/value-readings/settled-rows.ts` header: Core settles only left-out rows.
  - `result-verification/contracts/run-result-summary.ts:148-156`: `result.unasked_change` is "information for the
    judge ... never a verdict".
  - `verify.ts:264-279` and `ask-again.ts:59-72`: the second-ask rules.
- F2: not checked in source. It rests on the debug notes, and its decisive chains were inferred there (stated in the plan).
- F3: `project-reset.ts:136-141`, `witness.ts:24-29` and `no-progress.ts:30-47,177-181`, as above.
- F4: `service/runtime-session/interruption-handler.ts:35-50` (`LAYER_FACT = "dialog"`), and the `clearsInterference`
  grep in both repositories.
- F6: `llm/evidence-loop.ts:748` returns `failure(..., "llm_evidence_loop.unknown_tool", ...)` while other unusable
  decisions are refused (`:735-738`).
- Also checked:
  - `executor/target-reacquire/before-attempt.ts`: re-acquire runs before attempt 4 (F9).
  - `executor/node-execution/cleared-layer.ts:13`: the layer kinds (F10).
  - `flow-bootstrap/trial-change/proof.ts:15-30`: `unproven` is never a grounded no (P2's premise).

## Commands run and observed results

- `cat`/`sed` reads of all 11 reports, the protocol sections (header block, section order, pairing) and both existing documents.
- Source reads listed above via `sed -n`. Greps: `clearsInterference` (no hit downstream; 4 files in Core src);
  `web\.(dom|browser)` count gave 56.
- `ls` of the test folders, to place the proposed tests beside their subjects (`site-reset/tests`, `llm/tests`,
  `result-verification/tests`, `contracts/.../process/tests` exist). Read the narrow test conventions in
  `!FluxIQWebExtension/docs/architecture/repository-layout.md:630-648`.
- `git status --short` in both repositories: only the untracked plan files and directories, plus a pre-existing
  `M .clinerules/fluxiq.md` downstream that this worker did not touch.
- No builds, tests, model calls or Lab runs.

## Not verified

- Every effect estimate is one-run arithmetic (fhl-step-workload) or a reading of the debug notes. None was measured or
  prototyped. The combined estimate (~48 calls, ~$0.030, ~100 s of model time, ~480 s window) assumes the remaining
  calls decide as they did and that the builder is first-time good once the door is honest.
- F2's decisive chains (mvrj-a44a place tokens, mvrj-b6dc 3-against-2 removals) are inferred in the notes, with no
  ledger trace.
- Why yes-pairs 230/231 and 249/250 were byte-identical (`exclusionEvidenceMissing`, or `confirmAnswer` off for those
  checks).
- Whether a yes can complete an `unproven` part (P2 precondition). Whether `read-number.ts` keeps a minus sign. Whether
  the web domain fills `values`/`differs` for non-list regions.
- Exact test file names and the narrow Core test command (`npx vitest run` from `packages/fluxiq`) follow the t244
  ledger convention. The command was not run.
- The location of the Lab's `performance.budget` relabelling (W0) was not found; only `candidate-outcome.ts` and
  `evaluation.ts` were located.

## Open questions or contradictions found

- Both documents' `Status detail` lines still say the audit or synthesis is pending. The brief said to keep the header
  blocks as they are, so the lead should update them when it records the ledger entry.
- The owning document is 781 lines, near the 800-line compaction threshold. The first ledger entries may trigger compaction.
- The rest are in the plan's Open Questions (9 in Core, 7 in the web document), each with an owner.
