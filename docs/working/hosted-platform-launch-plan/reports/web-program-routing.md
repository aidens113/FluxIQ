# Web program tenant routing

Outcome: Partial (implementation complete; focused tests blocked before collection by stale Core build).

Changed:

- `apps/web/src/lib/workspaces/program-context.ts` and barrel: `workspaceProgramContext(source)` selects a held program data instance. Single tenancy acquires the primary and retains its existing presenter and bearer path. Multi tenancy requires a platform cookie resolved through `sessionWorkspaceId`, hence an active membership in an existing nonprimary workspace; it acquires that tenant and supplies primary identity through Core's explicit `identityAuthority` port. Platform lookup errors propagate before acquire. Service contexts omit `webRuntimeStatus`, which still reads primary state.
- `apps/web/src/app/api/programs/[programId]/[endpoint]/route.ts`: reads the cookie store once, resolves the program context, refuses unresolved callers with 401, and releases its buffered-response lease in `finally` on success, refusal, handler errors and serialization errors. It no longer dispatches service requests on primary.
- `apps/web/src/lib/workspaces/tests/program-context.test.ts`: selection/authority/presenter policy, local legacy path and service missing/invalid cookie, missing/removed/primary/dangling membership and lookup errors.
- `apps/web/src/app/api/programs/[programId]/[endpoint]/tests/route-tenancy.test.ts`: actual web route plus actual context helper and Core handler, mocked platform/tenant dependencies; verifies selected tenant actor/dispatch, no primary context, cookie precedence, refusal before acquire, and lease cleanup on handler/session errors and invalid POST body. Revocation between selection and handler revalidation is covered explicitly.
- Existing `route.test.ts`, `route-domain-gate.test.ts`, `route-drain.test.ts` and `route-serialisation.test.ts` mocks now expose a single-workspace manager, retaining their original test behavior through the new context acquisition seam.

## Explicit service limitation

Service bearer-only program calls remain unavailable until a verified browser credential-to-workspace router exists. No gateway scan, request workspace hint or primary dispatch is used as a substitute. A valid cookie selects its own tenant even alongside another tenant's bearer. The context includes `acceptBearer: false` for service, and the web route passes no bearer to Core in that case: if the cookie is revoked between initial tenant selection and Core's identity revalidation, Core must refuse rather than fall back to a token. Local/self-hosted single tenancy keeps `acceptBearer: true` and its original paired-client authentication/domain checks.

The helper returns `{ context, acceptBearer, release } | null`. Null is an authentication/workspace refusal; storage/lookup errors remain errors. The route's response is buffered text today, so `finally` safely releases after response construction. Future streaming adapters must extend lease lifetime to stream completion/cancellation.

## Validation

`pnpm.cmd --filter @fluxiq/web exec vitest run 'src/lib/workspaces/tests/program-context.test.ts' 'src/app/api/programs/[programId]/[endpoint]/tests'` -> exit 1 before collection. Web config refused stale Core output, naming `packages/fluxiq/src/platform/keys/runtime/create-key-session-service.ts` newer than compiled output. No tests executed; no stale-guard bypass/build attempted. Lead was notified to run the focused tests after coordinated library rebuild.

No package-wide tests/checks, builds, servers, browser or paid calls were run. No source outside the brief was edited.

Not verified: focused runtime tests, package typecheck/structure checks, service bearer credential routing, tenant-scoped runtime presentation, real browser behavior, other tenant-sensitive routes, tenant key enrollment/privileged session checks.

Report: docs/working/hosted-platform-launch-plan/reports/web-program-routing.md

Notes: No git changes. Core authority/source and lead-owned key-session/API-key code untouched. Existing single-root tests must pass after the batch rebuild before acceptance.
