# Dedicated tenant route adapter and program directory
Role: standard/security worker, existing gpt-6.1-sol configuration; no delegation/git/shared-doc edits.
Goal: implement the first complete routing unit from tenant-route-completion-discovery.md: trusted actor/lease adapter plus actual GET /api/programs migration.
Own: new apps/web/src/lib/workspaces/routes/** and adjacent tests; lib/workspaces/program-context.ts, index.ts, tests/program-context.test.ts; app/api/programs/route.ts and new programs/tests/route.test.ts. Own report tenant-route-adapter-implementation.md.
Read: plan Current State; your routing discovery report; existing workspace selector, Core program-route auth helpers, app-route-iam and nearest tests as needed.
Must not touch: Core packages, contracts, other routes, lib/fluxiq.ts, source outside ownership, other reports/docs/git. Do not change IAM policy grants.
Reuse workspaceProgramContext and add trusted workspaceId from the acquired lease; no alternate tenancy resolver. No primary customer-data fallback in service mode.
Adapter must preserve current channel precedence, primary identity, current role/IAM, immutable user/workspace/client/domain binding and idempotent release. Reject unsupported channels before token lookup/acquire. Cookie-bearing service requests never fall through to bearer.
Start with real panel directory use. Shared interface should support future paired callers without inventing auth: derive them only from the selected gateway + trusted primary identity. If needed keep paired support explicitly unavailable until its concrete route unit; explain before freezing.
Expose request-bound revalidation; no raw actor/context from JSON. Recheck after awaits and before sensitive response/mutation; a fresh role may narrow, never a new tenant/client target. Handle abort/refusal/throw without leaking leases.
Directory remains panel-only studio:ListPrograms with current service IAM refusals, existing domain query and programDirectorySchema. Do not make ordinary-user list permission broader.
Tests: two tenant instances with same resource ids, primary never read, cookie A+bearer B, invalid service cookie, panel-only token denied before acquisition, membership/default changes, user/session/IAM revoke, abort/error/serialization release; local/self-hosted parity.
Freeze returned actor/binding/revalidate/release API in report before later lanes. Stream handoff belongs to the later assets owner; do not fake stream support.
Work against immutable current Core dist. A separate contracts worker prepares app schemas; coordinate before running guarded web tests. No builds, full suites, servers/browser/providers. Signal source stable; lead coordinates dependency build and your narrow tests.
Acceptance: source implementation + meaningful owner tests, then scoped web unit command/type probe after lead fresh signal. Report exact outcomes/limits and standard return contract.
