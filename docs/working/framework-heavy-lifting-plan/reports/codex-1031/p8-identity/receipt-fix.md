# Receipt acceptance fix

Outcome: Done, subject to the lead's independent acceptance and browser proof.

The sixth browser result reached Core after 4,827 ms but was suppressed twice as `invalid_result`: its 353,656-byte full result exceeded the 256 KiB digest guard intended for small ledger records. The resulting `executor.required_outcome_unknown` correctly prevented an unsafe repeat. The evidence and timeout chain are recorded in `browser-outcome-debug.md`; no timeout or repeat guard changed.

## Change

The command ledger now has a separate canonical result digest. Intake and the actual required-outcome observer use the same full-result hash. Small command, claim, and receipt hashing retains its existing 256 KiB, 65,536-node and depth-64 guards. Canonical bytes for previously admitted values remain identical.

The shared traversal streams canonical tokens directly into SHA-256, sorts object keys as before, and visits arrays in index order. It rejects getters, non-data fields, symbols, sparse arrays, nonfinite numbers, unsupported values, nonplain records, cycles and excessive depth. It hashes every opaque payload field; neither a prefix nor a receipt-only projection is used. Receipt persistence still contains the digest and closed ledger facts, never the raw result.

Result hashing has no second arbitrary byte/node ceiling. The deployment's configured transport limit owns network admission. Direct in-process callers remain trusted admission boundaries and must supply admitted ordinary JSON data; this helper does not authorize unbounded external inputs. Traversal costs scale with admitted data and object-key sorting. Its call stack is bounded by depth 64, with temporary descriptor/key tables per traversed container and per-token string encoding, without accumulating a second complete canonical document.

Changed paths:

- `packages/fluxiq/src/client-gateway/service/command-ledger/canonical-digest.ts` — focused shared canonical traversal.
- `packages/fluxiq/src/client-gateway/service/command-ledger/result-digest.ts` — distinct full-result profile.
- `packages/fluxiq/src/client-gateway/service/command-ledger/controller.ts` — retains small-record limits through the shared traversal.
- `packages/fluxiq/src/client-gateway/service/command-ledger/dispatch.ts` — result intake uses the result digest.
- `packages/fluxiq/src/client-gateway/service/command-ledger/index.ts` — helper exports.
- `packages/fluxiq/src/client-gateway/service/command-ledger/tests/controller.test.ts` — canonical parity, complete mutation-sensitive large-data hashing, wide arrays, structural refusal and getter nonexecution.
- `packages/fluxiq/src/client-gateway/service/command-ledger/tests/dispatch.test.ts` — large successful and failed required results, exact receipt integrity, one commit/delivery and no raw persistence; obsolete arbitrary-size refusal replaced by a nonfinite JSON refusal.
- `packages/fluxiq/src/programs/automation-studio/runtime/service/command-run/controller.ts` — required observer validates with the identical result digest.
- `packages/fluxiq/src/programs/automation-studio/runtime/service/command-run/tests/controller.test.ts` — real SQLite required-observer success/failure regressions, one commit and receipt consumption.
- `docs/architecture/automation-studio/client-gateway.md` — digest ownership, full-payload integrity and admission/resource boundaries.

## Observed validation

`pnpm.cmd --filter fluxiq exec vitest run src/client-gateway/service/command-ledger/tests/controller.test.ts src/client-gateway/service/command-ledger/tests/dispatch.test.ts src/client-gateway/service/command-ledger/tests/dispatch-host-lease.test.ts src/programs/automation-studio/runtime/service/command-run/tests/controller.test.ts --maxWorkers=2 --minWorkers=1`

Initial run: exit 1; 61 passed, 1 failed across 62 tests, duration 73.62 s. Dispatch (21), host leases (7) and the actual required observer (21) passed, including both large-result outcomes. The single controller failure was the new wide-array assertion expecting `hash_structure_limit`; the preserved earlier own-field guard correctly returned `invalid_digest_fields`. Only that assertion was corrected after the run ended.

`pnpm.cmd --filter fluxiq exec vitest run src/client-gateway/service/command-ledger/tests/controller.test.ts --maxWorkers=2 --minWorkers=1`

Final observed controller rerun: exit 0; 13 passed, duration 1.65 s. All 62 focused tests are observed passing across the unchanged passing files and this final rerun. No production change followed the first run.

`pnpm.cmd --filter fluxiq check`

Exit 0, actual TypeScript check completed in 61,702 ms with no diagnostics. It ran serially after the final controller rerun.

## Remaining scope

No SDK/build, full suite, audit, browser, provider/API run, downstream edit, version, baseline, shared working-document or git mutation was performed. The lead owns independent acceptance, SDK/build and actual browser proof. All repeat, permission, durable-commit, sender, malformed-result, late/double-result and uncertainty protections remain in place. The old controller header incorrectly claiming production callers are unwired was left for the lead's comment-only correction because the typecheck was already reading source when requested.

Source and report are frozen. No check is running.
