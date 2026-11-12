# t911 runtime lease isolation
Role: heavy worker; gpt-6.1-sol, Max. No agents/git/shared-doc edits.
Root C:/Users/osrs_/FluxStuff/!FluxIQ, task/t911-runtime-lease-isolation (lead opened).
Goal: repair ambient cross-instance/cross-domain lease authority, preserving real ownership and stale-command refusal.
Read codex-p2c-continuation-intake.md Follow-up phase2 only, p2c-multi-runtime-design.md b3, then the exact named source/call sites.
First endpoint: write the stable instance-owner/domain/source interface and exact wiring paths in your own report, plus causal regression design. No production edits until lead accepts that interface. Adjacent causal tests may be written/run now.
Own report docs/working/fluxnode-plan/reports/codex-t911-lease-isolation.md.
Proposed source ownership below all under packages/fluxiq/src; may inspect exact callers to establish interface, request precise expansions before edits.
programs/_shared/runtime.ts; client-gateway/service.ts; client-gateway/service/{commands.ts,command-ledger/dispatch.ts,host-lease/source.ts,host-lease/stamp.ts}.
runtime/project-agents/{host-resources/lease-scope.ts,dispatch/host-lease.ts,dispatch/dispatcher.ts}.
framework/automation-service/service/{project-parts/run/driving-gate.ts,project-build/run.ts,runtime-session/page-held.ts,runtime-session/admission.ts,candidate-trial/run.ts}.
Adjacent tests for each named owner; owning barrels and new narrowly cohesive authority types/helpers only after exact paths are approved.
Must not touch other lanes, t902/private reports, t898 private note, result/input-owner paths, existing registry foundation, shared docs/versions or generated state.
service.ts main AutomationStudioService and framework/index.ts are read-only initially; request exact seam if actual ownership injection requires them.
Stable requirements: opaque per-instance owner capability, never a public/wire identifier; trusted target domain from ready session's server-bound trusted-client record, not mutable hello metadata.
One per-port capacity scheduler must remain shared where appropriate; scope association by owner+domain must not create independent schedulers that overbook a port.
Session-less strict leases affect their owning instance/domain only; explicit-session leases preserve prior behavior inside that owner. Foreign ambient leases must never stamp another owner/domain's command.
Do not use a domain-only filter: two Core instances with the same domain and distinct ports must remain independent.
Unknown owner/domain never fabricates authority or weakens stale/reissued lease refusal. Keep compatibility intentional and state its limits explicitly.
Both ordinary commands and durable dispatch must validate authority before send; durable refusal before ledger claim/write. Include admission and candidate-trial consumers, not gateway alone.
Keep existing single-runtime paths; no phase4 multi-runtime selection, browser/extension protocol change, whole-suite run, paid call or service process.
Required regressions: two real program-runtime/gateway instances same trusted domain; one owner two domains; explicit session preservation; wrong ambient owner/domain; stale/reissued grants; mutated/unbound metadata cannot override trusted domain; durable refusal leaves ledger untouched.
Use only adjacent narrow tests and affected package checks/structure audit after implementation approval. No source/dist writes during readers.
Heavy jobs through node C:/Users/osrs_/FluxStuff/fxwork/.tools/heavy-slot.mjs run t911-lease -- "<command>"; one job per lane. pnpm.cmd in PowerShell, pnpm inside coordinator bash.
Root owns final independent verification, package versions, shared plans and git. Report actual causal reds separately from code inspection; do not claim architecture assertions are observed behavior.
Return Outcome/Changed/Validation/Not verified/Report/Notes at each endpoint.

## Lead interface review, 2026-11-12

Legacy compatibility is approved as a separate discriminated owner-bound target source. Existing untagged ClientGatewayHostLeaseSource and requiresLease(sessionId:string) retain their exact invocation contract; target objects must never silently replace the legacy argument.
After recording the causal-red endpoint and revised interface, production release covers the report's authority/binding/lease-scope files and gateway source/stamp adapter plus adjacent tests. The physical port retains one scheduler; authority is per actual instance and domain, with stale matching frames refusing.
Durable ledger/controller/persistence expansion remains held for a concrete terminal known-unsent settlement design. An admission refusal after claim but before send cannot be misreported as send_uncertain, left as a dangling pending claim, or represented by a fabricated client receipt. Re-resolve ready/trust authority at the actual send boundary. Shared service wiring remains the t911 lane's ownership; t905 design must not edit it concurrently.

Terminal known-unsent settlement is approved for the exact additional paths in the revised codex-t911-lease-isolation.md report: gateway transport and command-ledger contracts/controller/private refusal; owning command-ledger persistence contracts/store/new migration/barrel; command-run wrapper; adjacent tests/fixtures. Preserve historical rows and immutable claims. Only actual private pretransport control flow establishes unsent; terminal same-id records never resend or create client receipts. A failed settlement cannot be reconstructed after restart from a pending claim or newly absent lease: retain the original live proof for retry, or reopen an actually committed refusal; otherwise continuation stays unresolved. Cancellation before send must retain its original semantics/reason. Unsupported custom ledgers refuse before claiming, never silently downgrade. Downstream authority readers also require migration before coherent integration; their checkout ownership is not released yet.
