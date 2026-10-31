# P8 phase 1 — frozen optional observer interface

The additive interface is implemented and frozen for lead validation. No execution behavior was changed.

- `runtime/runtime-repeat/observation.ts` exports `AutomationStudioRuntimeRepeatObservation`, exactly the accepted union: observed/complete/resource/target none-or-identified-key/viewDigest, or unavailable with missing/partial/unreadable/unsupported reason.
- `runtime/runtime-repeat/observation-input.ts` exports `AutomationStudioRuntimeRepeatObservationInput`, extending the existing action context with before_action/after_action, required accepted stateRef and optional AbortSignal.
- `runtime/runtime-repeat/index.ts` exports both types.
- `runtime/host-runtime.ts` imports and publicly re-exports those types, and adds optional `observeRuntimeRepeat(input): observation | Promise<observation>`. All imports crossing the host/types cycle are type-only. The existing runtime barrel already exports host-runtime, so it required no edit.

Comments specify private tokens, accepted-capture reuse with no extra action/capture, positive relevant coverage/resource/subject identity, and no permission/effect/retry authority. Snapshot refs, summaries, traces and model contracts received no fields. Absent/unavailable hosts retain their existing path.

The behavior contract remains the accepted core-guard-plan.md: prospective third identical logical visit stops before dispatch only after two completed unchanged comparable visits; pure-only/skip-only cycles retain existing protections. No guard, retry, receipt, identity recovery, permission, cancellation or skip implementation was edited here.

Read back every added declaration and the exact changed host-runtime import/member sections. No checks were run under this phase's gate. Lead owns version 0.21.0, combined history/interface validation and subsequent implementation dispatch.

Outcome: Done
Changed: runtime/runtime-repeat/{observation.ts,observation-input.ts,index.ts}; runtime/host-runtime.ts; this report
Validation: not run (phase 1 explicitly forbids checks/builds/audits)
Not verified: compilation, structure audit, combined history compatibility or runtime behavior
Report: C:/Users/osrs_/FluxStuff/fxwork/t829/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-repeat-history/core-interface.md
Notes: Interface frozen. No package/generated/shared-doc/git/browser/API/panel changes. Available for phase 2.
