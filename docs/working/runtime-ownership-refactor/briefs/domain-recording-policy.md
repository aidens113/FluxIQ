# Trusted recording policy registry and downstream implementation
Role: Heavy worker, gpt-6.1-sol Max; no agents/git/shared documents.
Repos: paired t843 Core and downstream. Execute only after Root releases this brief.
Read Current State, reports/scoped-recording-validation-plan.md and your prior domain-target-hooks report.
Stable Root types: runtime/recording/target-policy/{policy,binding,index}.ts; RecordingTargetPolicy extends existing RecordingTargetValidationPolicy<unknown>, plus accepts(value):value is unknown and commandTarget(JsonObject):unknown. Binding pins original receiver plus four original methods.
Stable SDK: bundle.recordingTargetPolicy?; manifest.recordingTargetPolicyRequired?:true (deny-only trusted registration requirement). Pure public subpaths target-policy, recording/validation, client-gateway/recording/decoding are saved.
Own Core runtime/native-execution/target-preparation/** and its immediate tests, native-node-runtime.ts only for existing registry composition. Own Down domain/src/target-normalization/**, output-nodes/native-runtime.ts, actual registered manifest requirement and immediate/public-parent tests.
Must not touch Root SDK/types/package/config/Service/start/capture/ingress/model validators, other workers' SQL/secrets/log files, baselines or shared working docs.
Extend EXISTING instance registry: reader.policy(domainId) returns pinned original binding; reader requiresRecordingPolicy(domainId) reports registered manifest requirement even if implementation is absent. Do not invent a second scope store.
Stage requirement and policy atomically with existing output/recording hooks before SDK mutation; commit only after SDK accepts. Original object+method identity is idempotent, conflicting receiver/function/requirement fails without partial registration.
Read optional hooks/policy and policy methods only through original own data descriptors; reject accessors without invoking them. No partial map changes on any malformed fourth method or callback conflict. No blanket pure/managed declaration.
Move ACTUAL Studio ingress outer target guard into Down, preserving scalar selector, bounds/position/visualTarget/metadata and original inner is/validate checks. Use pure public decoder shapes, no Core-private import.
Compose actual Down recording policy with the already migrated complete target/parameter validators and original generic command-target envelope encoding. Preserve original warning/error codes/messages/paths and null semantics; no reduced DTO or relaxed decoder.
Install this original policy through the real Down bundle and set the registered web recording policy requirement. Do not infer domain from target/URL/wire metadata.
Root owns authenticated scope selection, locked raw-entry validation, generic scoped ingress and deleting final Core browser validators AFTER active callers migrate. Leave old Core guard in place until that integration.
Acceptance: original outer guard and validation parity; original four callback/receiver identity, independent domains, all four accessor refusals0getter calls, conflict atomicity including existing hook maps, required-without-implementation, identical re-registration, SDK duplicate failure leaves registry unchanged.
Browser bundle public policy0Node; source-local tests clearly distinguished from normal guarded Core builds. Coordinate source freeze before readers; no full suite/provider/browser/panel/runtime data.
Write own reports/domain-recording-policy.md; precise commands/results/unverified integration; standard return contract.
