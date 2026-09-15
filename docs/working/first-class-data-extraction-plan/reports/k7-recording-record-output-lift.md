# k7-recording-record-output-lift: mapper candidate `recordOutput` and `timeoutMs` lift and approval write

## Outcome

**Done.**

A recording mapper may now propose two more things on a candidate: `recordOutput`,
the records its output returns to save as a dataset, and `timeoutMs`, the time the
recorded action is given. Both are lifted onto the proposal's candidate, written
into the approved Flow node's `parameterValues`, carried into an approved node
definition's metadata, and put back on the node when that definition is
materialized into `builtin.policy.action`.

CD19's resolution order holds: a candidate's own `recordsPath` wins; otherwise the
domain output definition's `metadata.recordsPath` is used; with neither, the
candidate is rejected. Core never assumes a path. Unlike `expectedState`, an
invalid value is never dropped quietly — it rejects the candidate by throwing,
which the service reports as a mapping issue for that entry.

- **Acceptance** (`.../service/recordings/tests`): `Test Files 2 passed (2)`,
  `Tests 39 passed (39)`, exit 0. Run twice: after implementing, and again last.
- **Type check** (`pnpm --filter fluxiq check`): exit 0, no diagnostics.
- **Structure audit:** one failure, `docs/working/README.md`, a shared document this
  brief does not own. No audit line names a file I touched.
- **Mutations:** 18, each observed red, applied by a load-time transform, so no
  source file was changed on disk.

## What changed and why

Paths are relative to `packages/fluxiq/src/programs/automation-studio/`.

### `nodes/importer-sdk.ts`

- `AutomationStudioRecordingMapperCandidate` gains
  `recordOutput?: Omit<AutomationStudioRecordOutput, "recordsPath"> & { recordsPath?: string }`
  and `timeoutMs?: number`, with the contracts type imported as a type-only import
  (`nodes/policy/action.ts` already imports from `@fluxiq/contracts/automation-studio`,
  so the subpath is established for this area).
- The doc comments say what Core does with each: `recordsPath` may be left out when
  the output declares one, `null` proposes no record output, and an invalid value or
  an `encrypt` field rejects the candidate.
- This is the only file of mine under `nodes/`, where other workers were mid-edit. The
  change is two added properties and one import; nothing else in the file was touched.

### `runtime/recording-flow-proposal.ts`

- `RecordingFlowActionCandidate` gains `recordOutput?: AutomationStudioRecordOutput`
  (the parsed value, its path resolved) and `timeoutMs?: number`.
- The `recordOutput` comment states the contrast the report asked for: carried into
  node definitions, unlike `expectedState`, because without it a definition's run
  would hand the fields the schema excludes to the node's outputs.

### `runtime/service/recordings/proposal-candidates.ts`

- `recordingFlowActionCandidate` computes
  `liftedRecordOutput(io, input.domainId, outputId, input.candidate.recordOutput)` and
  `liftedTimeoutMs(outputId, input.candidate.timeoutMs)` after `liftedExpectedState`,
  and adds `...(recordOutput ? { recordOutput } : {})` and
  `...(timeoutMs !== undefined ? { timeoutMs } : {})` to the returned candidate.
- **`liftedRecordOutput`.** `undefined` and `null` mean none (the policy action's
  presence rule from K3). Anything else is `structuredClone`d first, so the parser
  reads a value the mapper can no longer change; a value that cannot be cloned throws
  with `record_output.invalid`. The clone is then parsed with K1's
  `parseAutomationStudioRecordOutput`, with no `allowEncrypt`, so a field with
  `handling: "encrypt"` is refused (CD13). A parse failure throws
  `Recording mapper candidate for ${outputId} has an invalid recordOutput: ${issues}`.
- **`withOutputRecordsPath`.** Only a plain object (prototype `Object.prototype`) that
  names no `recordsPath` takes the output's `definition.metadata.recordsPath`, and only
  when that is a string. Anything else passes through unchanged, so an array, a `Date`,
  or a string still fails as what it is rather than as a missing path.
- **`liftedTimeoutMs`.** Absent is absent. Any present value that is not a safe integer
  above zero throws
  `Recording mapper candidate for ${outputId} has an invalid timeoutMs: it must be a whole number of milliseconds above zero.`
  Rejecting rather than dropping is deliberate: a dropped timeout would leave the
  recorded action on the policy action's 5,000 ms default, the exact defect downstream
  correction 2 (D14) raised.
- **`appendRecordingProposalToFlow`** writes
  `recordOutput: candidate.recordOutput ? structuredClone(candidate.recordOutput) : undefined`
  and `timeoutMs: candidate.timeoutMs` into the node's `parameterValues`.
  `compactJsonObject` drops the `undefined`s, so a candidate with neither writes neither
  key and its node is unchanged from before.

### `runtime/service/recordings/candidate-definitions.ts`

- `recordingCandidateDefinition` metadata gains
  `...(candidate.recordOutput ? { recordOutput: structuredClone(...) } : {})` and
  `...(candidate.timeoutMs !== undefined ? { timeoutMs: candidate.timeoutMs } : {})`.
  The metadata object was reformatted across lines to stay readable; no existing key,
  value, or order changed. A candidate without these fields produces the same metadata
  as before.
- `materializeRecordingNode` adds `...(isJsonRecord(recordOutput) ? { recordOutput } : {})`
  and `...(typeof timeoutMs === "number" ? { timeoutMs } : {})` after the node's own
  parameter values, so the definition's values replace any the node holds, exactly as
  its `outputId` and `parameters` already do. A definition whose metadata holds a
  non-object `recordOutput` or a non-number `timeoutMs` contributes neither.
  `isJsonRecord` comes from the sibling `../json-values.ts`.
- The parameter list (`recordingCandidateParameters`) is unchanged: neither field is an
  editable parameter on the definition. See open question 2.

### `docs/architecture/automation-studio-native-nodes.md`

- The sentence at the old `:268-269` now says approval into a node definition does not
  carry **`expectedState`**, and three new paragraphs state: the two new candidate
  fields and their shapes; the `recordsPath` resolution order and that Core never
  assumes one; that `null` is none and anything else that does not parse rejects the
  candidate with the reason reported as a mapping issue, including the no-path and
  `encrypt` cases; the `timeoutMs` rule and the 5,000 ms default it replaces; and that
  approval into a Flow and into a node definition both carry both, the definition's
  values winning at materialization. The closing "additive" paragraph now covers
  `following`, `expectedState`, `recordOutput`, and `timeoutMs`.

## Tests

Both test files are ones this brief owns. Every new row was written before the
implementation and observed failing first (the red run below).

### `tests/proposal-candidates.test.ts`

The shared helper now registers a second output, `extract`, whose definition carries
`metadata: { recordsPath: "extracted" }`, while `click` declares none; mapper manifests
declare both output ids. The existing expected-state, start-node, and `following` rows
are unchanged and still pass. New rows, all driven through `AutomationStudioService`:

- explicit `recordsPath` wins over the output's declared one;
- the output's `metadata.recordsPath` is used when the candidate names none;
- neither present rejects the candidate, no proposal is made, and the reason appears in
  the service's issues;
- an `encrypt` field rejects the candidate;
- `it.each` over an array, a string, `false`, an unknown key, an invalid dataset id, and
  a value that cannot be cloned, each rejected with its own issue code;
- `it.each` over a candidate giving none and giving `null`: the action is still proposed,
  the candidate has neither key, and the approved node's `parameterValues` equal exactly
  `{ outputId, parameters }`;
- a mapper that keeps one object across two calls and changes it between them gets two
  candidates holding what it proposed at each call, not the last value;
- the end-to-end row: the approved Flow node's `parameterValues` equal
  `{ outputId, parameters, recordOutput, timeoutMs: 30000 }`; running that graph through
  `runCanonicalAutomationStudioFlow` dispatches an effect whose payload carries
  `recordOutput` and `timeoutMs: 30000`, and the `onRecordBatch` hook receives one batch
  with `datasetId: "products"` and rows holding only the included field, the excluded
  `email` gone;
- `it.each` over seven invalid timeouts (zero, negative, fractional, `NaN`, `Infinity`, a
  string, `null`), each rejecting the candidate.

### `tests/candidate-definitions.test.ts`

- A service row: a proposal whose candidate carries a record output and a 30,000 ms
  timeout, approved into **node definitions**; the definition read back with
  `listRecordingDerivedNodeDefinitions` carries both in metadata; a Flow node naming that
  definition, materialized, dispatches with both and hands the hook rows without the
  excluded field.
- Three direct rows: the definition's metadata holds a copy of the candidate's record
  output (not the same object) plus the timeout; a materialized node takes the
  definition's record output and timeout over its own; and a definition whose metadata
  holds a non-object record output and a string timeout contributes neither.
- The existing exact-metadata rows are unchanged, so they now also pin that a candidate
  without these fields produces a definition with neither key.

## Commands run and observed results

Every command ran alone, per the brief's note about this machine's memory.

1. **Red run, before implementing** (tests only in place), the brief's acceptance command:
   `pnpm -C "F:\!FluxIQ" --filter fluxiq exec vitest run src/programs/automation-studio/runtime/service/recordings/tests --no-file-parallelism`
   - `Test Files 2 failed (2)`, `Tests 22 failed | 17 passed (39)`, exit 1.
   - Every failure was an `AssertionError`, not a crash (`expected undefined to deeply
     equal { datasetId: 'products', ... }`, `expected [ ... ] to deeply equal []`). The 17
     passing were the pre-existing rows plus the rows that must pass on both sides.
2. **Green run, same command, after implementing:** `Test Files 2 passed (2)`,
   `Tests 39 passed (39)`, exit 0.
3. **Type check:** `pnpm -C "F:\!FluxIQ" --filter fluxiq check` (`tsc --noEmit`).
   - First run: exit 2, two errors, both in my own test files, none in source: a Flow
     document passed where `runCanonicalAutomationStudioFlow` is typed to take an
     artifact, and a cast that admitted `undefined` under `exactOptionalPropertyTypes`.
     Fixed with a commented cast and `NonNullable<...>`.
   - Second run: **exit 0, no diagnostics.** No other worker's file failed, so no rerun
     was needed.
4. **Structure audit:** `pnpm -C "F:\!FluxIQ" structure:check`, run twice (mid-work and
   last).
   - Both: `structure-audit: 1 violation(s) across 1 rule(s)`, exit 1.
   - The only `FAIL` is `[working-docs] docs/working/README.md is out of date with the
     documents' header blocks` — a shared supervisor document this brief does not own, and
     the same failure K3 and K4c.0 reported. Left untouched, as the brief requires.
   - Advisory warnings named `runtime/service/recordings/store.ts` (506 lines),
     `flow-bootstrap/generation-failure.ts`, and web files; none is a file I changed.
5. **Final acceptance rerun, after all mutations:** same command as 1. `ACCEPT EXIT=0`,
   `Test Files 2 passed (2)`, `Tests 39 passed (39)`.
6. **Diff check:** `git diff` shows only the intended hunks; `git status` on the owned
   paths shows exactly the expected entries (`recordings/index.ts` is modified by K4c.0's
   uncommitted barrel export, not by me; `candidate-definitions.ts` and its test remain
   K4c.0's untracked files).

### Mutations

The permission classifier refused K3's mutation edits to real source, so rather than test
that boundary again, **no source file was modified on disk**. Each mutation is applied to
one module's text as vitest loads it, by a pre-transform plugin in a scratch config
(`scratchpad\k7-mutation-vitest.config.mjs`, runner `scratchpad\k7-mutations.ps1`),
selected by the `K7_MUTATION` environment variable. The plugin asserts its target string
occurs **exactly once** in that module and throws otherwise, so a mutation can never
silently fail to apply, and it logs each application.

Evidence the harness did what it claims: **18 distinct mutations logged as applied**,
**0 target errors**, and every run failed at least one row. Afterwards `git diff --stat`
on `proposal-candidates.ts` is unchanged from before the batch (58 insertions, 3
deletions), and a search of `candidate-definitions.ts` for three of the mutation texts
finds nothing.

Each run is the full acceptance path, one run at a time, results from vitest's JSON
reporter. "Rows killed" lists the tests that failed.

| Run | Mutation | Rows killed |
| --- | --- | --- |
| NONE | baseline | none: `39 passed`, exit 0 |
| M1 | the throw replaced by a drop (**report target 1**) | 7: every rejection row except the uncloneable one, which M4 owns |
| M2 | the output's `metadata.recordsPath` default ignored (**report target 2**) | 7: the default-path row, both end-to-end rows, the copy row, and three rejection rows whose issue list changes once the path is missing |
| M3 | the candidate's own `recordsPath` ignored | 1: the explicit-path row |
| M4 | a clone failure dropped instead of thrown | 1: the uncloneable row |
| M5 | the parsed copy replaced by the mapper's own object | 1: the copy row |
| M6 | `null` no longer meaning none | 1: the null row |
| M7 | `timeoutMs` not lifted onto the candidate | 2: both end-to-end rows |
| M8 | timeout validation removed | 7: all seven timeout rows |
| M9 | `Number.isSafeInteger` relaxed to `Number.isFinite` | 1: the fractional row |
| M10 | approval writes no `recordOutput` | 1: the Flow end-to-end row |
| M11 | approval writes no `timeoutMs` | 1: the Flow end-to-end row |
| M12 | definition metadata drops `recordOutput` | 3 |
| M13 | definition metadata keeps the candidate's object instead of a copy | 1: the copy row |
| M14 | definition metadata drops `timeoutMs` | 3 |
| M15 | `materializeRecordingNode` drops `recordOutput` (**report target 3**) | 2 |
| M16 | `materializeRecordingNode` drops `timeoutMs` | 2 |
| M17 | a node's own `recordOutput` wins over the definition's | 1 |
| M18 | a non-object `recordOutput` carried onto the node | 1: the invalid-metadata row |

## Not verified

- **A dataset is not persisted by a service run yet.** The report's K7 row "approval into
  a node definition, then a run, persists a dataset" cannot be met at K7:
  `AutomationStudioService` passes no `onRecordBatch` hook to the executor (nothing in
  `service.ts` mentions it), because that wiring is K4b's, which the plan lists as still
  waiting. The rows therefore stop at the strongest point available today: the run reaches
  capture and hands a correct batch to a hook the test supplies. Re-check end to end once
  K4b lands.
- **The `structuredClone` before parsing is not independently proved.** The parser already
  returns fresh objects, so a mutation removing only the clone is not distinguishable by
  these rows (M5 removes the parsed copy as well). The clone remains as defence against a
  value whose reads are not stable.
- **No cap on a large timeout.** `liftedTimeoutMs` accepts any safe integer above zero.
  Node's timers saturate above 2^31-1 ms, so an absurd timeout would fire immediately
  rather than never; nothing in Core bounds this today (the runtime only checks `> 0`).
  Unchanged here because no decision covers it. See open question 3.
- **The wider suite, the build, and `pnpm check` from the repository root** were not run:
  the brief forbids them on this machine. Only the recordings test folder, the `fluxiq`
  type check, and the structure audit were run.
- **Downstream X4 was not exercised.** Whether the web-extension mapper's candidate
  satisfies these rules (field-id pattern, dataset id, no `recordsPath`, scaled
  `timeoutMs`) is X4's cross-repository acceptance row, not run here.
- No browser or panel testing (not applicable).

## Open questions or contradictions found

1. **An invalid `timeoutMs` rejects the whole candidate.** CD19 and the execution report
   specify rejection only for `recordOutput` and say nothing about an invalid timeout. I
   chose rejection, for the reason in the code comment: dropping it would silently restore
   the 5,000 ms default that correction 2 exists to remove. If the supervisor prefers a
   drop, only `liftedTimeoutMs` and the seven `it.each` rows change.
2. **A recording-derived definition exposes neither field as a parameter, and has no
   `records` port.** `recordingCandidateParameters` still lists only `parameters` and the
   confirmation pair, and the definition's outputs remain `success` and `failed`, while the
   materialized `builtin.policy.action` has a `records` port (K3). So a Flow cannot connect
   a recording-definition node's records, and an operator cannot edit the recorded timeout.
   Both look like K12d/K9 surface work; neither is in K7's scope as written.
3. **No upper bound on `timeoutMs`** (see Not verified). A ceiling, if wanted, belongs next
   to the runtime's own timeout handling rather than in this lift.
4. **Line endings.** The two source files I rewrote are LF in the working copy while some
   siblings are CRLF (`core.autocrlf=true`); the index is LF, so committed content is
   unaffected. K3 reported the same.
5. **`docs/working/README.md` is stale** and fails the audit for every worker in this
   campaign. Regenerating it is the supervisor's (`pnpm structure:baseline` also
   regenerates it).
