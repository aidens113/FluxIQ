# t910 runtime bundle registry

## Implementation

Added the internal `runtime/automation-runtimes` foundation and one ownership-table row. Existing service and framework entrypoints are untouched; this does not enable multi-runtime execution.

`AutomationStudioRuntimeBundles` owns immutable domain/runtime metadata and copied provenance. Returned registered views preserve the evidence, host and native-node implementation identities. Lists are frozen and fallback-first. Runtime lookup preserves unclaimed-runtime compatibility until an explicit fallback runtime is set.

The fallback slot supports validated property setters and `rebind(patch)` for atomic updates involving related evidence/IO/domain members. A rejected update leaves previous slots and registry claims intact. Related domain changes must use one rebind instead of an invalid intermediate state. The fallback slot object is stable, so previously retained fallback views read current members after rebinding.

Registration validates the whole candidate set before publication: domain/runtime collisions (including fallback claims), evidence/IO/native-pack domain mismatch, host/native-node identities shared across owners and runtime syntax are refused. A single owner may use one implementation object for both host and nodes. Outer input mutation cannot alter registered metadata. Mutable evidence claims, fallback IO claims and native-pack manifest additions are revalidated before selection and on retained-view property reads. This is validation at registry boundaries, not containment of trusted code: an implementation reference already extracted from a view cannot be revoked by the registry. Fallback provenance is also screened/copied/frozen before initial binding or a successful rebind; malformed replacement provenance prevents the entire patch from applying.

Per lead approval, `AutomationStudioRuntimeFallbackGuard.run(projectId, operation)` is a project-authority guard primitive for later service call-site wiring. It does not proxy unscoped host methods or invent project identity. With no additional bundle it invokes the operation synchronously on the original fallback, without lookup or object wrappers. In multiple mode explicit null means known global; undefined/empty identifiers, unknown lookup results and failed lookups cannot dispatch. A project in a registered domain is refused. Lookup returns string = known domain, null = known global, undefined = unknown/missing project. Claims are checked again after asynchronous lookup.

## Validation history

- `node C:/Users/osrs_/FluxStuff/fxwork/.tools/heavy-slot.mjs run t910-registry -- "pnpm --filter fluxiq exec vitest run src/runtime/automation-runtimes/tests"`
  - First attempt: 1 suite failed during collection and 1 test failed; 7 passed. Native-node test implementation fixtures omitted required package identity. Fixed only fixture construction.
  - Second attempt: same collection/test failures because fixture version `1` was not accepted as a package semver. Changed manifest and implementation fixture versions together to `1.0.0`.
  - Third attempt: 18 passed, 1 failed. Duplicate-domain case also carried mismatched evidence/native-pack domains and reached that earlier refusal. Made its fixture domains agree so the test isolates collision refusal.
  - Fourth attempt: 3 files passed, 19 tests passed, duration 5.13s.
  - After lead review fixes: 3 files passed, 22 tests passed, duration 5.81s. Added regressions for fallback provenance, same-owner dual-role implementation, independent fallback IO claim and clearing an explicit fallback runtime.
  - After audit-directed fallback directory move and accessor formatting: 3 files passed, 22 tests passed, duration 4.22s.
- `node C:/Users/osrs_/FluxStuff/fxwork/.tools/heavy-slot.mjs run t910-registry -- "pnpm --filter fluxiq check"`: first attempt failed on new registry `exactOptionalPropertyTypes` assignments because cleared slots and snapshots explicitly carry undefined. Corrected those new types; no unrelated-source or stale dependency failure was observed. Second attempt passed, command exit 0, actual check 17.432s. Third attempt after final file moves passed, command exit 0, actual check 15.813s.
- `node C:/Users/osrs_/FluxStuff/fxwork/.tools/heavy-slot.mjs run t910-registry -- "node scripts/structure-audit.mjs"`: first attempt reported 3 new violations: fallback filename family needed its own directory; fallback accessors and a registered-view getter packed two statements per line. Moved the family to `fallback/` with its barrel and expanded the getters. Final rerun passed: `structure-audit: passed (544 warning(s), 916 baselined).` It also noted one baseline entry can be lowered; baseline is lead-owned and was not changed.

No full suites, package builds, browser tests, paid calls or server processes were started. No git mutation was performed.

## Return contract

Outcome: Done
Changed: packages/fluxiq/src/runtime/automation-runtimes/**; docs/architecture/runtime-ownership.md (one row); this report.
Validation: focused new-directory tests -> 22/22 passed; `pnpm --filter fluxiq check` -> exit 0; `node scripts/structure-audit.mjs` -> passed (all commands through the required heavy-slot coordinator, as recorded above).
Not verified: service routing, multi-runtime execution, host leases, provider request equivalence, browser behavior or downstream integrations; all outside this phase.
Report: docs/working/fluxnode-plan/reports/codex-t910-registry.md
Notes: Final source frozen for lead acceptance. No public export or existing entrypoint was changed. Lead owns git, shared docs/index and any baseline update.

## Lead acceptance

Final independent `pnpm --filter fluxiq exec vitest run src/runtime/automation-runtimes/tests --maxWorkers 1 --minWorkers 1` -> 22/22 in 5.75s; package check -> exit 0, 14.928s; structure audit -> passed 544 warnings / 916 baselined, combined exit 0. Final package version 0.49.0. Log TEMP/fluxiq-lead-t910-registry.log. No public API export, runtime routing, browser execution, full sweep or publication claimed.
