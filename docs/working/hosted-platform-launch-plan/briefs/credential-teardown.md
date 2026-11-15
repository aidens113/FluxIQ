# Credential-only hosted teardown
Role: Heavy worker, existing connect_service configuration.
Goal: Implement truthful hosted self-forget/revoke without active-user/content authority or tenant resurrection.
Own: apps/web/src/lib/workspaces/workspace-manager.ts, create-tenant.ts and their adjacent tests; apps/web/src/server/connect/revoke.ts and adjacent owning tests; new server/browser-trust/teardown/**; app/api/client-gateway/forget-pairing/**; report credential-teardown.md.
Must not touch: shared context/selection/route guards/IAM matrix/proof classifications, Core package source or dist, other routes, shared documents, git, other reports.
Read: remaining-gateway-mutations report Self-forget section and actual manager creation/deletion/lease owners; existing credential repository/gateway revocation contracts.
First: propose exact no-create acquisition interface and deletion fence from actual code before implementation; wait for root approval. If other files are needed, name them before editing.
Required: credential proof selects only its ordinary trust; no active account/socket requirement, no caller-supplied tenant hint; retain local behavior and existing revoke void API.
Use actual serialized gateway revoker and scoped durable store. Invalid/inactive/already-revoked/nonapplicable proof is idempotent boolean; persistence failures fixed503, never fake success.
No-create must coordinate cold tenant opening and deletion, including deletion between precheck and acquisition; ordinary acquire after renamed precheck is insufficient. Do not introduce second persistence engine.
Return result-bearing shared teardown helper used by forget and existing revoke. Root handles exact route proof classification/matrix integration after interface freezes.
Acceptance: offline/disabled user; current/previous/obsolete/inactive/forged proof; cold existing tenant; deletion races with no directory recreation; own trust only; repeat and save failure; no content disclosure; release once after work settles.
Run narrow owning tests/scoped types only after root stable-consumer signal; no full suites/build/browser/network/account/provider operations.
No default unlock/lock/password ceremony. No token values in logs/report.
Report standard contract and source-frozen signal before lead acceptance.
