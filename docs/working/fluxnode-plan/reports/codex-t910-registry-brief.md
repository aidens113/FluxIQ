# t910 runtime bundle registry
Role: standard worker; gpt-6.1-sol, medium. One bounded phase, no agents/git/shared-doc edits.
Root C:/Users/osrs_/FluxStuff/!FluxIQ; lead opened task/t910-runtime-bundle-registry. No other source writer/reader in this checkout.
Goal: implement phase1 registry from docs/working/fluxnode-plan/reports/p2c-multi-runtime-design.md.
Read design b1, fallback guard paragraph in b4, phase1, relevant current types, and docs/architecture/code-structure.md only.
Owned source: new packages/fluxiq/src/runtime/automation-runtimes/** (bundle/view/fallback/registry/validation/guard and adjacent tests/barrel).
Owned authored doc: docs/architecture/runtime-ownership.md one precise registry ownership row, explicitly foundation until service integration.
Own report: docs/working/fluxnode-plan/reports/codex-t910-registry.md.
Must not touch service.ts, framework/index.ts, existing runtime entrypoints, host leases, package versions, shared plan/index/ledger, other lanes or private data.
No new public package export or runtime routing yet. Lead owns subsequent integration; no claim of multi-runtime execution from registry tests.
Preserve fallback member object identity and synchronous no-bundle selection; compatibility mode accepts unclaimed runtime only without explicit fallback runtime.
Reject duplicate runtime/domain (including fallback), evidence/node domain mismatch, shared host/nodes identities; validation must not partly register invalid bundle.
Fallback guard in multiple mode refuses registered other-domain project use; no guard wrapper or lookup on single-runtime path.
Use a narrow injected project-domain lookup port for guard tests; no storage/domain coupling. Missing/unknown authority must not route a registered-domain project to fallback.
Do not store credentials/private values or add provider/browser dependencies. Consider mutation-after-registration aliasing and fallback rebind invalidation explicitly.
If mutable fallback API cannot safely preserve registration invariants, report precise proposed interface before widening scope.
Acceptance: causal focused tests for all refusals, object identity, compatibility/strict runtime lookup, guard domain isolation, registration atomicity, and mutation/rebind invariants.
Run only new-directory tests, pnpm --filter fluxiq check, node scripts/structure-audit.mjs; no full suites, browser, paid calls, servers or package builds.
Heavy commands through node C:/Users/osrs_/FluxStuff/fxwork/.tools/heavy-slot.mjs run t910-registry -- "<command>"; one queued/running job per lane.
Freeze source throughout each reader; announce final freeze for lead independent acceptance. Use pnpm.cmd in PowerShell (pnpm inside coordinator bash).
Report exact commands/results and failed attempts, then Outcome/Changed/Validation/Not verified/Report/Notes.
