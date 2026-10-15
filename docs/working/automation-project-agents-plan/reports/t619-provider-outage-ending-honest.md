# t619 provider-outage-ending-honest: worker report

## Outcome

Done. When a candidate build or a project build stops because the AI model provider kept not answering, it now ends under its own code, `flow_bootstrap.provider_unavailable`. The message is Core's own wording: the provider did not answer (or could not be reached), nothing was built, the instruction is kept, and the person can try again later. Both modes reach this through one shared classification, with no separate branch for each mode. A reply that did arrive and ended a project build without a Flow still ends `flow_bootstrap.post_provider_validation_failed`, as before.

## What changed and why

### Root cause, traced

1. The evidence loop worked as designed. Three unanswered decisions in a row ended it as `llm_evidence_loop.provider_unavailable` (`llm/unanswered-calls.ts`, `llm/evidence-loop.ts`), and the canary's step log matches this: three `decide` errors, each `llm.provider_timeout`.
2. In project mode the supervisor loop (`project-agents/supervisor/supervisor-loop.ts`) records this as a `blocked` ending and returns `outcome.loop` as not ok. `service/project-build/run.ts` then calls `draft.ending(...)`, which returns `undefined` here, falls through to `flowBootstrapEvidenceLoopFailure(outcome.loop, spent)`, and passes the result through `toldEnding`. Candidate mode reaches the same function from `service/flow-bootstrap-commands/candidate-generation.ts:171`.
3. `flowBootstrapEvidenceLoopFailure` (`flow-bootstrap/generation-failure/evidence-failure.ts`) mapped `llm_evidence_loop.provider_unavailable` to `flow_bootstrap.provider_timeout`, but stamped it with stage `provider_output_validation`. That code belongs to the `provider_request` stage, so `parseAutomationStudioFlowBootstrapGenerationError` returns `null` for it (`diagnostic-parse.ts:33-34`). The service's outer catch (`generation-catch.ts`) then replaced it with the current stage's own code, `flow_bootstrap.post_provider_validation_failed`, which is the code the canary recorded (`core.log`: `build throw ... code=flow_bootstrap.post_provider_validation_failed`).
4. That diagnostic carried no `ending`, so two false messages followed:
   - `toldEnding` showed the row "The supervisor ended the build: it could not finish the Flow."
   - The chat's stage wording for that code (`conversations/commands/progress.ts`, `STAGE_WORDS.post_provider_validation`) said "what the model wrote could not be used".

Candidate mode had the same defect: the same function produced the same unparseable pair. Only the legacy round, through `unfinished-build/phases.ts`, already ended `provider_unavailable` correctly.

### Changes (Core worktree `fxwork/t619/!FluxIQ`, under `packages/fluxiq/src/programs/automation-studio/runtime/`)

- **`flow-bootstrap/generation-failure/loop-provider-unavailable.ts` (new).** `flowBootstrapLoopProviderUnavailableEnding(result, page)` builds the `provider_unavailable` build ending from the loop's result.
  - **Opening:** "The build stopped because the AI model provider did not answer: N requests in a row got no answer -- <Core's clause for the code>." For `llm.provider_network_error` it says "could not be reached" instead.
  - **Next:** "Nothing was built: no Flow was created or changed", followed by a statement about the page.
  - **Close:** "What the Flow should do is kept, so you can try again later, once the provider is answering."
  - **The `page` parameter:**
    - `count` (the default) counts the loop's own `tool_call` rows with `effectApplied` (a candidate loop acts on the target itself).
    - `said_by_caller` leaves the page out, because a project build's builders acted, not the supervisor's loop.
  - **Sources of the wording:** only Core's words and the closed clauses in `llm/unanswered-calls.ts`. The provider's own message is never used.
  - **Without a summary:** if the result carries no `providerUnavailable` summary, the unbroken run is read from the trace.
  - **Imports:** types only, so the module stays off the `loop-limits` cycle.
- **`flow-bootstrap/generation-failure/evidence-failure.ts`.** `flowBootstrapEvidenceLoopFailure` takes a new optional fourth parameter, `page`. For `llm_evidence_loop.provider_unavailable` it now returns `flowBootstrapBuildEndingFailure(ending, ...)`, with code `flow_bootstrap.provider_unavailable`, `retryable: true` and `issueCodes` set to the run's provider codes. The table entry for that loop code now names `flow_bootstrap.provider_unavailable` instead of `provider_timeout`, with a comment saying why. Every other loop code is unchanged.
- **`flow-bootstrap/generation-failure/index.ts`.** The barrel exports the new module.
- **`service/project-build/run.ts`.**
  - It passes `"said_by_caller"` to the shared classification.
  - In `toldEnding`, a `provider_unavailable` ending with no left-on-target note gets `NOTHING_LEFT` ("Nothing this build did is still on the target.") appended. When there is a note, the note is appended through the existing `fitted` path.
  - Because the diagnostic now carries an ending, the "The supervisor ended the build" row is no longer emitted.
  - A header paragraph records t619.
- **Unchanged:** candidate mode needed no code change; it reaches the fix through the same function. Model-facing text is untouched. The builder-return reason the supervisor reads (`project-agents/dispatch/ending.ts`) and the supervisor's system text are not changed.

### Tests

- **`flow-bootstrap/generation-failure/tests/loop-provider-unavailable.test.ts` (new, 3 tests).** Each test calls the classification directly and checks:
  - The diagnostic parses back as written, with the expected code, retryable flag, issue codes, ending and `tried` values, and the exact message.
  - The page modes: the loop's acts are counted, or the page is left to the caller.
  - The "could not be reached" wording, and the fallback that reads the run from the trace.
- **`service/tests/provider-unavailable-authoring-modes.test.ts` (new, 5 tests).** These go through the real `generateFlowBootstrapAdaptation` with a stub provider:
  - For each mode (`describe.each` over `candidate` and `project`), every call times out. The build ends after 3 requests with `flow_bootstrap.provider_unavailable`. The message opens with the provider wording and does not contain "what the model wrote". No activity says "The supervisor ended the build", and the provider's own words never appear in activity or the chat cause. The final activity row is "Build stopped: the AI model provider is not responding", with the message as its text. The chat cause (`automationStudioConversationCallCause`) is "the build could not finish. <message>". The page sentence is "nothing on the page was changed" for the candidate build and "Nothing this build did is still on the target." for the project build.
  - For each mode, every call fails with `llm.provider_network_error`, and the message says "could not be reached".
  - In project mode, the supervisor's replies arrive (plan, dispatch, then an honest `blocked` completion). The build keeps `flow_bootstrap.post_provider_validation_failed` with `issueCodes: ["project.build_blocked"]` and no ending, still shows the supervisor-ending row, and the chat says "the supervisor ended it because it could not finish the Flow".

## Commands run and observed results

All of these ran in `C:/Users/osrs_/FluxStuff/fxwork/t619/!FluxIQ/packages/fluxiq`, except the structure audit, which ran from the repo root.

- `npx vitest run .../flow-bootstrap/generation-failure`: 11 files, 353 tests passed.
- `npx vitest run .../service/project-build .../conversations .../tests/service-bootstrap/tests/provider-unavailable .../flow-bootstrap/incomplete-draft .../service/flow-bootstrap-commands`: 58 of 65 files passed.
  - 6 files failed with `[vitest-worker]: Timeout calling "fetch"` while `tsc` ran at the same time, and `execute.test.ts` failed 3 tests with "Test timed out in 15000ms".
  - Rerun alone, `npx vitest run .../service/project-build .../conversations/commands/tests/extension-chat.test.ts .../conversations/commands/tests/execute.test.ts` passed: 16 files, 118 tests.
- After moving the new service test and breaking the cycle: `npx vitest run .../service/tests .../flow-bootstrap/generation-failure .../tests/service-bootstrap/tests/provider-unavailable.test.ts .../flow-bootstrap/incomplete-draft` passed 20 files, with 431 tests passed and 1 skipped (the skip is pre-existing in `bootstrap-adaptations.test.ts`). The new mode file passed 5 of 5 in about 27 s; the two network-error cases take about 13 s each because of the harness's retry waits. The legacy `provider-unavailable.test.ts` passed 3 of 3, unchanged.
- `npx tsc --noEmit -p .` gave exit 0 with no output, on the final tree.
- `node scripts/structure-audit.mjs` printed "structure-audit: passed (362 warning(s), 1156 baselined)" on the final tree. An earlier run failed, for three reasons I then fixed:
  - **Import cycles:** importing a value from `build-ending.ts` put the new module on the `loop-limits` cycle and raised the baselined counts for `evidence-failure.ts` and `index.ts`. I fixed this with type-only imports.
  - **Directory file limit:** `tests/service-bootstrap/tests/` went over its 25-file limit. I moved the test to `service/tests/`.
  - **Barrel import:** the test imported `progress.ts` directly instead of through the barrel. It now imports from `conversations/commands/index.ts`.

## Not verified

- No live run and no provider probe, as the brief says.
- Builders were not exercised with an unanswering provider in the middle of a build, that is, a supervisor that answers and then goes silent after a builder has acted. In that case:
  - A builder's own `provider_unavailable` comes back to the supervisor as a builder return, through `dispatch/ending.ts` (model-facing text, unchanged).
  - The person's ending comes from the supervisor's loop, through the same classification.
  - The page sentence then comes from the project ledger's left-on-target note. The note path through `fitted` already exists and is covered by the t590 tests, not by a new test here.
- The full `pnpm check`/`pnpm test` suites were not run (the twice-a-day rule).

## Open questions or contradictions found

1. **Supervisor's recorded reason.** It still says "The supervisor stopped before a whole trial passed (llm_evidence_loop.provider_unavailable)." in the build record (`supervisor-loop.ts`, the `finished` fallback). That text is never shown to the person (`toldEnding` uses Core's words, never the recorded reason), but a record reader sees "supervisor stopped". Fixing it means editing `supervisor-loop.ts`, which t616's clock code also touches, so I left it alone to avoid a merge conflict.
2. **Reset brief on a provider stop.** The supervisor loop still runs `resetBeforeEnding` on a provider stop when an undoable act exists. That reset is a builder, which will call the same unanswering provider and add up to three more deadline waits before the build ends. It is safe because it puts the target back, but slow during an outage. Skipping or bounding it is a decision for the supervisor, not made here.
3. **Diagnostic fields for `flow_bootstrap.provider_unavailable`.** It still publishes `providerResponse: "received"` and stage `provider_output_validation`, as the legacy ending always has. The failure-state table requires this for every post-request stage, so a field-level reader sees "received" for a build that received nothing. Changing the table is a cross-cutting taxonomy decision, left as it is.
4. **Duplicated "instruction kept" wording.** The chat's create-here "left" sentence already says "The Flow "X" ... keeps your instruction, so you can build it again." The new ending also says "What the Flow should do is kept", because the brief asks for it, so the person reads it twice in that command. If that is unwanted, drop the clause from the Core message or from the left sentence for this ending.

## Follow-up (coordinator, same worktree): open questions 3 and 4

### Outcome

Done. Open question 3 is fixed: a build whose calls all failed before any reply arrived now records `providerResponse: "not_received"` instead of `"received"`. Open question 4 is fixed: "automate this" says the instruction is kept once after this ending, not twice. Questions 1 and 2 (the recorded reason, and the reset brief during an outage) are left for the coordinator to brief after t616, because both live in `supervisor-loop.ts`.

### What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

**(a) `providerResponse`.**
- **Where it was set:** `flowBootstrapBuildEndingFailure` (`flow-bootstrap/generation-failure/evidence-failure.ts`) hard-coded `"received"`. The failure-state table (`failure-state.ts`) also forced `"received"` for every code past the request stage, and the parser rejected anything else.
- `llm/unanswered-calls.ts`: the loop's provider-unavailable summary gains `replied: boolean`, which is true once any decision call of the loop got a reply, whatever the reply said.
- `flow-bootstrap/generation-failure/provider-reply-arrived.ts` (new): `flowBootstrapProviderReplyArrived` returns true when any of these hold:
  - the loop replied, or did not say whether it did;
  - the build ran more than one round;
  - the build's accounting holds reported tokens (the instruction reading, a judge, a builder).
- `failure-state.ts`: the state gains `acceptedProviderResponses`. Only `flow_bootstrap.provider_unavailable` may say `["received", "not_received"]`; every other code keeps exactly its one value.
- `diagnostic-parse.ts`: the parser checks `providerResponse` against that list.
- `evidence-failure.ts`: `flowBootstrapBuildEndingFailure` writes `not_received` for a `provider_unavailable` ending when no reply arrived. It reads the stopped loop's summary from `progress.providerUnavailable`.
- **One classification for every mode:**
  - candidate and project modes pass the loop result, which already carries the summary;
  - the legacy round now passes the summary through `unfinished-build/phases.ts` (a new `providerUnavailable` field on the `unfinished` outcome) and `service/flow-bootstrap-commands/built-loop.ts`;
  - `loop-provider-unavailable.ts`'s trace fallback sets `replied` when the trace holds rows before the run.
- `providerInvocation` stays `"attempted"`.

**(b) Instruction kept said once.**
- `conversations/commands/build.ts`: a failed build now carries `endingKind`, the diagnostic ending's closed `kind`.
- `conversations/commands/create-here.ts`: for an ending in `ENDINGS_SAYING_INSTRUCTION_KEPT` (only `provider_unavailable`), the closing sentence is just `The Flow "<name>" has no steps yet.`, or the candidate's kept-draft sentence. It drops "keeps your instruction, so you can build it again". Every other ending is unchanged.
- `flow-bootstrap/unfinished-build/provider-unavailable.ts`: the legacy round's provider ending used to close "Try again once the provider is answering." It now closes with the same words as the loop ending ("What the Flow should do is kept, so you can try again later, once the provider is answering."), so the chat may leave the instruction out after any ending of this kind.

**Tests.**
- `flow-bootstrap/generation-failure/tests/loop-provider-unavailable.test.ts`, +2 tests:
  - `not_received` when nothing arrived, and `received` when the loop acted, when the accounting holds tokens, or when the loop gave no summary; each round-trips through the parser.
  - The parser accepts `not_received` past the request stage for this code alone, and rejects it for `evidence_iteration_limit`.
- `service/tests/provider-unavailable-authoring-modes.test.ts`:
  - The whole ending message is pinned per mode (`SILENT_ENDING`), along with `providerResponse: "not_received"` and `providerInvocation: "attempted"`.
  - New, per mode: when one reply arrives and then every call times out, the diagnostic says `received`.
- `conversations/commands/tests/provider-unavailable-ending.test.ts` (new, 4 tests): for each mode, the create-here answer is pinned whole. It is Core's ending, then `The Flow "Hubs" has no steps yet.`, with "kept" appearing once and no "keeps your instruction". After an ending that does not say the instruction is kept, the old sentence still appears.
- `tests/service-bootstrap/tests/provider-unavailable.test.ts` (legacy round): the expected closing words are updated, and it now asserts `providerResponse` is `not_received` when nothing arrived and `received` after a reply.

### Commands run and observed results

All in `fxwork/t619/!FluxIQ/packages/fluxiq`. Each vitest set ran with nothing else running beside it.

- `npx vitest run` over `flow-bootstrap/generation-failure`, `flow-bootstrap/unfinished-build`, `llm/evidence-loop`, `service/tests`, `service/flow-bootstrap-commands`, `flow-bootstrap/incomplete-draft` and `tests/service-bootstrap`: 117 test files passed; 1234 tests passed, 1 skipped (a skip that already existed).
- `npx vitest run` over `service/project-build` and `conversations`: 38 files and 290 tests passed.
- `npx tsc --noEmit -p .`: exit 0, no output.
- `node scripts/structure-audit.mjs` (repo root): the first run found 1 statement-packing violation in the new conversations test (line 63). I unpacked the line; the rerun printed "structure-audit: passed (362 warning(s), 1156 baselined)", and the test rerun passed 4/4.

### Not verified

- No live run and no provider probe.
- The reply check reads reported tokens. A call whose reply arrived with no usage, outside the stopped loop's own decisions, would not count as a reply. No such call ran before a supervisor's first decision in the tests.
- Readers outside Core (the extension, the Lab) that compare `providerResponse` to `"received"` for this code were not checked.

### Open questions

1. In project mode the page note ("Nothing this build did is still on the target.") follows the "try again later" sentence, because `run.ts` appends it after the ending. Putting it before that sentence would need the note passed into the ending builder.
