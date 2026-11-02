# Authenticated persisted-scope baseline seam
Role: Heavy worker; gpt-6.1-sol, Max. Critical data/authority change, no git/agents/shared docs.
Goal: allow real resource owners to supply original attestation to full SQL service; preserve conservative default/sticky unknown history.
Repo: C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ.
Read Current State, existing A1 ScopeOwner contract/lifecycle and actual A2 binding/controller/options/ports + SQLscope/open/state.
Stable lead API: add canonical ExecutionScopeAttestation {readonly owner:ExecutionScopeOwner;readonly proof:object} and ExecutionScopeAttestor {attest(persistedBinding:ExecutionScopeBinding):ExecutionScopeAttestation|null|Promise<...>}.
Own new contracts/scope/{attestation,attestor}.ts and scope/index.ts exports under runtime/execution-admission; no other A1 algorithm edit without reporting need.
Own Studio runtime/service/execution-admission/{binding,controller,ports}.ts plus cohesive narrow helper/adjacent tests. No whole service.ts or other barrels/package/config/baseline edits.
Root will add trusted constructor option executionScopeAttestor?:ExecutionScopeAttestor forwarded to controller ports scopeAttestor. NEVER accept owner/baseline/proof from model build request or per-open public DTO.
Controller pins actual attestor method+receiver at construction; default no attestor/null result stays original persisted-flow/project-unknown UNVERIFIED. Errors propagate with cleanup, no catch-as-proof.
Use actual persisted binding from Store.flowBinding first, then original attestor owner.readBinding+original opaque proof. Pin owner reader/receiver; reject copied/forged/foreign/stale proof or changed original reader result.
Attested projectId/ownerKey/continuationKey/coverageEpoch MUST equal actual persisted anchor. Actual resource owner may substitute its owned stable resourceKeys; no name/prefix/env/empty-journal/page/reset proof.
Keep same SQLscope identity and sticky previous-unverified/changed-resource/unlinked-command behavior. No epoch rotation or new series to escape pending/lost ACK/required history.
No fresh boolean/configbaseline option, no test-specific branch, no A1 private handle/data fields into model/native/host arguments, no second journal.
Add real isolated-resource owner fixture with private WeakMap original issued proof, actual owned resource lifetime; positive complete-native/noeffects scope can retest, unsupported default remainsunverified.
Negative cases: original proof copy/prototype/owner substitution; changed/foreign/epoch anchor; callback mutation; null/throw; reopen unknown/pending/lostACK unchanged despite complete attestation.
Coordinate private isolated shop owner contract with execution_architecture, who owns its actual reset fixture/native receipts; don't duplicate/edit their file.
Preserve all existing A2 SQL tests and required Context/ordinary proof semantics. Run focused new owner/controller + affected durability tests, source-closed strict, scoped structure/EOF. No full suite/build/provider/browser.
Source-freeze before handoff; Root integrates service option/public seam and independently verifies.
Own report: docs/working/runtime-ownership-refactor/reports/authenticated-scope-owner.md.
Return Outcome, Changed, Validation, Not verified, Report, Notes<=3 lines.
