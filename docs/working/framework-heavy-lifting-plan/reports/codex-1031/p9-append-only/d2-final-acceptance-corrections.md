# D2 final observed acceptance corrections

**Source status: FROZEN.** All work in this brief is authored and ready for the lead's next gates. This is not feature acceptance: no tests, type checks, audits, builds, browser sessions, providers or git commands were run by this worker.

## Actual findings read

The paired Down `test-runs/t830-d23-{owning-tests,types,audit}.log` files were read. The owning selection ran **414 tests: 412 passed and 2 failed**. D2's real-loop file passed 68 of 69 cases; its actual service startup, authority, admission, most safety/accounting cases and the other selected Core regressions passed. The separate D3 JSON-proof fixture is owned by its worker.

D2's remaining floor case supplied `repeatSafe:true` together with a nonempty `permissionConsequences:["create_new"]`. The real resolved-effect reader correctly rejects that contradictory contract; the gate therefore threw before the intended ordinary dispatch. This explains the observed zero tool calls. The fixture now supplies the same lasting state floor without an invalid repeat promise. Core's reader normalizes its effective lasting class, the ordinary original remains permitted, and the existing **one original call/no batch** expectations remain unchanged. No permission, floor or oracle was relaxed.

The one type error came from importing the existing `automationStudioFlowDraftReplayClearedCode` from the wrong barrel. Its actual owner is `llm/node-tools/replay-draft.ts`, exported by `llm/node-tools/index.ts`; the helper now uses that existing export. No replacement constant or shim was added.

The two audit failures were the two assembly files at depth ten. The whole cohesive helper moved to `runtime/service/execution-authority/`, with its own barrel and a `service/index.ts` export. The service imports it through its existing owning-barrel import block. The old command-level export and empty directory were removed. Source inspection still reads **service.ts 4315 lines** and **evidence-loop.ts 799 lines**. No baseline, packing or comment deletion was used to meet these budgets. These counts are not a new audit pass.

## Required privacy and integrity hardening

`prior-nodes/batch-member.ts` now converts an unexpected rejection of `provenance.execute` to the same closed outward executor error used by the explicit private thrown-outcome path. The exact original exception remains in the private member failure slot and C's private error cause; it is not included in ordinary diagnostics, model history or the public loop result.

`prior-nodes/controller.ts` records a private terminal guard-loss flag when C returns `listRecord:"failed"`. Its future offer/admission paths are closed. `prior-nodes/loop.ts` publishes the closed stopped envelope after preserving actual member receipts/accounting, then returns the existing closed `llm_evidence_loop.tool_failed` failure immediately. It performs no next provider decision, tool call or completion. Actual earlier receipts, steps, quota and original stopping details remain intact.

New owning `failure-boundaries.test.ts` exercises both boundaries through the actual loop:

- An injected unexpected private execute rejection is observed at the real batch transport boundary as a different closed error. The test retains the **exact original Error object** in private C cause, asserts its sentinel is absent from model requests/public results, and preserves conservative unknown-main accounting.
- A private identity hash spy fails only on the list guard's second hash, its recording step. Scope/original hashing and the actual dispatch remain real. The test asserts one original plus one receipt-backed member, two tool charges, the C receipt retained, closed terminal failure, exactly two provider decisions and no completion/next decision. Its private failure sentinel is absent publicly.

No production test seam was added. C, D0, actual permission hooks, provider inputs, Root E, Down source, versions and baselines remain separately owned and unchanged by this brief.

## Changed paths

Paths below start at `packages/fluxiq/src/programs/automation-studio/runtime/`:

```text
llm/prior-nodes/batch-member.ts
llm/prior-nodes/controller.ts
llm/prior-nodes/loop.ts
llm/prior-nodes/tests/run-nodes-loop.test.ts
llm/prior-nodes/tests/failure-boundaries.test.ts
service.ts
service/index.ts
service/flow-bootstrap-commands/index.ts
service/execution-authority/create.ts
service/execution-authority/index.ts
```

The last two paths moved from `service/flow-bootstrap-commands/execution-authority/`; the old helper directory no longer exists. This report and the updated `d2-corrections.md` are the only document changes in this brief.

## Lead acceptance selectors

Focused final cases:

```text
pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/llm/prior-nodes/tests/failure-boundaries.test.ts src/programs/automation-studio/runtime/llm/prior-nodes/tests/run-nodes-loop.test.ts src/programs/automation-studio/runtime/llm/prior-nodes/tests/service-wiring.test.ts
```

The full owning selection remains `src/programs/automation-studio/runtime/llm/prior-nodes/tests`, alongside D3's corrected owning safety/provenance tests. The lead runs touched Core types and the structure gate, then existing affected ordinary-loop/rerun/withdrawal/stall regressions before SDK/paired/browser acceptance. No full suite or paid execution was launched here.

The actual corrected floor setup, two new boundary cases, import relocation, current type/audit result and paired behavior remain **unverified after this freeze**. No further known requested source correction remains; the feature is not represented as accepted or shipped.

Outcome: Done
Changed: the paths listed above and the two D2 reports
Validation: actual 414-test/type/audit lead logs read; no checks run after these edits by this worker
Not verified: final owning tests, current types/audit, affected broader regressions, SDK and paired/browser behavior
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/d2-final-acceptance-corrections.md`
Notes: Source frozen. Privacy and guard-loss boundaries are mechanically closed in source. Lead acceptance remains required.
