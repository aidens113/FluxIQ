# Approved-client access backend implementation
Role: heavy worker, gpt-6.1-sol, max; no delegation/git/shared-document edits.
Goal: remove default client custody lock and implement durable authenticated host protection, not just UI suppression.
Read: Current State; your authenticated-client-access report; code-structure rules.
Own: packages/fluxiq/src/programs/secret-keys/** (including tests and API), except no unrelated restructuring.
Own new protector primitives under platform/custody/protection/** if needed; report backend-access-implementation.md.
Must not touch: contracts, shared runtime callers, _shared/runtime.ts, web, extension, deployment, other reports.
Frozen wire: per-key availability ModelKeyAvailability from @fluxiq/contracts/platform: {state:"available"} | {state:"unavailable",code:"legacy_recovery_required"|"host_protection_unavailable"|"ciphertext_invalid"}.
Lead owns contracts/parser/UI re-export. Remove snapshot locked clients/tickets and active unlock ceremony; retain old public read compatibility only where necessary.
Implement your reported context-bound host-wrap port and matching current/pending seal writes, migration from legitimate material, independent authenticated enrollment, no panel-logout client lock, no first_unlock/lift gating.
Service constructor accepts explicit host protection/store identity and current-use authority port; send exact signatures to lead before callers are changed.
Preserve owner/workspace offers, secrets:UseKey vs reveal/manage distinction, real revocation, token rotation, strict persistence-before-publication and provisional approval rollback.
Do not solve crypto recovery with user/session identifiers; inaccessible old ciphertext gets honest recovery status.
No arbitrary same-user session search; exact approved own-session delegation allowed. Password change must not leave valid clients partially authenticated.
Tests: provider-free service/API ownership, restart, approval-before/after-key, logout independence, revoke, malformed/cross-store/user/seal wrap, pending seal and failed write behavior.
Run narrow source tests only; no builds or whole suites while other workers edit. State any tests needing rebuilt dependencies.
No source outside owned paths without asking; return changes, exact checks, remaining integration dependencies.
