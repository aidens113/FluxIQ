# P9/P10 current-tree discovery

Read-only comparison against the t829 Core tree. This is a discovery report, not a defect claim; no checks or builds were run.

## P9 — append-only evidence and batched re-runs

- **Already implemented:** `runtime/llm/context-window.ts:16-35, 113-120` retains all evidence, replaces superseded view content with references and documents byte-prefix caching; `decision-context/view-groups.ts:1-19` groups top-level and holder-member views. `evidence-loop/tests/request-prefix.test.ts:92-125` asserts replaced-view references and byte-prefix behavior; `llm/decision-context/tests/view-groups.test.ts` and `llm/tests/context-window.test.ts` cover the existing components.
- **Still outstanding from P9:** no `llm/node-tools/run-nodes.ts` or `llm/node-tools/tests/run-nodes.test.ts` exists. The tool barrel (`llm/node-tools/index.ts`) exports single-node, Flow and part runs, but no identical-parameter batch operation. `llm/evidence-loop/tool-execution.ts:117` carries `routeState` as an object; no changed-key projection was found in the named request path. No evidence found for a callable-only `core.submit_subflow` schema variant. The specific fixed trailing block that retains the whole current view and current read rows is not established by the existing general view replacement mechanism.
- **Recommended next bounded unit:** implement `run_nodes` in `llm/node-tools/run-nodes.ts`, export it from `llm/node-tools/index.ts`, and add `llm/node-tools/tests/run-nodes.test.ts`; keep the stable seam as a batch over existing registered-node execution with identical inputs, stopping on failure or changed result code. Focused command: `pnpm --filter @fluxiq/fluxiq test -- <runtime>/llm/node-tools/tests/run-nodes.test.ts` (confirm exact package test script before dispatch). In a following serial unit, change request projection/schema owners only after tracing their callability contract; add prefix/replacement assertions to `llm/evidence-loop/tests/request-prefix.test.ts` and the owning context-window test.

## P10 — client concepts out of Core

- **Still present in named generic owners:** `flow-bootstrap/plan/flow-script-format.ts` embeds `web.*` node ids in the model grammar/examples; `script-statements/fact-condition.ts:56,88-95` parses the client-shaped `dialog` fact; `plan/contracts.ts:34,125` includes `web.facts@1` and a dialog target. `script-statements/way-out-steps.ts:82-83` matches a consent dialog. Other named owners retain web-specific issue/result codes (for example `service/candidate-trial/feedback.ts:12-13`, `llm/repeat-guard/outcomes.ts:271`, `llm/harness/locator-text.ts:28`). No generic client binding seam or structure-audit rule enforcing absence of `web.` literals was found in the named runtime owners.
- **Not established by this bounded read:** plan-listed `model/action-element-target.ts` and `fingerprinting/element-fingerprint.ts` were not at the runtime-root paths supplied by the plan; their current owner paths need discovery before briefing that subunit.
- **Recommended next bounded unit:** split P10. First define/freeze the format vocabulary seam, then own `flow-bootstrap/plan/flow-script-format.ts`, `flow-bootstrap/plan/tests/flow-script-format-generic.test.ts`, and the contract/binding file that supplies node ids, medium words and examples; assert the web binding reproduces current prompt semantics. Focused test: `flow-bootstrap/plan/tests/flow-script-format-generic.test.ts`. A separate follow-up can move typed issue/fact vocabulary across `plan/contracts.ts`, `script-statements/fact-condition.ts`, `script-statements/way-out-steps.ts` and their colocated tests. Add the no-`web.` source audit only after the split owners are migrated, with its audit-rule test. These are remaining design/implementation tasks, not evidence that present web behavior is broken.

## P8 typed-effect subitems requested for cross-check

- The lasting-act `commit` class is already wired: `executor/defensive/lasting-act.ts` checks `actionEffect.effectClass === "commit"`; `executor/defensive/tests/lasting-act-client-floor.test.ts` asserts it outranks authored safe/observe/none claims and keeps ambiguous failures from retrying blindly.
- Step-skip typed effects are already wired: `executor/step-skip/act-not-done.ts` reads a validated resolved effect and treats `commit` as a lasting act; `executor/step-skip/tests/act-not-done-effect.test.ts` covers commit/state/observe, malformed effects, and conditional/unresolved bindings. These typed-effect subitems appear implemented and tested; this report does not assess other P8 items.

Outcome: Done
Changed: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-repeat-history/next-phases-discovery.md`
Validation: not run; discovery-only brief forbids tests/builds/audits
Not verified: P8 runtime-repeat/history/client behavior; live, provider-backed and full-suite behavior; exact package test command
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-repeat-history/next-phases-discovery.md`
Notes: No source or shared working document changed. No provider calls, agents or panel management used.
