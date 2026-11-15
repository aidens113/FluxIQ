# Program identity authority separation

Status: implementation complete; focused tests passed.

Changed:

- `packages/fluxiq/src/server/program-route/identity-authority.ts`: new exported structural `ProgramRouteIdentityAuthority` with minimal `validateSession(sessionId)` and `snapshot()` identity methods.
- `handle-program-request.ts`: optional `ProgramRouteContext.identityAuthority`; absent, it retains the original instance identity. A valid panel cookie is validated by the explicit authority ahead of bearer authentication. Ordinary paired clients use the selected data instance's gateway token check and the authority's current owner directory. Managed-host authorization retains its existing leased-run authority and restrictions. Data IO, IAM calls, endpoint/classification allowlists, secret presentation and domain/project checks remain on `context.fluxiq`.
- `index.ts`: exports the new port type through the existing public program-route barrel.
- `present-panel-session.ts`: documents that callers must validate auth through a trusted authority and that its FluxIQ argument selects the only key store reached.
- `tests/identity-authority.test.ts`: 12 focused cases for distinct platform/data identities, valid cookie precedence, revoked sessions, body actor/session spoofing, paired owners missing/disabled/roleless, allowlisting, domain/project refusal, authority failures and existing single-instance defaults.

## Integration API

```ts
await handleProgramRequest(request, {
  fluxiq: selectedWorkspaceLease.fluxiq,
  identityAuthority: platformFluxIQ.programs.identityAccess,
  webRuntimeStatus: scopedRuntimeStatus,
});
```

Only trusted server code constructs this context. The caller must independently authenticate and verify workspace membership/binding before selecting/acquiring the tenant, retain that lease through the response lifetime, and release it afterward. No actor or authority is read from HTTP JSON. The authority validates who the caller is; the tenant registry continues deciding what that actor may do in that workspace. This API does not replace credential-to-workspace routing.

## Key presentation semantics

Traced `programs/secret-keys/runtime/unlocks/credential-unlocks.ts:presentPanelSession` -> `presentCredential`: it uses the selected service's store and existing holder records, bound to session digest and authenticated user. Ordinary panel presentation does not request the `verified` option, so it does not mint/enroll a new holder when no record exists, and a mismatched credential cannot open a stored generation. The handler passes only the authority's validated user id/session expiry with the actual cookie to the selected tenant. It never copies platform identities/sessions/keys. Tenant login/password proof, holder enrollment, revocation fan-out and privileged handlers that themselves validate local sessions remain integration work; no web migration or hosted login completion is claimed here.

## Validation

`pnpm.cmd --filter fluxiq exec vitest run src/server/program-route/tests/identity-authority.test.ts src/server/program-route/tests/handle-program-request.test.ts src/server/program-route/tests/program-route.test.ts`

Observed: exit 0; 3 files passed, 90 tests passed (12 new identity-authority cases, 59 program-route cases, 19 existing real-SQL handler cases), duration 74.19s. No package-wide build/check, server, browser or paid call.

Not verified: web request workspace selection, real multi-tenant credential routing, tenant key enrollment, hosted deployment, package-wide typecheck/structure validation.

Outcome: Done
Changed: server/program-route/identity-authority.ts, handle-program-request.ts, index.ts, present-panel-session.ts, tests/identity-authority.test.ts; own report.
Validation: `pnpm.cmd --filter fluxiq exec vitest run src/server/program-route/tests/identity-authority.test.ts src/server/program-route/tests/handle-program-request.test.ts src/server/program-route/tests/program-route.test.ts` -> exit 0; 90 passed in 3 files.
Not verified: web routing, tenant key enrollment/revocation, package-wide checks and deployment.
Report: docs/working/hosted-platform-launch-plan/reports/program-authority.md
Notes: Optional server-only identityAuthority port preserves existing consumers. Tenant remains the gateway/data/IAM/key target. No web/runtime/git edits.
