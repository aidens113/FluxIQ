# R2 then R4 execution foundations

Role: Heavy worker, gpt-6.1-sol, max effort.
Goal: Extract actual environment/control/resources then compiled/composite execution implementations into framework owners.
Read: Current State of ../../runtime-ownership-refactor.md; reports/execution-foundations-plan.md; reports/router-gates-plan.md contract alignment note; Core boundary/code-structure rules.
Repository: paired Core checkout named by lead dispatch, not old t842 path.
R2 owned: Studio runtime/environment/**, runtime/run-control/**, runtime/project-agents/host-resources/**, runtime/project-agents/dispatch/host-lease.ts; canonical runtime/{environment,run-control,host-resources}/**; engine/automation/{environment,pacing/run-wait.ts}; corresponding focused tests/facades.
R4 owned AFTER R2 accepted: exact compiled-plan/composite/model-composites cuts listed in execution-foundations-plan.md; new flows/executable/compiled-plan and composite snapshot/validation/call, components/automation/composite, engine/automation/{compiled-plan,composite}; exact old facades and focused tests.
Must not touch: SDK/native/adapter/output-dispatch, state/recording/contracts package, model flow-adaptation authority, package exports, parent runtime/engine/flows/components/Studio barrels, _shared/runtime.ts, audit configs, shared docs/indexes, other worker reports.
Lead owns public exports/parent integration. Ask lead before shared contract edits; preserve single run-status authority (do not invent duplicate persisted status enum).
Follow capability/layer ownership; no runtime -> engine and no canonical -> Studio dependencies, including erased types.
Preserve exact class/function/scope identity, lease WeakMap and callback WeakSet authority. No wrappers that clone/proxy hosts or manufacture program envelopes.
Preserve all time/deadline/control/lease/graph/snapshot/composition/digest behavior and optional-undefined semantics.
Tests move beside owning subject, one exported thing per source file, barrels, no baseline increases/remaps.
Report R2 source freeze before R4 begins; no package-wide check/build while other sources change. Run only focused source tests during editing.
Acceptance: report's direct tests, identity/closure tests, no regressions to scheduler fairness/stale leases/abort/release/pause; R4 plan and nested-composite/digest tests.
No full suites, provider calls, git mutations or spawning.
Report: docs/working/runtime-ownership-refactor/reports/execution-foundations.md.
Return: Outcome; Changed; Validation exact observed commands; Not verified; Report; Notes <=3 lines.
