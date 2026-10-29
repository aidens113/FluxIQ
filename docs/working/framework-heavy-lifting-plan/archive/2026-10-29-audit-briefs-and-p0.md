# Audit briefs and P0, archived 2026-10-29

Moved from `../../framework-heavy-lifting-plan.md` at its first compaction. The wave-2 audit ran 2026-10-28 and fed the
synthesis; P0 shipped in t793. Outcomes are in that document's Work Ledger.

## P0 phase text

### P0. Remove scenario-shaped model text (lead or Lane C, direct, before the lanes start)

- Files:
  - `llm/diagnosis-instructions.ts` (I171, I256 sentences listed in F0);
  - `llm/node-tools/run-node.ts:90`;
  - `flow-bootstrap/plan/evidence-schema.ts:115`;
  - `flow-bootstrap/plan/flow-script-format.ts:466,473` ("Garden Club");
  - the judge's membership example (to a non-membership relation, such as documents checked out from an archive).
- Contract: none.
- Tests: the existing text tests beside each file, plus a grep assertion in `llm/tests/` that the model-facing strings
  contain none of the realistic scenario names or their product words.
- Validation: the typecheck and `npx vitest run src/programs/automation-studio/runtime/llm/tests
  src/programs/automation-studio/runtime/flow-bootstrap/plan/tests`.
- Live: none on its own. It rides in the first round.
- Unit: `pnpm task start fhl-scenario-text` (Core-paired).

## Worker Briefs (wave-2 audit)

Shared for every wave-2 brief: read only; no source edits, git, builds, model calls or Lab runs. Root: packages/fluxiq/src/programs/automation-studio/. Context: the downstream fhl-core-surface and fhl-debug-notes reports. For every responsibility the model holds in the area, classify (a) needs a model, (b) Core could compute, enforce or default for any client (web, desktop, mobile, API), naming the generic contract the client supplies, or (c) client-specific. Cite file:line and debug-note step numbers. Report to docs/working/framework-heavy-lifting-plan/reports/<label>.md, under 250 lines.

### Brief: fhl-core-build-tools
- Area: the build/explore loop the model drives: runtime/llm (model-facing, node-tools, decision-handlers, decision-context, domain-instructions, stages, evidence-loop, harness), runtime/project-agents dispatch and single-subflow.

### Brief: fhl-core-grammar
- Area: plan and script grammar and submission checks: dsl/, runtime/flow-bootstrap (plan, script-statements, authoring, parameter-schema, parameter-words, answerability, reachability, instructed-acts, layer-handlers, subflow-candidate, verification, incomplete-draft, unfinished-build).

### Brief: fhl-core-trials-resets
- Area: trials, offline trials, witnesses, site-change readings and resets: flow-bootstrap (trial-change, offline-first, reset-*, site-reset, candidate), service (candidate-trial, offline-trial, subflow-trial, trial-ports, candidate-failure), llm/candidate-receipt. Evidence includes run-mvswhobv-5eb308c0.

### Brief: fhl-core-judging
- Area: judging and result verification, repair of refuted results: runtime/result-verification, llm/verification-defects, recovery/refuted-result; judge nondeterminism.

### Brief: fhl-core-runtime
- Area: runtime execution, retries, handlers and interruptions, target re-acquire, routing: runtime/executor, recovery (in-run-repair, exploration-state), route-state, parking, loop-limits, action-permissions, composite-execution, llm/repeat-guard.

### Brief: fhl-core-data-supervisor
- Area: datasets and post-processing, project supervisor and briefs, purse, chat/activity: service (datasets, scalar-readings, project-build*), runtime/project-agents (supervisor, amendment, record, stop-reason), llm (build-purse, purse, evidence-progress), runtime/activity, runtime/conversations.

### Brief: fhl-core-client-seam
- Area: the Core-to-client contract: client-gateway/, runtime/adapters.ts, contracts.ts, environment, io-bridge, panel-capabilities, fingerprinting/, plus how the downstream web domain implements it; where Core holds client concepts it should not.

