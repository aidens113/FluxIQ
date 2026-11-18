# Buffered program authority revalidation

Implemented the frozen optional
`ProgramRouteContext.revalidateAuthority?: () => Promise<boolean>` in the Core
program handler. Guarded requests refresh authorization while retaining the
original caller binding. Unguarded local/single-instance requests keep their
existing single-pass behavior. The existing barrel already exports the
context; no barrel change was needed.

Changed only:

- `packages/fluxiq/src/server/program-route/handle-program-request.ts`
- Its `tests/authority-revalidation-fixture.ts`
- Its `tests/authority-revalidation.test.ts`
- This report.

## Boundary enforced

- Initial paired endpoint-name/classification preflight still precedes the
  guard and gateway token inspection. A cookie caller validates through its
  trusted identity authority and runs the guard before tenant key presentation
  or body work. A paired caller runs it before gateway authorization.
- A successful guarded request checks three times: initial authentication,
  refreshed authentication after body/project-domain awaits, and immediately
  before dispatch after the refresh's own awaits. A false guard returns 401.
  Guarded authority exceptions return a generic 503 and log only a fixed
  message/rejection kind, never exception text or credentials.
- Refresh stays within the initially authenticated channel. Revoking a valid
  cookie cannot switch to a supplied bearer; a bearer request cannot switch
  to a cookie that becomes valid while its body is pending.
- The refreshed caller must retain its user and session, domain, trusted
  client, client id/type, current project and managed-host binding. Managed
  run predicates captured before the await are checked again, including their
  original run/resource/lease epoch. Changed authority refuses instead of
  selecting a new identity or project.
- Current role/permissions apply to an otherwise unchanged caller. Paired
  permission intersection, allowlists, projections, request narrowing,
  project-domain enforcement and managed scope remain in place. The owning
  gateway still enforces current/previous/obsolete credentials and ready
  sessions on each authorization; root proof is not substituted for that call.
- Refresh does **not** present panel credentials again. It reads identity and
  permissions only, so membership/identity changes during body processing
  cannot open a new or stale tenant key holder before the final refusal.
- The guard is captured from trusted context before body work. A body field
  cannot replace it or alter the context's identity authority.

## Observed validation

- `pnpm.cmd exec vitest run src/server/program-route/tests` from
  `packages/fluxiq` on the existing suite after the initial change -> 4 files,
  92 tests passed, including 19 real-SQL registry/storage route cases.
- Focused new/identity tests -> 42 passed at the first new-test checkpoint.
- Final `pnpm.cmd exec vitest run src/server/program-route/tests` -> **5 files,
  124 tests passed**, including all **32** new revalidation cases. Owner run
  completed before the source-stable signal to the lead.
- No-emit TypeScript compiler-API probe via
  `node --max-old-space-size=4096 --input-type=module`, using the package
  tsconfig and all owned program-route roots -> `Program-route roots: 13;
  owned diagnostics: 0; other imported diagnostics: 0`.
- The first type probe found two fixture return-type mismatches:
  `Promise<void>` deferred domain checks were supplied to a mock inferred as
  `Promise<undefined>`. The fixture now explicitly declares `Promise<void>`;
  production behavior was unchanged by that correction. Final edits used the
  existing client-gateway barrel for type-only imports.

New tests hold asynchronous body/domain work while revoking session,
membership guard, token, owner or role, and while changing session/trust/client
type/domain/project binding. They also cover fresh restricted permissions,
both channel-switch directions, unavailable endpoint preflight, initial and
late guard rejection, sanitized guard exceptions at every checkpoint,
one-time key presentation, absent-guard compatibility, managed run/host/epoch
changes and an epoch changed by the final async guard. Refused cases do not
dispatch the program endpoint.

No builds, web tests, full suites, servers, paid/provider calls, runtime-state
or git operations were run by this worker. The lead owns the shared rebuild
and combined web/contract/service validation; source and owner tests were
declared stable for that work, with no later source edits.

## Remaining dispatcher assumptions

These are explicit checkpoints, not an authentication transaction or lock
held through a running operation. The web composition must keep the selected
tenant lease alive and make the guard check current membership/account/session
and unchanged root browser binding. Core's refreshed actor and existing
registry/IAM layer still decide the actual endpoint. A policy change after
the last check or during an already-started operation is not made atomic or
cancelled by this hook. Global runtime state and non-program HTTP mounts are
outside this bounded change.

Outcome: Done
Changed: Owned Core handler, two adjacent focused test files and this report.
Validation: Owner-local Vitest -> 5 files/124 tests passed; focused no-emit type probe -> 13 roots, 0 owned/imported diagnostics.
Not verified: Shared build, full package/structure checks, lead web integration or live browser behavior.
Report: `docs/working/hosted-platform-launch-plan/reports/program-authority-revalidation.md`
Notes: Source/tests stable for lead rebuild. Frozen optional guard preserved. No other source owners, git or runtime data touched.
