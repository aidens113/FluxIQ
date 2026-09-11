# Report: core-failure-taxonomy

Worker: `core-failure-taxonomy`. Brief: `### Brief: core-failure-taxonomy` in
`docs/working/mvp-week1-web-automation-reliability-plan.md`, plus the
supervisor's mid-task grant of `runtime/executor/node-execution.ts` and
`runtime/client-gateway-transport.ts`, with their `tests/`.

## Outcome

Done. All four brief items are implemented, the requested tests exist and
pass, and `pnpm check` and `pnpm build` pass.

`pnpm test` exits 1 because of five failures outside this change:

- Three tests fail identically on a clean `HEAD` copy (evidence below).
- Two `service-subflow-pagination` tests time out under full-suite load but
  pass 5/5 when the file runs alone.

No failure is in a file this work touched.

## What changed and why

### 1. One failure-category list (C1)

The canonical list moved into `@fluxiq/contracts`, so browser clients use it
without a second copy. The contracts package must not import the runtime
(`package-boundaries.md`), so the list can only live there.

The list is in `packages/contracts/src/failure/`:

- `adaptive-class.ts`: the frozen list and the type derived from it.
- `record.ts`: the failure record, its stages, and its limits.
- `parse-record.ts`: the parser.
- `index.ts`: the barrel.
- `automation-studio.ts` re-exports the folder, so the names reach the
  existing `./automation-studio` subpath and the root export. I didn't edit
  `package.json` `exports`; I only own its `version` field.

Fluxiq no longer defines its own union. `runtime/adaptive-orchestrator.ts`
imports the type from contracts and re-exports it and the new values.
`AutomationStudioAdaptiveFailureClass` therefore keeps its fluxiq import path.

The list keeps the original nine members and adds seven: `target_not_found`,
`target_ambiguous`, `navigation_unexpected`, `output_not_observed`,
`page_changed`, `auth_required`, and `user_intervention_required`.

`AutomationStudioTransitionComparisonStatus` in `runtime/executor/contracts.ts`
gains `target_not_found` and `target_ambiguous`.

#### Eleven-category mapping

"Comparison" is the comparison status a failed attempt gets.

| Downstream category | Core member | New or reused | Comparison | Candidate kind | LLM eligible |
| --- | --- | --- | --- | --- | --- |
| `TARGET_NOT_FOUND` | `target_not_found` | new | `target_not_found` | `action_target_override` | yes |
| `TARGET_AMBIGUOUS` | `target_ambiguous` | new | `target_ambiguous` | `action_target_override` | yes |
| `STATE_MISMATCH` | `expected_state_missing` | reused | `missing_expected_state` | `expectation_wait_retry` | yes |
| `NAVIGATION_UNEXPECTED` | `navigation_unexpected` | new | `unexpected_state` | `recovery_path_or_reroute` | yes |
| `OUTPUT_NOT_OBSERVED` | `output_not_observed` | new | `missing_expected_state` | `expectation_wait_retry` | yes |
| `ACTION_REJECTED` | `blocked_by_capability_or_policy` | reused | `blocked` | `diagnosis_only` | no |
| `TIMEOUT` | `timeout` | reused | `timeout` | `expectation_wait_retry` | yes |
| `PAGE_CHANGED` | `page_changed` | new | `unexpected_state` | `recovery_path_or_reroute` | yes |
| `AUTH_REQUIRED` | `auth_required` | new | `blocked` | `diagnosis_only` | no |
| `USER_INTERVENTION_REQUIRED` | `user_intervention_required` | new | `blocked` | `diagnosis_only` | no |
| `UNKNOWN` | `ambiguous_or_unknown` | reused | `action_failed` | `diagnosis_only` | yes |

Three mapping choices need confirming (see the open questions):

- `STATE_MISMATCH` goes to `expected_state_missing`, because the expectation
  was not confirmed. `unexpected_state` stays for route and status mismatches
  that Core detects itself.
- `ACTION_REJECTED` goes to `blocked_by_capability_or_policy`. A client
  refusing an unsupported page or action is a capability refusal, not a
  failure of an action that ran.
- The other four original members have no downstream category:
  `action_failed`, `missing_router_or_subflow_target`,
  `graph_validation_or_unknown_node`, and `external_side_effect_denied`.

### 2. The failure record, its parser, and its carriers (C1)

The record is `AutomationStudioFailureRecord`:
`{ category, code, retryable, stage?, expected?, actual?, evidenceDigest? }`.

- `stage` is a closed set: `target_resolution`, `dispatch`, `execution`,
  `confirmation`, `verification`.
- `code` allows letters, digits, `.`, `_`, `:`, and `-`, up to 200
  characters.
- `expected` and `actual` are non-empty strings of at most 1024 characters.
- `evidenceDigest` is 64 lowercase hex characters, matching the SHA-256
  digest that `failure-evidence.ts` produces.

`parseAutomationStudioFailureRecord(value)` is modelled on
`parseAutomationStudioFlowBootstrapFailureDiagnostic`:

- Fields must match exactly, with no unknown keys.
- The value must be a plain object.
- Hostile input returns `null` instead of throwing.
- It builds a fresh object and never repairs anything.

Two consistency assertions apply:

- Six categories can never be retryable: `blocked_by_capability_or_policy`,
  `missing_router_or_subflow_target`, `graph_validation_or_unknown_node`,
  `external_side_effect_denied`, `auth_required`, and
  `user_intervention_required`.
- `target_not_found` and `target_ambiguous` may only name the
  `target_resolution` stage.

`failure?` is now an optional field on these carriers:

- `ClientGatewayActionResult` (`packages/contracts/src/client-gateway.ts`)
- `FluxIQRuntimeCommandResult` (`packages/fluxiq/src/runtime/contracts.ts`)
- `AutomationStudioFlowRunActionAttemptRecord` (`model/flow-adaptation.ts`)
- `OutputDispatchResult` (`src/io/index.ts`). The brief named only `status`
  here; see "Deviations".
- `AutomationNodeExecutionResult` (`nodes/contracts.ts`)
- `AutomationStudioNodeAttemptTrace` (`runtime/executor/contracts.ts`)

### 3. The propagation chain (C1 and C2)

**Dispatch results.** `OutputDispatchResult` gains `status?`
(`FluxIQRuntimeCommandStatus`) and `failure?`.

**Node results.** `AutomationNodeExecutionResult` gains `message?`,
`failure?`, and `targetResolution?`. The new type
`AutomationNodeTargetResolution` in `nodes/contracts.ts` has these fields:

- `status`: `matched`, `unresolved_no_candidates`, `no_match`, or
  `below_confidence`.
- `candidateCount` and `minimumConfidence` (always set).
- Optional `candidateId`, `confidence`, `normalizedScore`,
  `matchedSignals`, and `failedSignals`.

**`io-policy.ts`**, on both the IO and runtime dispatch paths:

- Failed results now carry `message`: the confirmation error, else the
  runtime `message`, else `error`.
- They carry `failure`. A valid host-reported record wins, parsed from the
  dispatch result.
- They carry `targetResolution`, and so do successful results.

When the host sends no record, Core writes one only where its own structured
signal proves the category. The `code` values are Core's:

| Signal | Category | Code | Retryable, stage |
| --- | --- | --- | --- |
| Command status `timed_out` | `timeout` | `output_dispatch.timed_out` | yes |
| Command status `rejected` | `blocked_by_capability_or_policy` | `output_dispatch.rejected` | no, `dispatch` |
| Dispatched output, but the bound confirmation input never arrived (not an abort) | `output_not_observed` | `output_confirmation.not_received` | yes, `confirmation` |
| No candidate scores at or above zero | `target_not_found` | `element_target.no_match` | yes, `target_resolution` |
| Best candidate below the confidence threshold | `target_not_found` | `element_target.below_confidence` | yes, `target_resolution`; `expected` and `actual` give the percentages |
| Output declares an element target but has no fingerprint | `graph_validation_or_unknown_node` | `element_target.missing_fingerprint` | no, `target_resolution` |
| Policy action has no `outputId` | `graph_validation_or_unknown_node` | `output_dispatch.missing_output_id` | no, `dispatch` |
| Output is not registered | `blocked_by_capability_or_policy` | `output_dispatch.output_not_registered` | no, `dispatch` |

The confirmation wait, previously duplicated in both dispatchers, is now one
helper. It also records whether the wait ended by abort.

**`executor/node-execution.ts`** (granted). `dispatchAutomationStudioEffects`
used to rebuild the node result from only `outputs`, `status`, and `route`.
A failed dispatcher result now also carries `message`, `failure`, and
`targetResolution`. A successful one carries `targetResolution`. Results
without these fields are unchanged.

**`executor/attempt-trace.ts`.** `nodeAttemptFromResult` copies `message` and
`targetResolution`. It also parses `failure` here, where every node result
becomes an attempt. It keeps a failure only on failed or waiting attempts,
and drops one that doesn't parse.

**`executor/contracts.ts`.** `failure?` sits beside `message`, and
`targetResolution?` sits beside `stateRefs` (C2).

**`executor/transition-comparison.ts`.** A failed attempt is classified from
its record first, through a map that is exhaustive by type
(`COMPARISON_STATUS_FOR_FAILURE`). The old `timeout`/`timed out` text match
runs only when there is no record. New messages cover the two target
statuses.

**`adaptive-orchestrator.ts`.** Classification now works in this order:

1. A parsed `attempt.failure` names the class.
2. Otherwise, a `target_not_found` or `target_ambiguous` comparison status
   names it.
3. Otherwise, the legacy regex chain runs unchanged.

`adaptiveCandidateKindForFailure` is now a `switch` that is exhaustive at
compile time and returns `diagnosis_only` if a value somehow falls through.
`auth_required` and `user_intervention_required` are not LLM-eligible.

**`service/summaries/conversions.ts`.** The run action record gets the
parsed `failure`, and its metadata gets `targetResolution`.

**`llm/harness/context-packet.ts`.** `AutomationStudioLlmRecentActionContext`
gains `failureCategory?`, parsed from the stored record. Only the category
reaches the model; the code and texts never do, and a test asserts this.

**`runtime/client-gateway-transport.ts`** (granted). The `execute_action`
dispatch return keeps the client's `failure` only if it parses.
`forwardGatewayEvent` carries a parsed `failure` onto `command.result`.

### 4. Version and migration note

- `packages/contracts/package.json` and `packages/fluxiq/package.json` move
  from `0.1.0` to `0.2.0`.
- Core had no migration-note convention. The only mention was "minor version
  with migration notes" in `docs/architecture/package-boundaries.md`. So I
  added a `## Migration Notes` section there with one `0.2.0` entry, and
  updated its version sentence.
- The entry covers:
  - the new members;
  - where the list now lives;
  - every additive field;
  - the one behaviour that changes without a host opt-in: the failures Core
    now writes itself, and the dispatch error now appearing as the failed
    attempt's `message`.

Architecture docs updated:

- `docs/architecture/automation-studio.md`: new paragraph after the
  transition-comparison paragraph.
- `docs/architecture/runtime-kernel.md`: Automation Studio Integration, new
  item 6.
- `docs/architecture/automation-studio/client-gateway.md`: the
  `client.action_result` bullet.

### A build fix found by the gates

The first real `pnpm build` of the web app failed:

```text
./packages/contracts/src/automation-studio.ts:5:1
Module not found: Can't resolve './failure/index.js'
```

The cause:

- `apps/web` compiles Core source through the `tsconfig.base.json` paths
  (`@fluxiq/contracts/*` → `packages/contracts/src/*.ts`).
- Turbopack does not map a NodeNext `.js` specifier back to a `.ts` file.
- Every earlier relative import in contracts source was type-only and
  erased, so this was the first relative value import Turbopack had to
  resolve.

The fix: the new module's relative value imports use `.ts` specifiers, as
fluxiq source already does. The contracts build config has
`rewriteRelativeImportExtensions: true`, and the emitted `dist` was checked
to contain `.js` (see below). The type-only import in `client-gateway.ts`
keeps `.js`, like its neighbour.

### New exports and import paths

From `@fluxiq/contracts/automation-studio` and the `@fluxiq/contracts` root:

- `AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES`: value, a frozen tuple.
- `AutomationStudioAdaptiveFailureClass`: type. It moved here from fluxiq.
- `isAutomationStudioAdaptiveFailureClass`: function.
- `AUTOMATION_STUDIO_FAILURE_STAGES`: value.
- `AutomationStudioFailureStage`: type.
- `AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS`: value, `{ codeMaxLength: 200, textMaxLength: 1024 }`.
- `AutomationStudioFailureRecord`: type.
- `parseAutomationStudioFailureRecord`: function.

`fluxiq/automation-studio` re-exports the same eight names through the chain
`automation-studio/index.ts` → `runtime/index.ts` → `adaptive-orchestrator.ts`.

`AutomationNodeTargetResolution` (type) is new in `fluxiq/automation-studio/nodes`
and `fluxiq/automation-studio`.

New optional fields:

- `failure`: on the six carriers in section 2.
- `status`: on `OutputDispatchResult`.
- `message` and `targetResolution`: on `AutomationNodeExecutionResult`.
- `targetResolution`: on `AutomationStudioNodeAttemptTrace`.
- `failureCategory`: on `AutomationStudioLlmRecentActionContext`.

New comparison-status members: `target_not_found`, `target_ambiguous`.

### Deviations from the brief, each needed for the chain

- **`failure?` on `OutputDispatchResult`** in addition to `status?`. Without
  it, a domain IO adapter (the downstream gateway output dispatcher) cannot
  hand Core its record.
- **`targetResolution?` on `AutomationNodeExecutionResult`** and the new
  `AutomationNodeTargetResolution` type. They carry C2 typed from
  `io-policy.ts` to the trace, instead of parsing
  `outputs.elementTargetResolution`, which is kept unchanged for
  compatibility.
- **`targetResolution` survives successful dispatches too**, because C2's
  purpose is asserting the matched fallback. The grant mentioned only failed
  results.
- **The transport also validates `failure` on the dispatch return path**,
  not only on the event.

Test placement:

- The `context-packet.ts` test is in the existing `llm/tests/harness.test.ts`.
- The `conversions.ts` coverage is in `runtime/tests/io-policy.test.ts`
  (end to end).

Both `llm/harness/tests/…` and `service/summaries/tests/…` would be 10 path
segments, over the 9-segment limit. `runtime/tests/` now holds 25 files,
exactly at the directory limit.

## Commands run and observed results

All from `F:\!FluxIQ`. Full logs are in the session scratchpad, as
`core-failure-taxonomy-*.log`.

**Contracts package**

- `pnpm --filter @fluxiq/contracts check`: exit 0, run twice, the second time
  after the specifier change.
- `pnpm --filter @fluxiq/contracts build`: exit 0; `dist/failure/*.js` and
  `*.d.ts` emitted, with no test files.
- `pnpm --filter @fluxiq/contracts test`: `src/failure/tests/parse-record.test.ts (7 tests)`, `Tests 7 passed (7)`.

**Fluxiq type check**

- `pnpm --filter fluxiq check`: the first run printed one error in my own
  test:

  ```text
  adaptive-orchestrator.test.ts(133,32): error TS2304: Cannot find name 'AutomationStudioAdaptiveFailureClass'.
  ```

  I fixed the import. The rerun exited 0.

**Targeted fluxiq tests**

- `npx vitest run` on the ten affected files, first run:
  `Tests 3 failed | 78 passed (81)`. All three failures were in my new
  `io-policy.test.ts`:
  - A Save-vs-Cancel fixture scores below zero, so the matcher returns no
    candidate and the code takes the `no_match` path, not `below_confidence`.
  - `{ elementId }` parameters normalize into a target.

  I corrected the fixtures. `no_match`, `below_confidence`, and `matched` are
  now tested separately. The rerun gave `io-policy.test.ts (9 tests)`,
  `Tests 9 passed (9)`.

**Structure audit**

- `node scripts/structure-audit.mjs`:
  `structure-audit: passed (117 warning(s), 256 baselined).`

**`pnpm check`**

- Exit 0, run twice; the final run came after the specifier change. Output:
  `# tests 48 / # pass 48 / # fail 0`,
  `structure-audit: passed (117 warning(s), 256 baselined).`, and
  `packages/contracts`, `packages/client-gateway-websocket`,
  `packages/fluxiq`, and `apps/web` each `check: Done`.

**`pnpm build`**, three runs:

1. Exit 139. The contracts, fluxiq, and WebSocket client builds completed.
   Then `Next.js build worker exited with code: 3221225477` (a native access
   violation in `apps/web`). Per the brief, I reran.
2. Exit 1: `Turbopack build failed with 24 errors`, starting with
   `Module not found: Can't resolve './failure/index.js'`, then `Export
   parseAutomationStudioFailureRecord doesn't exist in target module`. This
   was caused by my change; fixed as described above.
3. Exit 0: `✓ Compiled successfully in 12.5s`, then the `Route (app)` table.
   `dist` specifiers are rewritten, for example
   `dist/automation-studio.js:5: export * from "./failure/index.js";` and
   `dist/failure/parse-record.js:1: ... from "./adaptive-class.js";`.

**`pnpm test`**, first run, while `pnpm docs:check` ran alongside:

- Exit 1. Fluxiq: `Test Files 3 failed | 124 passed (127)`.

**`pnpm docs:check`**

- Exit 1:
  `Error: docs/reference/framework-reference.md is stale. Run pnpm docs:reference and commit the result.`

**Clean `HEAD` baseline**

I ran `git archive HEAD packages/fluxiq tsconfig.base.json package.json` into
the scratchpad and junctioned the real `node_modules`. Then I ran
`npx vitest run` on `runtime-llm-grants.test.ts` and `service.test.ts`:
`Tests 3 failed | 106 passed (109)`. These three tests fail with the same
errors as in the working tree:

- `issues a sanitized build grant …`: `Flow bootstrap generation runtime is unavailable.: expected false to be true`
- `turns mapped observations into reviewed Flow actions …`: `Invalid Automation Studio Flow: nodes.0.definitionVersion (flow.node_invalid_definition_version)`
- `approves edited recording Flow proposal graphs into Flows`: `expected { id: 'node.edited-click', …(7) } to match object { …(2) }` (label `Edited click proposal` vs `Reapplied click proposal`)

I removed the junctions afterwards with `cmd /c rmdir`. The real
`node_modules` is intact: `Test-Path …\packages\fluxiq\node_modules\vitest` is
`True`.

**`pnpm test`**, final run, with nothing else running:

- Exit 1. contracts `Tests 7 passed (7)`; client-gateway-websocket
  `Tests 3 passed (3)`; fluxiq `Test Files 3 failed | 123 passed (126)`,
  `Tests 5 failed | 817 passed (822)`.
- The five failures:
  - `runtime-llm-grants` (1), already failing on `HEAD`.
  - `service.test.ts` (2), already failing on `HEAD`.
  - `service-subflow-pagination` (2): `Test timed out in 15000ms`,
    `Test timed out in 30000ms`, and
    `EBUSY: resource busy or locked, unlink '…\global.sqlite'`.
- Every file I added or extended passed: `harness.test.ts (19 tests)`,
  `io-policy.test.ts (9 tests)`, `adaptive-orchestrator.test.ts (9 tests)`,
  `client-gateway-transport.test.ts (6 tests)`,
  `transition-comparison.test.ts (5 tests)`, `attempt-trace.test.ts (4 tests)`,
  and `node-execution.test.ts (3 tests)`.

**Pagination file alone, idle machine, with my changes**

- `npx vitest run …/service-subflow-pagination.test.ts`:
  `Tests 5 passed (5)`, 36.6 s. The two tests that timed out in the suite take
  12.6 s and 21.1 s here.

**Tests the definition of done asked for**

- **Timed-out action with the structured field classifies as `timeout`.**
  - `adaptive-orchestrator.test.ts`: "classifies a timed-out action from its
    structured failure even when the message never says so".
  - `io-policy.test.ts`, end to end: "carries a timed-out runtime action to
    classification, the run record, and the LLM context". A runtime adapter
    returns `timed_out` with the message "The client did not answer.". The
    attempt gets `failure.category: "timeout"`, comparison `timeout`, class
    `timeout`, candidate kind `expectation_wait_retry`. The run record keeps
    `failure`, and the LLM context has `failureCategory: "timeout"`.
- **Legacy record without the field still classifies by regex.**
  `adaptive-orchestrator.test.ts`: "still classifies legacy attempts without a
  failure record by their message". "Client action timed out after 5000ms."
  gives `timeout`; "The client did not answer." gives `action_failed`.
  `transition-comparison.test.ts` has the matching text-fallback case.
- **Grant tests.**
  - `node-execution.test.ts`: "carries a failed dispatcher's failure record,
    message, and target resolution onto the attempt".
  - `client-gateway-transport.test.ts`: "keeps a client-reported failure
    through dispatch and drops a malformed one" and "carries a
    client-reported failure onto the command.result runtime event".

## Not verified

- **`pnpm test` as a whole.** It does not exit 0; see the failures above,
  none of them in touched files.
- **The generated framework reference is stale**, for both
  `docs/reference/framework-reference.md` and
  `packages/fluxiq/docs/reference/framework-reference.md`. It is generated
  and not in my owned paths; `pnpm docs:reference` regenerates it.
- **`pnpm package:validate` was not run.** It covers publint, attw, tarball
  smoke installs, and browser bundling. The new `dist/failure/` directory
  reached through the `./automation-studio` subpath is therefore unverified
  by attw and publint.
- **No live browser run.** Core has no browser surface here; the downstream
  producers do not exist yet.
- **Fluxiq tests read contracts from its built `dist`.** Vitest has no
  source alias, so `pnpm test` fails after a contracts source change until
  `pnpm --filter @fluxiq/contracts build` or `pnpm build` runs. This
  constraint already existed (`CLIENT_GATEWAY_PROTOCOL_VERSION` is a runtime
  import), but this change adds runtime imports from contracts.
- **Run-action list pages will not show `failure`.** The SQL summary rows in
  `storage/project/runtime-stream-store.ts` `actionSummaryFromRow` do not
  carry it; the detail JSON does. That file is outside my owned paths.

## Open questions or contradictions found

1. **Mapping choices.** Confirm `STATE_MISMATCH` → `expected_state_missing`
   (the audit lists both `expected_state_missing` and `unexpected_state`) and
   `ACTION_REJECTED` → `blocked_by_capability_or_policy` (the audit lists
   both it and `action_failed`).
2. **The parser's consistency rules bind downstream producers.** For example,
   an `auth_required` record with `retryable: true` is dropped whole.
   Confirm the six never-retryable categories and the target-stage rule.
3. **Behaviour change without opt-in.** Failed dispatch attempts now carry
   the dispatch error as `message`. When the host sends no failure record and
   Core has no structured signal (status `failed`, `unknown`, or
   `cancelled`), the legacy regex now sees that text. An error such as
   "Unknown element" would classify `graph_validation_or_unknown_node`
   instead of `action_failed`. The brief asked for `message` to be carried,
   and downstream records override the regex, but this partly contradicts
   the decision that "a host that sets none of the new fields keeps today's
   behaviour". The Core-written records in section 3 are the other half of
   that change, and the migration note records both.
4. **Candidate kind for target failures.** `target_not_found` and
   `target_ambiguous` return `action_target_override` even without a
   `subflowId`, while `action_failed` and `unexpected_state` keep the
   existing subflow condition. Confirm.
5. **Package versions no longer match.** `@fluxiq/client-gateway-websocket`
   stays at `0.1.0` because it isn't in my owned paths. Its public types
   change additively through `ClientGatewayActionResult`. The release policy
   previously said all packages share one version. Decide whether to bump
   it.
6. **Three tests already fail on `HEAD`**, independent of this work:
   `_shared/tests/runtime-llm-grants.test.ts` (one test) and
   `runtime/tests/service.test.ts` (two tests).
   `service-subflow-pagination.test.ts` times out under full-suite load. The
   supervisor's gate will show them until they're fixed.
7. **Specifier convention for contracts source.** Any future relative value
   import in `packages/contracts/src` must use a `.ts` specifier, or the web
   app's Turbopack build cannot resolve it. `automation-studio.ts` has a
   comment saying so.
8. **Other workers' files in the working tree**, none touched by me:
   `apps/web/*`, `docs/integrations/automation-studio-importing-repos.md`,
   `docs/operations/data-and-state.md`, root `package.json`, and
   `scripts/structure-audit*`.
