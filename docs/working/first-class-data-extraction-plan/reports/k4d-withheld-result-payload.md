# k4d-withheld-result-payload: saved command attempts withhold a recordOutput payload

## Outcome

Done. A caller can now pass `withheldResultPayload: true` when it dispatches a command through the
framework runtime. The runtime then writes `"[withheld]"` in place of `result.payload`, both in the
attempt it keeps in memory and in the `attempt.json` it saves, and the caller still receives the
real payload. Automation Studio's runtime dispatcher (`AS/runtime/io-policy.ts`) sets the flag
whenever the dispatch effect payload carries `recordOutput`.

In production nothing sets the flag yet. `builtin.policy.action` does not put `recordOutput` into
its effect payload (`AS/nodes/policy/action.ts:40`); K3/K4a add that.

## What changed and why

### Trace, done first (both points were unverified in the report)

- **Inside the framework runtime.** `RuntimeService.dispatch` destructures `withheldValues` out of
  the context, so the adapter or transport never receives it. `withheldLookup` turns the values into
  a `WithheldLookup | null`, which `dispatch` passes as a third argument to
  `settleAttempt(attemptId, result, withheld)`. `settleAttempt` applies it through
  `withheldResult(result, withheld)`.
- **From Automation Studio.**
  - `effectDispatchContext` (`AS/runtime/executor/node-execution.ts:172-177`) builds
    `{ signal?, withheldValues? }`.
  - `dispatchAutomationStudioEffects` (`:144`) hands that to `options.effectDispatcher`.
  - `createRuntimePolicyEffectDispatcher` (`io-policy.ts:76`) forwards it into the context of
    `runtime.dispatch`.
  - A grep of non-test source finds `io-policy.ts` is the only caller of `RuntimeService.dispatch`.
- **Framework runtime tests** live at `packages/fluxiq/src/runtime/tests/service.test.ts`.

### `packages/fluxiq/src/runtime/contracts.ts`

- `FluxIQRuntimeDispatchContext` gains `withheldResultPayload?: boolean`, documented as the report
  worded it: the saved attempt holds the marker in place of `result.payload`, and the caller still
  receives it. Two additions to that wording: a result with no payload gains no marker, and the
  flag is never handed to the adapter or transport.
- New exported type `FluxIQRuntimeCommandAttemptResult`:
  `Omit<FluxIQRuntimeCommandResult, "payload"> & { payload?: JsonObject | typeof FLUXIQ_RUNTIME_WITHHELD_VALUE }`.
  `FluxIQRuntimeCommandAttempt.result` now uses it.
- **Why the new type.** The marker is a string, and `FluxIQRuntimeCommandResult.payload` is typed
  `JsonObject`. Keeping the old type would have needed a cast that makes the type lie about
  `attempt.json`.
- **Who is affected.** No code in Core, or in the downstream `F:\!FluxIQWebExtension`, reads the
  attempt's `result.payload`. A grep for `FluxIQRuntimeCommandAttempt`, `commandAttemptsList`, and
  `.commandAttempts` finds only the runtime folder, its tests, and three downstream working-doc
  reports. `dispatch` still returns `FluxIQRuntimeCommandResult`, unchanged.

### `packages/fluxiq/src/runtime/service.ts`

- `dispatch` destructures `withheldResultPayload` alongside `withheldValues`, so it stays out of
  the context handed to `dispatchToTarget`. It passes `withheldResultPayload === true` to
  `settleAttempt`.
- `settleAttempt` takes a `withholdPayload: boolean` and passes it on to `withheldResult`.
- `withheldResult` writes the marker in place of `payload` only when the flag is set **and** a
  payload came back. It still replaces withheld texts in `message` and `error` only when there are
  withheld values. With neither, it returns the result unchanged, as before. It now assigns fields
  on a copy instead of using conditional spreads, so a mistyped key fails the type check.
- The file grew from 454 to 461 lines.

### `packages/fluxiq/src/programs/automation-studio/runtime/io-policy.ts`

- The `runtime.dispatch` context in `createRuntimePolicyEffectDispatcher` gains
  `...(payload.recordOutput !== undefined && payload.recordOutput !== null ? { withheldResultPayload: true } : {})`,
  with a comment giving the reason.
- **Deliberate difference from the report.** The report's snippet was a truthiness test
  (`payload.recordOutput ? ...`). I test for presence instead: any value other than
  `undefined`/`null` withholds. Withholding costs the caller nothing, since it still gets the
  payload, so erring toward withholding is safe. The two tests differ only for `false`, `0`, and
  `""`, and none of those is a valid `recordOutput`.
- The IO-registry path (`dispatchPolicyOutput`) needs no change, because it saves no command
  attempt.

### `packages/fluxiq/src/runtime/tests/service.test.ts` (+78 lines, 2 cases)

- **"withholds the result payload from the attempt it keeps and saves when asked, while the caller
  receives it"**, run with `FileRuntimeStore`:
  - the caller's `result.payload` equals the rows the adapter returned;
  - the adapter's context has no `withheldResultPayload`;
  - `attempt.json` does not contain the synthetic text;
  - the saved `result.payload` is the marker, while the command, `message`, and the rest of the
    result are kept;
  - memory, `commandAttemptsList()`, and `snapshot()` all equal the saved attempt.
- **"withholds a payload beside withheld values, keeps one it was not asked to withhold, and adds
  none where none came back"** dispatches three commands:
  - flag plus withheld values: the marker replaces the payload and the withheld text inside
    `error`;
  - no flag: the payload is kept exactly;
  - flag with no payload returned: the attempt result has no `payload` property.

### `packages/fluxiq/src/programs/automation-studio/runtime/tests/io-policy.test.ts` (+48 lines, cases only)

- **"withholds the result payload of a dispatch that carries recordOutput, while the node's outputs
  keep the rows"**: runs through `createRuntimePolicyEffectDispatcher` and `RuntimeService` with
  `FileRuntimeStore`. The node result's `outputs.result` holds the rows, `attempt.json` does not
  contain the synthetic text, and the saved `result.payload` is the marker.
- **`it.each` "keeps the result payload of a dispatch with no recordOutput / a null recordOutput as
  the adapter returned it"**: the saved payload equals `{ rows }`.
- **Helper `dispatchSavedRecords(root, rows, extra)`**: a module-level function next to the file's
  other helpers. No new test file was added.

## Commands run and observed results

All commands ran alone, in `F:\!FluxIQ`.

1. `pnpm --filter fluxiq exec vitest run src/runtime/tests/service.test.ts src/programs/automation-studio/runtime/tests/io-policy.test.ts --no-file-parallelism`
   - Result: `service.test.ts (16 tests)` passed, `io-policy.test.ts (14 tests)` passed,
     `Tests 30 passed (30)`.
   - Before this change the files held 14 and 11 tests.
2. `pnpm --filter fluxiq check` (`tsc --noEmit`): no diagnostics, `exit=0`.
   - No failure appeared in other workers' files, so no rerun was needed.
3. `pnpm structure:check`: `structure-audit: passed (124 warning(s), 256 baselined).`, `exit=0`.
   - New advisory warning: `packages/fluxiq/src/runtime/tests/service.test.ts: 455 lines is past the 400-line advisory threshold`.
     It was 377 lines before; the threshold is advisory and the hard limit is 800.
   - `packages/fluxiq/src/runtime/service.ts: 461 lines` was already past the advisory threshold
     at 454.
4. Mutation 1, the runtime ignores the flag. In real source, the settle call was changed to
   `withheldResultPayload === true && false`. The same vitest command then reported
   `Tests 3 failed | 27 passed (30)`, and the three failures were exactly the new cases:
   - both new service cases (`expected '{ "attempt": …' not to contain 'synthetic-runtime-value-…'`
     and `expected [ … ] to deeply equal [ … ]`);
   - the io-policy recordOutput case (`not to contain 'synthetic-policy-value-…'`).

   Reverted. `git diff` of `service.ts` afterwards shows only the intended change.
5. Mutation 2, io-policy never sets the flag (`false && payload.recordOutput !== undefined …`). The
   same vitest command reported `service.test.ts (16 tests)` passing, which confirms mutation 1 was
   reverted, and `Tests 1 failed | 29 passed (30)`. The one failure was the io-policy recordOutput
   case (`not to contain 'synthetic-policy-value-…'`). Reverted. `git diff` of `io-policy.ts`
   afterwards shows only the intended 4 lines.
6. Final rerun of the vitest command after both reverts: `Tests 30 passed (30)`.
7. `node scripts/docs-reference.mjs --check` (not required by the brief; run to inform the
   supervisor): `Error: docs/reference/framework-reference.md is stale. Run pnpm docs:reference and commit the result.`,
   `exit=1`. See Open questions.

## Not verified

- Only the two targeted test files ran. The full fluxiq suite, `pnpm test`, and `pnpm build` did
  not run (the brief forbids them on this machine).
- No end-to-end run carried a real `recordOutput`, because `builtin.policy.action` does not emit one
  yet (K3/K4a).
- I did not establish whether `framework-reference.md` was already stale before this change. Other
  workers' uncommitted Core changes, such as `packages/contracts/src/record-sets/` and
  `_shared/password-kdf/`, may also make it stale. I did not regenerate it because I do not own it.
- The runtime's `command.result` event still carries the unwithheld result, payload included. It
  already carried the unwithheld `message` and `error`. I did not check whether any handler of that
  event saves it.
- No live browser or panel testing (not applicable to this unit).

## Open questions or contradictions found

1. **Documentation is now inaccurate. I did not change it because I do not own it.**
   `docs/architecture/package-boundaries.md:214-215` lists `result.payload` under "Not withheld".
   That is no longer true for a dispatch with `withheldResultPayload`. The contract bullet at
   `:190-193` should also name the new field and `FluxIQRuntimeCommandAttemptResult`. The generated
   reference needs `pnpm docs:reference`, because `contracts.ts` gained an exported type and its
   line numbers after `:150` shifted.
2. **K3/K4a must follow the presence rule.** When a policy action has no `recordOutput`, its effect
   payload must leave `recordOutput` out or set it to `null`. Any other default, such as `{}`, would
   withhold every dispatch's payload from saved attempts. That is harmless to callers, but it would
   change what `attempt.json` shows for ordinary actions.
3. **Presence versus truthiness** (see `io-policy.ts` above). If the supervisor prefers the report's
   truthiness test, the change is one expression, and the `it.each` null case still holds.
4. **Public type change.** `FluxIQRuntimeCommandAttempt.result` is now
   `FluxIQRuntimeCommandAttemptResult`, which is wider than before. Code that assigned
   `attempt.result` to a `FluxIQRuntimeCommandResult` would no longer compile. No such code exists in
   either repository, but the change is still public API and belongs in Migration Notes when K10
   records versions.
