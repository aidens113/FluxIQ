# Recording Stop and failed-append address races

Outcome: Done. SOURCE FROZEN; all owned readers ended.
Dispatch: [recording-stop-address-race.md](../briefs/recording-stop-address-race.md), plus Root's explicit diagnostics/state-forwarder release.

Changed six source slices under `packages/fluxiq/src/client-gateway/recording/`:
- `lifecycle/stop.ts`, `lifecycle/client/stop.ts`: capture the original ref and address before awaiting; finalize that address; remove/remember only if the exact original active ref/address remains current. An older Stop cannot delete a newer same-ID or same-address ref, or replace Q's newer closed row.
- `lifecycle/remember.ts`: compare project plus recording ID (null/undefined workspace address equivalent); retain the original same-address counter row, upgrading `finalizedAt` only after genuine finalization.
- `writes/outcome.ts`: retain the append's original address and sender refs before IO. A failed P append is classified only after the actual addressed read confirms finalization; Q's current active/closed refs are never adopted by ID. Retained original P counters remain P's.
- `diagnostics/discard.ts` and only `internal/state.ts`'s `noteDiscardedClientMessage` forwarder: optional internal original closed-row argument reports/increments an older addressed row without replacing the current owner's slot. Existing calls and argument count remain unchanged.
- New `tests/stop-race.test.ts`: 12 real MemoryRecordingSink/gateway cases, controlled held acknowledgments, unchanged original receivers, finalize tuples, and primary append error identity. Covers host/client P-to-Q active/closed races, same-address fresh refs, counter retention/finalization upgrades, and held P append with Q active/closed with/without retained P counters.

No new map, generation authority, wire field, policy, gateway timing change, fabricated write, or snapshot was introduced. Client wire project fields remain unable to redirect the owned finalize address. Existing lifecycle/write-failure behavior remains covered by the original tests.

Reproduction and validation (commands from Core unless stated):
- RED, before source fixes: `pnpm.cmd exec vitest run src/client-gateway/recording/tests/stop-race.test.ts` from `packages/fluxiq` -> 10 failed / 2 passed, exit 1, 5.01s. Failures showed Q/fresh ref deletion, wrong-project retained rows, missing genuine finalized upgrades, and P append diagnostics charged to Q/lost P counters. The two already-passing Q-closed Stop cases remain asserted.
- GREEN, same new subject and all original oracles -> 12/12 passed, exit 0, 5.00s.
- `pnpm.cmd exec vitest run src/client-gateway/recording/tests/lifecycle.test.ts src/client-gateway/recording/tests/address.test.ts src/client-gateway/recording/tests/failure.test.ts src/client-gateway/recording/writes/tests/order.test.ts src/client-gateway/recording/writes/tests/failure.test.ts src/client-gateway/recording/writes/tests/batching.test.ts` from `packages/fluxiq` -> 6 files / 22 tests passed, exit 0, 5.44s.
- `node .fluxiq/refactor/recording-stop-race-closure.cjs` -> all seven selectors' actual erased source graph: 485 inputs, zero Programs/Engine inputs, exit 0. Full barrels retained; no aliases/overlays bypassed. Canonical validation leaves were explicitly confirmed frozen by Root. An initial multi-entry probe needed esbuild's `outdir`; corrected only the ignored probe, then passed.
- `node .fluxiq/refactor/recording-stop-race-preservation.cjs` -> exact shared-state bytes outside the authorized forwarder unchanged; seven owned files, zero whitespace/EOF findings, exit 0. Manifest: `.fluxiq/refactor/recording-stop-race-owned.json`.

Independent lead acceptance, package-wide typecheck/structure/build, paired downstream checks, browser/provider checks: not run by this worker; parallel-source boundary and brief prohibit broad validation. No git actions. Root owns integration.
