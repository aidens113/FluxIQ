# Actual browser required-outcome failure

Outcome: Done. Read-only investigation identified the receipt rejection; no source, check, browser, API or runtime-state mutation was performed for this investigation.

## Proven cause

The browser returned a real failed `web.target.not_found` result on time. Core rejected the whole result while applying the small command-ledger hash's 256 KiB limit to its opaque snapshot payload. No required receipt was accepted, so Core correctly held the command as outcome unknown and refused a second click.

The sixth safe diagnostic records:

| Observation | Value |
| --- | --- |
| Actual click result | failed; `web.target.not_found`; retryable true |
| Arrival after send | 4,827 ms |
| Serialized result size | 353,656 bytes |
| Result nodes | 12,195 |
| Gateway receive errors | 0 |
| Durable decisions | `suppressed/invalid_result`, twice |
| Executor ending | `executor.required_outcome_unknown`; ambiguous; retryable false |

The 353,656-byte result exceeds the 262,144-byte hash ceiling; its 12,195 nodes are below the separate 65,536-node ceiling. Other actual snapshot replies were approximately 352–394 KB. This is a legitimate result shape already carried by the browser channel, not a missing browser acknowledgement, an act that was repeated, or evidence that an unknown act was unacted.

## Causal chain and source ownership

1. `!FluxIQWebExtension/apps/extension/src/content/action-runtime/results.ts:587` builds the failed page result. Lines 611–615 attach a snapshot to every non-succeeded result even when ordinary snapshot capture is disabled, so diagnosis retains the page on which the action failed.
2. `!FluxIQWebExtension/domain/src/client/browser-result-mapping.ts:19` maps that result to the gateway envelope, including the complete result payload and structured failure. `domain/src/client/gateway-mapping.ts:349` carries its snapshot. The extension sends the mapped envelope in `apps/extension/src/background/connection/server-command-channel.ts:344`.
3. Core `packages/fluxiq/src/client-gateway/service/inbound.ts:151` reads the durable result, then `service/commands.ts:147` forwards it to durable settlement. A diagnostic observing socket arrival precedes this acceptance, so an arrival alone never proves receipt acceptance.
4. `service/command-ledger/dispatch.ts:94` computes `Controller.digest(input)` and parses the result inside one catch boundary. The shared `ClientGatewayCommandLedgerController.digest` in `controller.ts:12` has `HASH_LIMIT_BYTES = 256 * 1024`, plus structural limits. Its canonical traversal already updates SHA-256 incrementally, but its byte guard rejects this result. The catch reports only `suppressed/invalid_result`.
5. No `entry.resolve({ result, receipt })` occurs for that rejected result. The answer/reconciliation window eventually closes without an accepted receipt. A repeated attempt to accept the same oversized result is rejected by the same gate; the sixth trace proves two invalid-result suppressions but does not separately identify which was the original versus a reconciled replay.
6. The required transport returns unknown when durable dispatch is not completed (`packages/fluxiq/src/runtime/client-gateway-transport.ts:68`). Downstream's required dispatcher similarly preserves durable outcome_unknown (`domain/src/io/gateway-output-dispatcher.ts:35`). The executor's receipt check replaces an unreceipted issued effect with `executor.required_outcome_unknown`. This protection is correct and must remain.
7. Required receipt observation independently re-hashes the complete result in `runtime/service/command-run/controller.ts:152`. Fixing only the gateway intake hash would leave this second small-record ceiling in the completion observer and still fail required execution.

The exact small-record byte exception was not separately printed, because the intake deliberately collapses digest and parse failures into its closed invalid_result diagnostic. The measured size, the canonical producer's JSON encoding, the explicit byte guard and the observed suppression establish the mechanism. No payload content, identifier, token or browser state is included here.

## Timeout propagation and effect omission

The test's policy wrapper declares a 10,000 ms timeout. The normal Core runtime-policy dispatcher passes `payload.timeoutMs` into the runtime command (`runtime/io-policy.ts:112`), and `runtime/client-gateway-transport.ts:209` forwards the command's timeout to the gateway. The downstream adapter also forwards a positive command timeout (`domain/src/runtime/adapter.ts:106`); `domain/src/io/gateway-output-dispatcher.ts:34` puts it on the gateway command. The client mapper prefers `command.timeoutMs` and falls back to `parameters.timeoutMs` (`domain/src/client/gateway-mapping.ts:204`), so a separate inner parameter is unnecessary on this normal path.

The gateway's answer window is command timeout plus the shared 3,000 ms answer margin (`client-gateway/service/command-ledger/dispatch.ts:193`, `service/command-answer-margin.ts`). Runtime bounds allow that window plus the shared 15,000 ms reconcile allowance (`runtime/service.ts:386`, `service/command-reconcile/allowance.ts`). Content recovery waits for missing targets at 250/500/1,000/2,000 ms, within a 5,000 ms recovery budget and the action's base deadline (`apps/extension/src/content/action-runtime/recovery/budget.ts`). Its last honest page result is returned when recovery is spent.

The observed 4,827 ms arrival is comfortably inside the declared 10,000 ms target budget and the 13,000 ms gateway answer window. A timeout increase cannot repair an otherwise identical 353,656-byte envelope that this hash refuses. The exact per-command timeout was not printed in the safe log, so the source-described route is distinguished from a direct measurement of that field. The IO-only fallback route has different timeout plumbing and should not be generalized from this normal runtime route.

The absent producer `failure.effect` is expected: `domain/src/runtime/failure/codes.ts:342` defines target-not-found with category, retryable and target_resolution stage, but no optional effect. Its builder at line409 copies effect only if the table supplies one. `domain/src/runtime/host-failure/annotate.ts` preserves this valid original and does not invent unacted. Core `executor/defensive/assess.ts:215` already derives fault.effect unacted from target_resolution/target-not-found when no effect was stated. Receipt rejection occurs before this normal assessment; there is no need to fabricate an effect or weaken uncertainty handling.

## Smallest structural repair

Use a dedicated exact canonical result hash for opaque gateway results, and use it both in durable intake and required observation. Keep the existing small claim/request/receipt hash and all its 256 KiB/65,536-node guards unchanged. Share the canonical traversal rather than maintain two subtly different encoders; preserve object-key ordering, array ordering, primitive encoding and SHA-256 bytes for previously admissible values.

The deployment's transport/platform payload admission owns the configurable inbound byte limit. Result hashing must not add another arbitrary opaque-result byte or node ceiling that rejects a legitimate page after it acted. Retain plain JSON, own enumerable data-property, symbol/accessor/prototype, cycle and bounded-depth protection, and stream the full canonical result. Do not allocate an additional complete encoded-result buffer, persist raw data in the ledger, hash a prefix, omit snapshots, or project the receipt down to status/failure fields. A receipt-only projection would no longer bind the evidence the executor consumes and would change integrity semantics.

Direct in-process callers of the public receive API are responsible for the same input-admission boundary as their transport; they are trusted integration code, not permission to accept arbitrary getters, cycles or unsupported objects. The result-hash operation remains synchronous work proportional to admitted JSON size and bounded depth. Actual incoming network caps remain deployment-configurable rather than copied into a new hashing constant.

Keep session, command binding, exact result digest, committed receipt, observer provenance, late/double answer, cancellation and unknown-outcome protections. Unknown stays unknown whenever no valid receipt can be committed.

Exact intended ownership:

- `packages/fluxiq/src/client-gateway/service/command-ledger/`: shared canonical traversal plus a separate result-hash entry, intake use, focused exports and owning controller/dispatch tests.
- `packages/fluxiq/src/programs/automation-studio/runtime/service/command-run/controller.ts`: replace only the completion.result hash with that same result-hash entry. Claim and receipt hashes remain small-record hashes.
- Nearest observer regression if necessary: `runtime/service/command-run/tests/controller.test.ts`.
- `docs/architecture/automation-studio/client-gateway.md`: document exact result integrity, separate small-record versus result admission and resource behavior.

Required regression: actual required-observer succeeded and failed result envelopes above 256 KiB commit exactly one matching receipt and deliver once; mutating opaque payload data changes the result digest; malformed/accessor/cyclic/nonplain values still refuse; wrong session, late/double answer, observer/commit refusal and cancellation remain protected. Replace the old arbitrary 300,000-byte refusal expectation with a genuinely malformed result. The existing small-record oversized-input regression must continue refusing.

Future narrow selectors, after the separately authorized repair freezes:

```powershell
pnpm.cmd --filter fluxiq exec vitest run src/client-gateway/service/command-ledger/tests/controller.test.ts src/client-gateway/service/command-ledger/tests/dispatch.test.ts src/client-gateway/service/command-ledger/tests/dispatch-host-lease.test.ts --maxWorkers=2 --minWorkers=1
pnpm.cmd --filter fluxiq check
```

No checks were executed for this investigation. The lead subsequently authorized a separate implementation brief; that work and its checks belong in `receipt-fix.md`.

Outcome: Done
Changed: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/browser-outcome-debug.md` only
Validation: not run (read-only investigation; safe fifth/sixth logs and owning source inspected)
Not verified: repaired behavior, actual receipt commit after repair, browser success after repair
Report: `C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/browser-outcome-debug.md`
Notes: Timely legitimate failed result rejected by small-record hash; uncertainty guard correctly held. Dedicated full-result hashing must be used by both intake and observer. No source or guard changed in this investigation.
