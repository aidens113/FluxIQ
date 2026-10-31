Role: Heavy worker; gpt-6.1-sol, max effort. Task t828 Phase1 public interface only.
Core root: C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQ.
Read Current State and core-plan.md in this report folder; its candidate shapes are now lead-frozen, including previousAttempt and place_unproved. Host planner acknowledged them.
Implement only the exact optional public types/flag and public exports, before Core/host implementation workers are dispatched.
Owned paths: nodes/contracts.ts (targetRefresh?:true only); new runtime/executor/parameter-refresh/{refresh,resolution,patch,index}.ts; new runtime/executor/unbound-reacquire/{request,answer,identity-record,identity-reason,index}.ts; runtime/host-runtime.ts optional method; runtime/executor/contracts/graph-execution-options.ts optional resolver; existing runtime/executor/index.ts and public automation-studio index.ts type re-exports only where needed.
Paths are relative to packages/fluxiq/src/programs/automation-studio/. One exported type per new leaf; barrels in both new directories. Use existing JsonValue/failure/state-ref types, no duplicated contracts or new package subpath.
Exact request/answer/refresh/resolution/patch/reason/identity-record shapes are in core-plan.md. DefinitionVersion is canonical string; host gets isolated snapshots later. Existing reacquireTarget request/answer stays untouched.
Do not widen the existing TargetReacquireRecord yet if it forces implementation/conversion changes; that remains Phase2. Export the new separate identity record type now.
Must not touch implementation/value helpers, existing source recovery, graph execution, registry validation, native runtime resolver, tests, version/package files, audits/baselines, shared Current State/Work Ledger, other reports, env/secrets/runtime state, Down sources.
No agents or git mutations. No checks/builds/tests/audits/browser/panel/provider/API calls. Lead verifies types and exports after source freeze, and owns version bump.
Full sweeps exhausted; future paid Claude/$5 held. Preserve all existing behavior and optional old-host compatibility.
Acceptance: exact optional interfaces compile through public export chain; no runtime values/new wire/old-call signature changes; report exact paths/line anchors and any blocker. Lead owns actual checks.
Only report edit: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/contracts.md.
End return contract: Outcome:Done|Partial|Blocked; Changed:exact paths; Validation:not run and why; Not verified:types/runtime/SDK/browser; Report:exact path; Notes:at most3 lines. Explicitly freeze source on return.
