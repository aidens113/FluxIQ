# t645 plan-keeps-request-and-output-advice: worker report

Branch `task/t645-plan-keeps-request-and-output-advice`, Core worktree `fxwork/t645/!FluxIQ`. Source: debug
`a8-bigbox-cart-run-mv9zn5ob-debug.md`, sections 1-3 and 5, fixes 1-3 (plus the `extraction.*` refusal part of fix 5),
and the coordinator's mid-task addition (t647 `coreFindings` in the return reason). Nothing committed.

## Outcome

Done. Every check the brief names ran and passed. No live run.

## What changed and why

Paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

1. **An amendment may not drop the person's request (fix 1).**
   - `project-agents/contracts/task-spec.ts`: new `droppedIssues(current, next, sources)`. It places each part's quote
     the way `quoteIssues` does. For each span the plan in force quotes, it finds the characters that no part of the
     amendment quotes. It refuses `project.plan_part_dropped` (path `taskSpec.parts`, with `part` and `dropped`, the
     lost words) when either of these is true:
     - none of the part's words is still quoted, or
     - one uncovered stretch is longer than `EDGE_WORDS = 2` words.
     That 2-word allowance matches the rewording that `supervisor/state.ts` already keeps across amendments, and it
     lets a re-split drop a joining word like "and". A `notAsked` item the amendment **adds** (one the plan in force
     did not list) whose words contain, or are contained in, a current part's words is refused under the same code at
     `taskSpec.notAsked.N`. The match is word-normalised. Parts whose instruction is no longer active are not measured.
   - `supervisor/plan-input.ts`: takes an optional `current` spec, runs `droppedIssues` alongside the other checks, and
     adds `part` and `dropped` to the issue type. `supervisor/plan-tool.ts` passes `state.taskSpec` on `amend` only.
     `worded()` now carries `part` and `dropped` beside `why`.
   - `supervisor/guidance.ts`: adds `planIssues["project.plan_part_dropped"]` (cannot be overridden; to give up a
     part, end honestly with `ended (partial or blocked)`) and one sentence in the `amend_plan` tool description.
2. **An output the subflow cannot make is the plan's to change (fix 2).**
   - `project-agents/dispatch/ending.ts`: when the last refused submission's issues carry
     `subflow.output_not_a_value` or `subflow.output_unknown_port` at `flow.output.<id>`, and `<id>` is one of the
     brief's interface outputs, the reason says `<code>: output "<id>"` and ends with this advice: drop the value and
     keep the later subflow after this one, otherwise send a changed brief saying where on the target the value is
     read. The new `outputStopped(output, codes)` gives the reason Core uses when it stops a brief itself.
   - New `project-agents/dispatch/output-refusals.ts` (`AutomationStudioProjectDispatchOutputRefusals`) watches the
     submit tool's answers. It reads each binding from the script's `output: <name> = <binding>` line, falling back to
     the issue message. Once one output has been refused under 2 different bindings, it aborts its own ending signal,
     joined with the ports' `ended`, which keeps priority. The brief then ends `blocked` with `outputStopped`'s
     reason before the next turn. `marked()` sets `unmadeOutput` on any return that is not done when the latest
     submission was refused on an output.
   - `dispatch/run-brief.ts` wires this in: `observe`, `untilEnded`, and every builder return, including the thrown
     path.
   - `contracts/builder-return.ts`: new optional `unmadeOutput` field, accepted by `read`. `issues` refuses it on a
     `done` return or when it names no output of the brief's interface (`project.return_unmade_output`).
3. **The supervisor's next step names both ends (fix 3).** `supervisor/dispatch-tool.ts`: a new `unmadeOutputNext`
   fills `GUIDANCE.next.afterOutputUnmade` (or `afterOutputUnmadeUntaken` when no other subflow takes the value) from
   the plan in force with the consumer subflows, the value and the producer. `compact` shows `unmadeOutput` on the
   return.
   - I first wrote this as `supervisor/unmade-output.ts`, but it took `supervisor/` to 26 source files and the
     structure audit failed (25-file limit), so I moved it into `dispatch-tool.ts` (now 437+ lines, advisory only).
4. **`extraction.*` handle refusal (part of fix 5).** `flow-bootstrap/plan/issue-feedback.ts`: a `*.handle.unknown`
   issue whose handles include `extraction.N` gets `from`, a fixed sentence saying such a handle exists only once the
   repeating structure has been detected from one of its items. It names no domain tool. I restored the file's CRLF
   line endings after the edit.
5. **Coordinator addition, t647 `coreFindings`.** In `dispatch/ending.ts`, `trialSaid` now adds
   ` Core found (<code>): <said>` for each `feedback.coreFindings[]` entry that has a sayable code and a `said`. It
   reads the key structurally (no t647 types), keeps at most 3 findings and clips each to 400 characters, on every
   path that is not a yes (entry not prepared, failed step, judge, bare).
6. **Words for new codes.** `activity/wording/issue-words.ts` is unchanged. Neither new code is a step issue of a
   refused Flow: `project.plan_part_dropped` is a supervisor plan refusal, worded in `GUIDANCE.planIssues`, and
   `project.return_unmade_output` is an internal contract check.

Tests (fixtures are a lending library and a garden-supplies catalogue, no Lab scenario words):

- `supervisor/tests/plan-part-dropped.test.ts` (new):
  - An amendment to p2 only, with p1's words in `notAsked`, is refused with the code, the part and the dropped words,
    twice: once at `taskSpec.parts` and once at `taskSpec.notAsked.1`.
  - A paraphrased `notAsked` item is refused only by the coverage check.
  - A `notAsked` item that contains or is contained in a part's words is refused; an unrelated one is accepted.
  - Re-splitting p1 into p1a and p1b is accepted, and so is joining p1 and p2 into one part.
  - A facts-only change is accepted, and so is losing one or two words at an edge; cutting 3 words is refused with
    `dropped: "Find the three"`.
  - The `project.amend_plan` answer carries the code, `part`, `dropped` and `why`.
- `supervisor/tests/amend-dispatch.test.ts`: the old "cut further" case cut 3 words and expected `ok: true`, which
  this task now refuses. It now re-splits those words into a part of their own, and still checks that the proposal
  is dropped with "its parts changed".
- `dispatch/tests/brief-return-reason.test.ts`: a stopped loop carrying `subflow.output_not_a_value` gives the exact
  reason with `output "bedName"` and the advice; an output outside the interface is neither named nor advised on; the
  exact `outputStopped` wording; a trial carrying a `coreFindings` entry is said verbatim after the judge or the
  failed step, and nothing is added without findings.
- `dispatch/tests/brief-loops.test.ts`: through the dispatcher, a recorded plan whose `open_packet` hands on
  `bedName` and a scripted builder submitting 3 bindings. Only 2 are sent; the return is `blocked` with
  `unmadeOutput: "bedName"`, carries the stop reason and advice, and is recorded unchanged.
- `supervisor/tests/unmade-output.test.ts` (new): a blocked producer whose return names `titles` gives `next`
  `"place_hold" takes "titles", which "find_titles" could not make ...` with the amend advice and no placeholder
  left. With no taker it gives the untaken words; a return blocked on anything else keeps `afterReturnsNotDone`.
- `flow-bootstrap/plan/tests/issue-feedback.test.ts`: `from` is present for an unknown `extraction.1`, and absent
  for an element handle and for a `stale` refusal.
- Fixture changes, test files only: `dispatch-fixture.ts` exports `gardenTaskSpec` and `gardenPlan`, and
  `supervisor-fixture.ts` gains an `unmadeOutput` option.

## Commands run and observed results

All were run from the t645 worktree.

| Command (cwd) | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` (packages/fluxiq), after the last source change | No output, exit 0 |
| `npx vitest run <R>/project-agents <R>/service/project-build <R>/flow-bootstrap/plan` (packages/fluxiq) | `Test Files 79 passed (79)`, `Tests 642 passed (642)` (final run, 106 s) |
| `node scripts/structure-audit.mjs` (repo root), first run | 2 violations: an `as never` in the brief-loops test, and `supervisor/` at 26 source files |
| `node scripts/structure-audit.mjs`, after both fixes | `structure-audit: passed (380 warning(s), 1156 baselined)` |

The audit's remaining warnings on files I touched are advisory line counts only: `ending.ts` 441, `run-brief.ts` 413
and `dispatch-tool.ts` 437 lines, against a 400-line threshold.

## Not verified

- No live or Lab run, so whether the model now takes the advice in a real build is unmeasured.
- The early stop is tested through the dispatcher with a scripted builder that calls the observed submit tool. The
  real subflow builder loop's own stop at its next turn after the abort is relied on, not exercised: that loop is
  already wrapped by `untilEnded`, so I expect the same behaviour.
- `coreFindings` is tested with the t647 shape copied from that branch, not with t647 merged.
- No full suite was run (by rule).

## Open questions or contradictions found

- **The rewording allowance changes an old behaviour.** An amendment that cuts more than 2 words from a part's end is
  now refused; before, it was accepted and only dropped that subflow's proposal. That is the brief's rule; I changed
  the one test that relied on the old behaviour (see Tests).
- **The `notAsked` check alone would not have caught the run.** The run's `notAsked` paraphrased the request ("the"
  where the person wrote "my"), so it did not match by containment. The coverage check is what refuses the run's
  amendment. Items the plan in force already listed are exempt, so an unchanged `notAsked` never blocks an amendment.
- **The early stop counts any two bindings.** A builder that legitimately reaches the right port on its third try
  would now be stopped first. The brief asked for exactly this rule.
- **`outputStopped`'s reason does not carry the last trial.** It is passed through `endedAs`, as the person-needed
  ending is, so it has no trial account. Nothing in the run needed one.
