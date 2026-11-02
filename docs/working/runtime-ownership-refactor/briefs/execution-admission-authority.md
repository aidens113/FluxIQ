# Neutral execution admission authority

Role: heavy worker, gpt-6.1-sol, Max.
Goal: implement API proposal sections 2-3 neutral contracts and actual private authority mechanism (A1 only).
Read reports/execution-admission-api.md and Current State; interface blocks are the stable consumer/persistence contract.
Own new packages/fluxiq/src/runtime/execution-admission/** including immediate tests.
Own only reports/execution-admission-authority.md outside source.
Must not touch Studio/storage/gateway, engine, native/IO, agents/candidate, other runtime owners, manifests, shared docs, config or git.
Lead owns public exports/parent integration. A2 durable SQL/command bridge follows this verified contract.
Split declarations by responsibility, one exported authority per file and barrels; no big contracts dump.
Implement actual configured private WeakMap membership, closed registration, exact original-source/origin/evidence ownership, single-use grant/evidence, lifecycle/race/cancellation handling.
Preserve method receivers; synchronously consume original private evidence before any await and freeze verified record before persistence.
Forward all durable mutations through exact persistence port; no pretend in-memory production journal, result/status parser grant, or fake clear fallback.
Absent adapter yields unverified/no repeat credit; do not silently default-deny every legacy first invocation.
Persistence failure after entry leaves durable coverage open; release/abort never seals it.
No retry exemption or production candidate wiring in this unit.
Add focused tests using a meaningful deterministic persistence fake with mutation-order/failure controls.
Cover copied/prototype/JSON/cross-owner handles, repeated proof/grant/evidence, closed registration, consume-before-await, races, aborts, required/unknown and persistence failure.
Test real source-owned original proof/evidence registries; structurally equal JSON must earn nothing.
Run scoped tests and strict isolated typecheck; no full check/build/suites/providers/browser/panel/user data.
First freeze exact contracts and send readiness; report missing design facts before changing the stable interface.
End source frozen with exact commands/results and unverified SQL/producer/candidate integration.
Return Outcome, Changed, Validation, Not verified, Report and at most three Notes lines.
