# t653 judge-verdict-survives-a-loop: worker report

Brief: build fix 4 of the A8 towels debug (`a8-towels-run-mva6mlo8-debug.md`).
In live run `run-mva6mlo8-f519063c`, four of 21 judge calls looped inside
`summary` until the provider's 8,192-token output ceiling cut them off
(`llm.provider_output_truncated`), and each one was lost.

## Outcome

Done. 4a and 4b are both built and tested end to end through Core's DeepSeek
adapter. No limit was capped or lowered, and no provider was called.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

**4a: the verdict comes before the narration.**

- `llm/deepseek/output-schema.ts` gets a `loop_verification`-only schema,
  `VERIFICATION_OUTPUT_SCHEMA`.
  - Its members are the same, in a new order: `kind`, `diagnosis`,
    `confidence`, `summary`, `metadata`.
  - Its `required` list is `["kind", "diagnosis", "summary"]`.
  - Every other diagnosis kind keeps `DIAGNOSIS_OUTPUT_SCHEMA` unchanged.
  - Why this file: the brief pointed at `llm/harness/task-kind.ts` for the
    schema, but the schema lives here. `task-kind.ts` holds no schema.
- `llm/diagnosis-instructions.ts` gets a new
  `AUTOMATION_STUDIO_RESULT_VERIFICATION_ORDER_INSTRUCTION`.
  - Only `loop_verification` gets it, placed right after the "Put your reading
    of the failure in the diagnosis object" fields sentence and before "This
    call judges...".
  - It asks for `kind` first, then the closed diagnosis with `answersRequest`,
    then `summary` last. It asks for an order, not a length.

**4b: a cut reply is read for its verdict.**

- `llm/harness/task-kind.ts`: a new `AUTOMATION_STUDIO_LLM_VERDICT_BEFORE_CUT_SUMMARY`.
  - It is the summary a provider adapter gives a `loop_verification` reply that
    it read only up to its verdict.
  - It is Core's sentence, provider-neutral.
  - `llm/harness/index.ts` exports it (one line added to the barrel).
- New module `llm/deepseek/verdict-before-cut.ts`:
  `automationStudioDeepSeekVerdictBeforeCut(content)`.
  - It reads only top-level members that closed before the cut.
  - The member the cut fell inside is dropped, never completed.
  - A number at the end of the content is never trusted, because the cut may
    have shortened it.
  - It requires the reply to open with `{`, lead with `kind: "diagnosis"`, and
    hold a closed `diagnosis` whose `answersRequest` is yes, no or unknown.
  - It returns `{kind, summary: <Core's sentence>, confidence?, diagnosis}`. The
    model's summary is never carried, even one that closed whole.
- `llm/deepseek/response-envelope.ts`: on `finish_reason: length`, a
  `loop_verification` reply is read through the module above.
  - If that read finds no verdict, the reply is refused
    `llm.provider_output_truncated` exactly as before.
  - The read reply goes on to usage parsing and structure validation like any
    other reply, then through the harness's own validation.
- `result-verification/verify.ts` (`askOnce`): a reply whose summary is Core's
  sentence was cut after its verdict.
  - Its summary is never passed as `summaryText`.
  - The intervention metadata gets `truncatedAfterVerdict: true`.
  - A no or an unknown is taken as the answer it gave.
  - A yes is judged by `automationStudioResultVerdict` from the whole diagnosis
    fields alone. That covers the row-name checks, the quote checks and the
    kept-number check.
  - If that does not produce `answers`, the reply is unavailable:
    `model_unavailable` with failureCode `llm.provider_output_truncated`, and
    `temporary` is set, so the check is asked again as now. It never becomes a
    held yes or a refuted yes.
  - The header comment gains a t653 paragraph.

**Moved judge pins, named and updated deliberately.**

- `llm/deepseek/tests/system-prompt-pins.json`: only the `loop_verification`
  and `loop_verification_build_test` pins moved.
  - A script inserted exactly the new sentence after the anchor "...decided
    from." in each (14222 -> 14575 and 21458 -> 21811 characters).
  - `git diff` shows 2 changed lines. Every other pin is untouched.
- The `system-prompt.test.ts` header now records this re-pin.

**Tests.**

- `result-verification/tests/judge-reply/tests/truncated-reply.test.ts`
  (7 tests). It runs end to end: real `createAutomationStudioDeepSeekProvider`
  with a scripted fetch serving provider envelopes, then the harness, then
  `verifyAutomationStudioRunResult`. The fixture is the generic garden-tools
  catalogue in `request-rows/tests/request-words-fixture.ts`. The tests cover:
  - kind and diagnosis complete, then a looping summary: read and flagged. A
    no takes 2 calls, not 4.
  - The same for an unknown.
  - A yes whose quotes arrived whole in `diagnosis.observed`: taken on one call.
  - Cut inside the diagnosis: unavailable and asked again. The re-ask's answer
    stands; cut twice gives `model_unavailable` with
    `llm.provider_output_truncated`.
  - A yes whose required quotes sit in the cut summary: unavailable, asked
    again, and never `exclusionEvidenceMissing`.
  - A whole re-ask that then quotes: `answers`.
- `llm/deepseek/tests/verdict-before-cut.test.ts` (9 tests): the envelope
  read. It covers each verdict word, each place the cut can fall, a number the
  cut shortened, a summary that closed and is still dropped, the shape of live
  0054 (summary first) being refused, a missing verdict, a leading member that
  is not `kind`, a `runtime_diagnosis` still refused, and a reply that is not
  one object.
- `llm/deepseek/tests/output-schema.test.ts`: 3 new tests.
  - The verification's member order and `required` list.
  - Members equal to the plain diagnosis schema's.
  - `runtime_diagnosis` order unchanged.
  - The order sentence is present for verification only, placed between the
    fields sentence and the judge prose.

**Placement deviation.** The brief named
`result-verification/tests/truncated-reply.test.ts`. Adding it there made
`result-verification/tests/` hold 26 files, and the structure audit failed its
25-file limit. I followed the repository's own precedent,
`executor/tests/effect-check/tests/` and `llm/tests/decision-kind/tests/`, and
put it at `result-verification/tests/judge-reply/tests/truncated-reply.test.ts`.

## Commands run and observed results

All commands ran in the t653 Core worktree.

- `npx tsc --noEmit -p tsconfig.json` in `packages/fluxiq`: no output, exit 0.
  It ran after the final edits too.
- `npx vitest run runtime/llm/harness runtime/llm/deepseek runtime/result-verification runtime/llm/tests/diagnosis-channel.test.ts`:
  "Test Files 150 passed (150), Tests 1342 passed (1342)", 170 s. This ran
  with the test at its first location and before the cycle fix below.
- After the move and the cycle fix:
  - `npx vitest run runtime/llm/deepseek runtime/result-verification/tests/verify.test.ts runtime/result-verification/tests/judge-reply runtime/llm/tests/diagnosis-channel.test.ts`:
    "Test Files 17 passed (17), Tests 205 passed (205)".
  - `verdict-before-cut.test.ts` plus `judge-reply`: 16 of 16 passed.
- `node scripts/structure-audit.mjs` at the Core root.
  - First run: 3 violations.
    - Two import cycles: `verdict-before-cut.ts` imported the
      `../harness.ts` barrel, which pushed `response-envelope.ts` past its
      baseline of 4.
    - `result-verification/tests/` held 26 files.
  - Fixes: the module now imports the constant from `../harness/task-kind.ts`,
    and the test moved as described above.
  - Final run: "structure-audit: passed (382 warning(s), 1156 baselined)",
    exit 0. No warning names a file I touched.
- Mutation check: I set `unreadYes = false` in `verify.ts`. "does not take a
  yes whose required quotes sit in the cut summary" then failed, and 6 of 7
  still passed. I restored the file from a backup and grep confirmed the
  restore.

## Not verified

- **No live run and no provider call** (brief rule). Whether DeepSeek flash
  follows the new member order, and how often a looping judge now closes its
  diagnosis before the loop starts, is unmeasured.
  - Note that the 0054 reply's loop sat in the summary. The model can also
    loop inside `diagnosis.observed`. Such a cut is unavailable and asked
    again, as now.
- **The intervention's own stored record.** I did not check how
  `interventionFromLlmResult` stores a cut-after-verdict call. It is recorded
  as a successful call whose summary is Core's sentence. I did not check what
  the step log or the Lab's judge-step reader shows for it. The raw
  `response.txt` is still written by the adapter's step hook before parsing.
- **The full `pnpm`/Core suites.** Not run, per the twice-a-day rule.

## Open questions or contradictions found

- **Where the flag lives.** The brief says to "mark the result
  `truncatedAfterVerdict`". The verification contract
  (`result-verification/contracts/verification.ts`) is outside my ownership
  (t652, t654), so the flag is on each call's intervention metadata
  (`truncatedAfterVerdict: true`). If the outcome itself should carry it, a
  contracts owner adds an optional field and `verify.ts` passes it through.
- **Why a sentinel summary.** The harness strips every response field except
  `kind`, `summary`, `confidence` and `diagnosis`
  (`harness/structured-response.ts`, `stripAutomationStudioLlmResponseMetadata`).
  Provider diagnostics also lose their codes (`harness/provider-result.ts`).
  So a success-path flag could not reach `verify.ts` without editing harness
  files I do not own; Core's summary sentence is the channel.
  - A model that wrote that exact sentence itself would only make its yes
    stricter: the summary is not read, and a yes not taken becomes
    unavailable.
  - A typed `cutAfterVerdict` field on the diagnosis response is the cleaner
    long-term seam, if wanted. It would touch `harness/structured-response.ts`
    and `harness/provider-result.ts`.
- **Prompt version.** I did not bump `automation-studio.loop-verification.v1`.
  Other tests pin that string, and the brief did not ask for it. The prompt
  text changed, so the supervisor may want v2.
- **A cut yes refused only on Core's kept-number check.** That check reads no
  reply text, but I still treat such a yes as unavailable and ask again rather
  than refusing it as a no. This is conservative: it costs at most one extra
  ask and never weakens a yes.
- **Test import order matters.** `truncated-reply.test.ts` must import
  `verify.ts` before the DeepSeek barrel. The other order evaluates
  `llm/index.ts` mid-cycle, and `runAutomationStudioLlmHarness` reads as
  undefined. The 109-module cycle that causes it already existed; my change
  did not add to it, and the audit baseline is unchanged.

## Round 2

Asked by the coordinator:

1. Replace the summary-sentence channel with a typed field. Keep the
   intervention flag.
2. Bump the loop-verification prompt version and update every test that pins
   it.

This supersedes round 1's "Where the flag lives" and "Why a sentinel summary"
notes. The prompt version is now bumped.

### What changed

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

**The typed field.**

- `llm/harness/structured-response.ts`: the diagnosis response type gains
  `truncatedAfterVerdict?: true`, documented as set by an adapter, never by a
  model.
  - `stripAutomationStudioLlmResponseMetadata` carries it, exactly `true`.
  - `summarizeAutomationStudioLlmResponse` adds it to the call's response
    summary.
- `llm/harness/provider-result.ts`: `truncatedAfterVerdict` is an allowed field
  of a diagnosis.
  - Any value but `true` is refused as
    `llm_output.invalid_truncated_after_verdict`.
- `llm/deepseek/verdict-before-cut.ts`: the cut read now sets
  `truncatedAfterVerdict: true`.
  - The plain sentence that stands in for the cut summary is now a private
    constant here. It is for readers only and nothing decides on it.
- `llm/deepseek/response-envelope.ts`: on a whole reply (not cut), a
  model-written `truncatedAfterVerdict` is dropped. Only the cut path may carry
  the field.
- `result-verification/verify.ts`: `truncatedAfterVerdict` now comes from
  `response?.truncatedAfterVerdict === true`, never from the summary text. The
  intervention metadata flag `truncatedAfterVerdict: true` is kept. The header
  paragraph is reworded to match.
- `llm/harness/task-kind.ts` and `llm/harness/index.ts`: the round-1
  `AUTOMATION_STUDIO_LLM_VERDICT_BEFORE_CUT_SUMMARY` export is removed.

**The version bump.** `llm/harness/task-kind.ts`: `loop_verification` is now
`"automation-studio.loop-verification.v2"`, with a comment naming t653. The
tests that pin the string, each changed only in that string (2 occurrences
per file):

- `llm/harness/tests/request-evidence-check.test.ts`
- `llm/tests/deepseek-evidence-preflight.test.ts`
- `result-verification/build-test/tests/change-lines.test.ts`
- `result-verification/build-test/tests/pass-lines.test.ts`
- `result-verification/build-test/tests/read-rows.test.ts`
- `result-verification/build-test/tests/stores.test.ts`
- `result-verification/build-test/tests/summary.test.ts`
- `llm/deepseek/tests/verdict-before-cut.test.ts` (my own new file)

The five `build-test/tests/` files fall under round 1's "Must not touch"
(t652, t654). I changed them only because the coordinator asked for every pin.
If t652 or t654 edits the same files, expect a one-line merge on each.
`git grep` finds no `loop-verification.v1` left in tracked source.

**Tests.**

- `llm/harness/tests/provider-result.test.ts`: 2 new tests.
  - The strip carries `true` and adds nothing when the field is absent.
  - `false`, `"true"`, `1` and `null` are each refused with the new code.
- `llm/deepseek/tests/verdict-before-cut.test.ts`:
  - The cut read now expects `truncatedAfterVerdict: true` and a Core summary
    that holds none of the loop.
  - New: a whole reply that claims the mark is read with the claim dropped.
- `result-verification/tests/judge-reply/tests/truncated-reply.test.ts`: 2 new
  end-to-end tests.
  - A whole reply whose summary is word for word the adapter's sentence is
    judged whole. Its bare yes is held and rechecked as normal, where the
    round-1 sentinel would have made it unavailable.
  - A whole reply that claims `truncatedAfterVerdict: true` itself is judged
    whole, with no intervention flag.

**Line endings.** The working copies of these files are CRLF. My scripted
edits had left 12 LF lines in `structured-response.ts`, and sed had rewritten
the 7 tracked version-bump files to LF. I restored all of them to CRLF and
re-counted: no lone LF remains in a CRLF file. The new files are LF; with
`core.autocrlf=true`, git normalises them on add.

### Commands run and observed results (round 2)

- `npx tsc --noEmit -p tsconfig.json` in `packages/fluxiq`: no output, exit 0.
- `npx vitest run runtime/llm/harness runtime/llm/deepseek runtime/result-verification runtime/llm/tests/diagnosis-channel.test.ts runtime/llm/tests/deepseek-evidence-preflight.test.ts`:
  "Test Files 151 passed (151), Tests 1363 passed (1363)", 122 s.
  - This set covers every test file whose version string changed.
- Mutation checks. Each file was restored from a backup taken before the
  mutation, and grep confirmed each restore.
  - The strip dropping the flag: 5 of 11 failed in `judge-reply` plus
    `provider-result.test.ts`.
  - The envelope keeping a model's own claim: 2 of 19 failed, namely "is read
    as the whole reply it is, its claim dropped" and "is not a model's own
    claim".
- `node scripts/structure-audit.mjs`: "structure-audit: passed (382
  warning(s), 1156 baselined)", exit 0. Round 1 had the same counts.
  - It warns on `structured-response.ts` (422 lines, 15 exported values) and
    `provider-result.ts` (603 lines). Both files were past the 400-line advisory
    before my edits (410 and 601 lines).

### Not verified (round 2)

- **The full suites.** Not run, per the twice-a-day rule.
- **Readers of the new response-summary key.** I did not check whether any
  consumer of `summarizeAutomationStudioLlmResponse` output, such as a step log
  or the Lab reader, enumerates its keys.
- **`dist/`.** The untracked build output still holds `v1` until a rebuild.
