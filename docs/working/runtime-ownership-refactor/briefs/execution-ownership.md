Role: Heavy worker; model gpt-6.1-sol; max.
Goal: Implement full executable graph/kernel ownership move in your approved architecture report.
Owned new (under packages/fluxiq/src): engine/automation/**, runtime/automation-host/**,
runtime/repeat/**, runtime/reference-time/**, runtime/parking/**, runtime/activity/**,
flows/executable/** EXCEPT scope.ts, validation/**, root index.ts (lead integrates barrel).
Owned old Studio: runtime/executor/** + executor.ts, runtime/host-runtime.ts,
runtime/runtime-repeat/**, runtime/reference-now/**,
runtime/composite-execution/{boundary,child-bounds}.ts,
runtime/flow-version/{contracts,flow-graph-version}.ts,
runtime/flow-change/node-adaptation/{contracts,ids}.ts,
runtime/route-state/observe.ts + signatures/{effect,host,node,value}.ts,
runtime/parking/** EXCEPT ask.ts+ask-effect.ts+conversation-port.ts,
runtime/run-control/types.ts, runtime/project-agents/host-resources/types.ts,
runtime/activity/**, model/{artifacts,composites,regions,flow-adaptation,flows}.ts.
Must not touch git/shared docs/package exports/config/root barrels/SDK/matcher/other node source. No agents.
Read AGENTS/CODEX + plan Current State + your execution-architecture report; implement its exact cut.
Scope extraction in model/flows.ts is complete; coordinate node worker before editing it.
Canonical source cannot import Studio even type-only; compatibility facades point toward framework.
Move all executor behavior intact; preserve symbols/wire, retry, reacquire, lifecycle, privacy/safety/partial-run invariants.
Extract ExecutableGraph contracts and DTOs into flows/executable; full Studio artifacts structurally assign.
Move host DTOs out of executor to invert host/engine type cycle. No host -> engine dependency.
Keep repository-backed project editing, persistence, conversation adapter and presentation wording in Studio.
Activity: closed runtime hub/context, presentation port per-run/scoped, no global mutable callback registry.
Canonical runner works with no UI. Legacy classifier behind host port, conservative when absent.
Parking ask DTO/effect builder owned node worker runtime/interaction; consume those canonical ports.
Matcher worker owns nodes/importer-sdk.ts; create automation-host/log.ts and ask them to reexport canonical log DTO.
Move tests alongside subjects, add compatibility/closed-dependency coverage; no old test copies.
Ask lead for exact additional paths if closure requires it. Lead owns external consumer import retargeting.
Run focused executor/support tests only once source stable, typecheck only after all workers source-stable.
No broad suites, paid/browser/panel work. Report early progress and integration requirements.
Report docs/working/runtime-ownership-refactor/reports/execution-ownership.md.
End Outcome/Changed/Validation/Not verified/Report/Notes contract.
