# k3-policy-action-record-output: `recordOutput` parameter and `records` port on the policy action

## Outcome

**Partial: the code is done, but the acceptance command as written does not pass yet.**

`builtin.policy.action` now has:
- a `records` output port;
- a manual-only `recordOutput` json parameter, edited by the new `record-output` control.

Its `execute` parses `recordOutput` with K1's `parseAutomationStudioRecordOutput`. An invalid value, or one that asks to encrypt a field, fails the node before anything is dispatched.

**Why the acceptance command fails.** Run exactly as written, it fails 11 of 38 tests with `parseAutomationStudioRecordOutput is not a function`. My code is not the cause; the built contracts package is stale:
- Vitest in `packages/fluxiq` loads `@fluxiq/contracts/automation-studio` from `packages/contracts/dist`.
- That folder is git-ignored and was built on 2026-09-13, before K1. Its `automation-studio.js` re-exports only `./failure/index.js`.
- The type check is unaffected: it reads contracts from source through `tsconfig.base.json` `paths`.

**What was verified.** I was told not to run a build. Instead I ran the same test paths with a scratch vitest config that points that one import at the contracts source. All 38 tests passed. The type check passed, and the structure audit names none of my files.

**Supervisor action needed.** Rebuild the contracts package (`pnpm --filter @fluxiq/contracts build`), then rerun the acceptance command unchanged.

## What changed and why

### `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts`

- Added `"record-output"` to the `ui.control` union on `AutomationNodeParameter` (CD21, `k12-data-view` §4.3).
- The only switch over this union in the web panel (`ParameterEditor.tsx:412-428`) has a `default` branch, so widening the union breaks nothing there.

### `packages/fluxiq/src/programs/automation-studio/nodes/policy/action.ts` (42 to 114 lines)

- **Output port.** Added `{ id: "records", label: "Records", valueType: "array", role: "data" }` after `success` and `failed`. Nothing fills the port yet; K4 capture does that.
- **Parameter.** Added `recordOutput`, after `failureRoute`:
  - label "Save extracted records";
  - `valueType: "json"`, `defaultValue: null`, `allowStateBinding: false`;
  - `ui: { control: "record-output" }`;
  - a comment saying why binding is refused: a binding could swap the schema, and with it the excluded fields, at run time.
- **`execute`, when `recordOutput` is absent or `null`.** Nothing is parsed. The payload is built as before, with every field written by name. It has no `recordOutput` key, so its JSON is byte-identical to the old payload. A comment cites K4d's rule: the runtime withholds the saved result payload of any dispatch whose `recordOutput` is present and not null.
- **`execute`, for any other value.** The value is parsed with no `allowEncrypt`, so encrypted fields are refused (CD13, report §2.7).
  - On success, the payload gains `recordOutput: parsed.output`, the fresh object the parser returns.
  - On failure, the node returns the result below and no effect is dispatched.
- **The failure result:**
  - `status: "failed"`, `route: "failed"`, `effects: []`;
  - `outputs: { error: { code, issues } }`;
  - a plain `message`;
  - `failure: { category: "graph_validation_or_unknown_node", code, retryable: false, stage: "dispatch" }`.
- **Failure code.** It is `record_output.encrypt_unavailable` when the parser's issues include `record_schema.encrypt_unavailable`, and `record_output.invalid` otherwise.
- **Why absent-or-null rather than truthiness.** `false`, `0`, and `""` must not quietly skip the parser. They fail as invalid. This matches K4d's presence rule.
- **Helpers.** `readRecordOutput` and `recordOutputFailure` are private to the file, so it still exports only `actionNode`.

### `packages/fluxiq/src/programs/automation-studio/nodes/policy/tests/action.test.ts` (new, 15 cases)

- **Port.** The output ids are `success`, `failed`, `records`, in that order, and the `records` port equals the exact declaration.
- **Parameter.** `recordOutput` has its label, `valueType: "json"`, and `defaultValue: null`. `allowStateBinding` is `false`, and `ui` equals `{ control: "record-output" }` (the `k12-data-view` §7 test).
- **No record output.** For `recordOutput` absent and for `null`: the node succeeds, the payload's JSON equals a fixed string of the old payload, and the payload has no `recordOutput` key.
- **Valid record output.** It is carried in the payload, which equals the old payload plus `recordOutput`. The value is not the caller's object; the parser returned a fresh copy. An `exclude` field is kept in the schema.
- **Encrypt.** A field with `handling: "encrypt"`, with `failureRoute: "success"` set, still fails with route `failed`.
  - `effects` is `[]`.
  - The code is `record_output.encrypt_unavailable`, and the issues include `record_schema.encrypt_unavailable`.
  - The failure record matches exactly, and `parseAutomationStudioFailureRecord` returns it unchanged. That check matters because attempts parse the failure record and drop an invalid one.
- **Invalid values** (`it.each`), each failing with no effect, code `record_output.invalid`, the same failure record, and a record that survives `parseAutomationStudioFailureRecord`:
  - a malformed schema;
  - no `recordsPath` (CD19);
  - an unknown key;
  - a `$state` binding object;
  - `{}`, `false`, `0`, `""`;
  - an array.

## Commands run and observed results

All commands ran alone, one at a time, in `F:\!FluxIQ`.

1. **The acceptance command, as written:**
   `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/nodes/policy/tests/action.test.ts src/programs/automation-studio/nodes/tests --no-file-parallelism`
   - Result: `Tests 11 failed | 27 passed (38)`, `exit=1`.
   - Each failure is `TypeError: parseAutomationStudioRecordOutput is not a function` at `action.ts:89`. These are the 11 cases that reach the parser.
   - `registry.test.ts (10 tests)`, `parameter-bindings.test.ts (10 tests)`, and `canonical-registry.test.ts (3 tests)` passed.
   - Cause: `packages/contracts/dist/automation-studio.js` (13 Sep, git-ignored) re-exports only `./failure/index.js`, and a search of `packages/contracts/dist` finds no `record-sets`. `packages/fluxiq/vitest.config.ts` has no alias.
2. **The same command with a scratch config** that aliases only `@fluxiq/contracts/automation-studio` to `packages/contracts/src/automation-studio.ts`:
   - Config: `C:\Users\mrjoh\AppData\Local\Temp\claude\f---FluxIQWebExtension\3454178a-dd53-4d6d-917d-85b8f63d0d91\scratchpad\k3-vitest.config.mjs`, with the same timeouts as the package config.
   - Result: `Test Files 4 passed (4)`, `Tests 38 passed (38)`, `exit=0`.
   - `registry.test.ts` ran unchanged and passed its 10 tests.
3. **`pnpm --filter fluxiq check`** (`tsc --noEmit`): no diagnostics, `exit=0`. No other worker's files failed, so no rerun was needed.
4. **`pnpm structure:check`**, run twice (the second time to a scratch file, because the first output was truncated):
   - Result: `structure-audit: 1 violation(s) across 1 rule(s)`, `exit=1`.
   - The only `FAIL` is `[working-docs] docs/working/README.md is out of date with the documents' header blocks`, which is not my file.
   - No line of the saved output names `nodes/contracts.ts` or `nodes/policy/`.
   - The audit also printed `1 baseline entries can be lowered`. I did not remove a violation, so that improvement is not mine.
   - The `identity-access/runtime/service.ts` failure the supervisor mentioned did not appear; that file showed only advisory warnings (731 lines, 37 methods).
5. **Mutations.** The permission classifier refused the first mutation edit to real source (`[Security Test Removal]`), so every mutation ran on scratch copies.
   - Runner: `scratchpad\k3-mutations.mjs`; config: `scratchpad\k3-mutation-vitest.config.mjs`.
   - For each run, the runner copies the real `policy/action.ts`, `policy/shared.ts`, `policy/tests/action.test.ts`, and `shared/definition.ts` fresh into a scratch tree with the same relative layout.
   - It then applies one replacement to the scratch `action.ts`, asserting the target text occurs exactly once, and runs vitest on the scratch test. `vitest` and the contracts subpath are aliased.
   - A later search of the real `action.ts` found no mutation text.

   | Run | Result | Failing cases |
   | --- | --- | --- |
   | Baseline | `15 passed (15)` | none |
   | M1: early return skipped (`if (false && !recordOutput.ok)`), the report's first target | `10 failed \| 5 passed` | the encrypt case and all nine invalid-value cases |
   | M2: `recordOutput` left out of the payload, the report's second target | `1 failed \| 14 passed` | "carries a valid recordOutput" |
   | M3: key always written, `null` included | `2 failed \| 13 passed` | both absent and null cases |
   | M4: encrypt issue not mapped | `1 failed \| 14 passed` | the encrypt case |
   | M5: `allowStateBinding: true` | `1 failed \| 14 passed` | the parameter case |
   | M6: control `textarea` instead of `record-output` | `1 failed \| 14 passed` | the parameter case |
   | M7: truthiness test (`if (!value)`) | `3 failed \| 12 passed` | `false`, `0`, and `""` |
   | M8: `records` port removed | `1 failed \| 14 passed` | the port case |
   | M9: failure record `retryable: true` | `10 failed \| 5 passed` | every failure case (exact-match and parser round-trip) |
   | Baseline again | `15 passed (15)` | none |

   The runner deleted the scratch tree afterwards.

## Not verified

- **The acceptance command without the alias.** It needs the contracts dist rebuilt. I was told not to build, and the dist is not a file I own.
- **Production module loading against the stale dist.** Vitest leaves a missing named import `undefined` until it is called. Native Node ESM fails when the module loads instead. So a fluxiq build or run that loads `@fluxiq/contracts` from that stale dist would fail on `action.ts`'s import until contracts is rebuilt. I did not run a build to observe this.
- **The other 21 test files that reference `builtin.policy.action`.** Examples:
  - `runtime/tests/io-policy.test.ts`, `runtime/executor/tests/node-execution.test.ts`;
  - `runtime/service/recordings/tests/*`, `model/tests/flow-compatibility.test.ts`;
  - web `GraphEditorViews.test.ts`, `runtime-views.test.tsx`.

  The changes are additive and the payload is unchanged without `recordOutput`, but a test that counts this node's ports or parameters, or snapshots its definition, would change. The same goes for `runtime/flow-bootstrap/plan/catalog.ts`, which lists parameter defaults.
- **The full fluxiq suite, `pnpm test`, `pnpm build`, and `pnpm --filter @fluxiq/web check`** (the brief forbids suites and builds on this machine).
- **Documentation.** `docs/architecture/automation-studio-native-nodes.md` and `docs/reference/framework-reference.md` probably need updating for the new port, parameter, and control. K10 owns that, and I did not open them.
- **The web editor.** Until K12d lands, the web panel renders `record-output` through whatever branch `ParameterEditor.tsx` falls to; its label function returns "Text". CD21 says the generic json editor corrupts record outputs. No real record output is written before K7 or downstream X4.
- No live browser or panel testing (not applicable).

## Open questions or contradictions found

1. **The contracts dist is stale.** It predates K1, so any Core vitest run that calls a record-sets value through `@fluxiq/contracts/automation-studio` fails until it is rebuilt. K2, K4, and later briefs will hit this too. Either rebuild the contracts package before verifying, or give `packages/fluxiq/vitest.config.ts` a source alias like the one `tsconfig.base.json` `paths` already provides. The alias would be a config change outside my brief.
2. **Route when record output is invalid.** Report §4 K3 says `route: "failed"`. I kept that even when `failureRoute` is `"success"`, and a test pins it. "Continue as Success" exists for ignoring errors in the domain output. Ignoring a broken record output would run the extraction and save nothing, which CD13 rules out.
3. **Code when issues are mixed.** Any `record_schema.encrypt_unavailable` issue gives `record_output.encrypt_unavailable`, even beside other issues. The full issue list is kept in `outputs.error.issues`. No test pins the mixed case; the supervisor may prefer "encrypt only when it is the sole issue".
4. **Shape of `outputs.error`.** The report wrote only `outputs: { error }`. I chose `{ code, issues }`, where issues are the parser's stable codes and never user data. K12d's messages and Graph Problems use the parser directly, so nothing reads this shape yet.
5. **Line endings.** The working copies of `action.ts` and `action.test.ts` are LF, while sibling working copies are CRLF (`core.autocrlf=true`). The index is LF for all of them, so committed content is unaffected.
