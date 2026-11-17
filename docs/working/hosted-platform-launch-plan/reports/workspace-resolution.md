# Workspace resolver hardening

Outcome: Partial (implementation complete; focused tests blocked before collection by stale Core build)

Changed:

- `apps/web/src/lib/workspaces/session-workspace.ts`: service selects the oldest active membership only after verifying that its workspace record exists; primary membership is excluded. A dangling older membership no longer creates a tenant root or hides a later valid workspace. Platform/session/store errors propagate before acquisition. Single tenancy continues returning the primary for a valid session without requiring platform membership records.
- `apps/web/src/lib/workspaces/tests/web-workspaces.test.ts`: existing positive fixtures now write actual workspace records. Added integration coverage for no membership, primary/dangling/removed memberships, selection past a dangling membership, deletion after an earlier successful lease, membership/workspace lookup failures, and absent/invalid/revoked sessions. Negative paths assert that manager.acquire is never called; revoked sessions also assert no membership lookup.

Validation:

- `pnpm --filter @fluxiq/web exec vitest run src/lib/workspaces/tests/web-workspaces.test.ts src/lib/workspaces/tests/workspace-manager.test.ts src/lib/workspaces/tests/tenant-eviction.test.ts` -> PowerShell refused pnpm.ps1 because script execution is disabled; no tests started.
- `pnpm.cmd --filter @fluxiq/web exec vitest run src/lib/workspaces/tests/web-workspaces.test.ts src/lib/workspaces/tests/workspace-manager.test.ts src/lib/workspaces/tests/tenant-eviction.test.ts` -> exit 1 before collection: web Vitest config refused stale Core dist, naming `packages/fluxiq/src/platform/provisioning/email/index.ts` as newer than compiled output. This belongs to the lead's concurrent mail work. No bypass, build, package typecheck or server was attempted per brief. Lead was notified to coordinate rebuilding after source edits settle.

Not verified: focused tests/runtime/typecheck/structure audit; missing platform-services composition itself is not covered by this batch. No claim of full C2/C3 completion.

Report: docs/working/hosted-platform-launch-plan/reports/workspace-resolution.md

Notes: No auth/session copies, primary fallback, account-status rule, source files outside ownership or git changes. Lead must rebuild libraries and rerun the exact focused test command before acceptance.
