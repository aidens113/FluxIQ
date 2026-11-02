# Recording gateway capture and IO ownership

Role: Heavy worker; model gpt-6.1-sol; effort max. No agents or mutating git.
Goal: execute gateway/IO lane B in reports/recording-extensions-plan.md; actual state machines/projection, no duplicated store.
Read relevant Current State and report sink/start/ingress contracts, gateway/IO cut and acceptance.
Stable Root contracts now on disk: runtime/recording/sink/** and client-gateway/recording/policies/**.
Consume those original authorities; request any contract change before editing them.
Own new client-gateway/recording implementation leaves and runtime/recording/io/** plus their feature barrels.
Own old programs/automation-studio/client-gateway/**, runtime/io-bridge.ts and immediate subject tests.
Own exact IoRegistry registered-input-output-binding descriptor/lookup/projection method/helper slice in io/index.ts and focused tests.
Descriptor returns original inputDefinition, actual binding and normalized registered outputId; lookup never calls projector or dispatch.
Refactor current resolver through this same lookup; projector runs exactly once, unregistered output remains an explicit refusal.
Only registered action binding is executable; state/unmapped/definition-only input stays passive, including late-discard telemetry.
Own Studio adapter feature runtime/service/recording-sink/** (depth compliant), not service/recordings/** owned by mapper lane.
Must not touch native runtime/SDK binder, mapper/review/recipe, state indexing, permission, candidate/LLM/trials, engine or output producers.
Must not touch service.ts, _shared/runtime, package/root barrels/shared docs/git; lead integrates their seams.
Keep one active/closed/pending-start lifecycle and write-order owner; no second store/observer/journal.
Preserve original pending barriers before await, trusted owner keys, scoped refusal, stop/new-start races and no stale ack.
Preserve 250ms drain,32closed owners,25ms/50entry enqueue/100entry batches and original grouping/order defaults.
Resolved start policy address is final; untrusted request fields cannot override it after policy approval.
Studio adapter preserves exact host/client description/project precedence and original direct-call versus wire errors.
Sink read failure is explicit unavailable, not absent recording; only successfully read endedAt allows late discard.
Background spliced-batch failure is observed/sanitized and never silently retried, empty success or raw payload/error logs.
Durable executeAction still stops original Context on capture failure and propagates failure.
Use exact rich shared session/entry/state contracts and explicit ingress decoding; no fake snapshots or raw casts.
Retain immediate original recording bridge/order and IO integration oracles; add canonical in-memory-sink mechanism cases.
Add project override, unmapped/state/definition-only/mapped loss, projector-count/refusal and awaited/background failure cases.
Run focused owned tests, strict/erased closure and scoped structure; no package/fullsuite/build/provider/browser/panel.
Report reports/recording-capture.md; freeze source and return Outcome, Changed, Validation, Not verified, Report, Notes(max3lines).
