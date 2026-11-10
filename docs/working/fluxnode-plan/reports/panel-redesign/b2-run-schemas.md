# P9-B2: run endpoint assistant declarations

## Outcome
Done, except the fluxiq typecheck (not run: memory).

## What changed
- Inputs in `packages/contracts/src/program-api/automation-studio/runs/`: flow-runs, flow-adaptations, runtime-sessions, run-datasets, activity, task-attempts, project-tasks (+ barrel, `tests/runs.test.ts`).
- `assistant` declarations on all 52 endpoints in the 13 handler files. Handlers' own payload reading is unchanged (schemas describe it, not adopt it), so existing behaviour is untouched. contextArgs fill projectId/flowId/runId/datasetId.
- Run endpoints `start-runtime-session`, `run-runtime-session`, `run-task-again` stay `per-call` via the overrides table (no `consequence` set). Everything else uses the derived class.
- Tests: `handlers/tests/assistant/run-example.ts` (shared fixture, `callAcceptedExample`) and `handlers/tests/assistant/tests/{runs,run-control,runtime-sessions,activity,runtime-execution,datasets,caches,task}-assistant.test.ts`. `caches-assistant.test.ts` also covers runtime-identity and known-flow hidden declarations; `task-assistant.test.ts` covers all four task handler files. Endpoints whose example names a missing run/table/task assert the handler refuses by what is missing, not as a bad request (review-flow-adaptation asserts "Unknown adaptation").

## Exposed / hidden per file
runs.ts 11/0; run-control.ts 3/0; runtime-execution.ts 3/5; runtime-sessions.ts 2/0; datasets.ts 6/0; activity.ts 1/0; caches.ts 0/12; diagnostics/runtime-identity.ts 0/1; task/attempt-carry-on.ts 1/0; task/attempt-run-again.ts 1/0; task/attempts.ts 2/0; task/known-flow.ts 0/1; task/project-tasks.ts 3/0. Total 33 exposed, 19 hidden.

## Hidden endpoints
- inspect-state-diff: internal state comparison for the editor.
- list-signal-registries: editor picker data.
- list-recording-domains: recorder-only list of event kinds.
- validate-recording-domain-event: recorder-only check.
- append-recording-domain-event: recorder appends events as it records.
- get/save/delete-project-ui-cache, list-project-ui-cache-stats: editor's saved layout/view settings (4).
- get-reusable-llm-context-status, list/get/put/delete-reusable-llm-context(s), clear-reusable-llm-context-scope, purge-expired-reusable-llm-contexts, pack-reusable-llm-contexts: model-context cache internals the runtime manages (8).
- runtime-build-identity: build check for test/release tooling.
- get-task-known-flow: chat looks up a repeated task's Flow by itself.

## Commands run
- Parity test: `npx vitest run src/programs/_shared/assistant/tests/assistant-parity.test.ts` -> fails as expected (others' groups remain); its automation-studio list contains none of my endpoints (checked the list: remaining are recordings, projects, conversations, client-gateway, etc.).
- Contracts `npx vitest run src/program-api` (singleFork) -> 10 files, 34 tests passed (incl. my runs.test.ts).
- My 8 assistant test files -> 7 passed, then datasets fixed (PIN stub) and re-run alone: 1 passed. Whole set 9 tests passing overall.
- Existing handler tests (runs, run-control, runtime-execution, runtime-sessions, datasets, activity, caches, cancel-runtime-session, domain-scope, router) + datasets-assistant -> 11 files, 63 tests passed.
- `node scripts/structure-audit.mjs` -> 2 FAIL, neither mine: `service.ts` 4305 lines (baseline 4304) and `handlers/tests/history/` has a test file beside its source. Both come from other workers' in-flight changes.

## Not verified
- fluxiq typecheck: not run, memory/lock (free memory 1.9-2.4 GB, need 3000). Supervisor to run. Risk spots: `declared.input.read` use in tests, `as any` in caches test, imports of the new inputs from `@fluxiq/contracts/program-api-inputs` (needs contracts build/path mapping to include the new exports).
- `run-runtime-session` test only checks the handler does not refuse the input as a payload error; the empty Flow's run outcome is not asserted.
- Other-worker vitest processes were using memory; one earlier run lost a worker ("Worker exited unexpectedly"), rerun passed.

## Open questions
- carry-on-task-attempt spends the person's money; I left the derived class (authoring under flows.write). Confirm it should not be `money`.
- `permittedConsequences` is deliberately not in `run-runtime-session`'s assistant input so the model cannot self-grant lasting actions.
