# Buffered program authority revalidation

- Role: heavy worker, gpt-6.1-sol, max. No agents/git.
- Goal: keep a buffered program request bound to the same authenticated caller while refreshing authorization after awaited input/domain work.
- Own only: packages/fluxiq/src/server/program-route/handle-program-request.ts, adjacent focused tests and existing program-route barrel if required; own reports/program-authority-revalidation.md.
- Read Current State, reports/http-routing-discovery.md, owned handler and relevant adjacent tests. Locate helpers as needed; ask before editing other owners.
- Must not touch web, gateway/transport, identity implementation, shared docs, other reports/repos or runtime state.
- Frozen additive public seam: ProgramRouteContext.revalidateAuthority?: () => Promise<boolean>, trusted composition only; absent preserves local behavior. Lead web context supplies it and owns tenant selection/lease.
- Call guard before processing and after awaited body/project-domain work immediately before dispatch; false fails closed, unexpected exceptions remain sanitized. Never let request body supply or replace the guard.
- Refresh authenticated caller before dispatch, retaining the selected channel, user/session/domain/trusted-client/managed-run binding. Authority change refuses rather than switching identity; current permissions apply for the same identity.
- Preserve endpoint-name/classification preflight before token inspection, allowlists, narrowing/projections, managed run scope, current/previous/reuse behavior and no-live-session refusal. Do not broaden bearer permissions.
- Tests must hold async body/domain work and revoke session/membership guard/role/token during that hold; prove no dispatch and no cross-channel fallback. Include optional guard absent local compatibility and guard exception sanitization.
- Run only owner-local program-route tests and focused types; no full suite/build/web tests. Lead rebuilds once all Core edits settle.
- Keep source scope cohesive; report exact tests and any remaining dispatcher race assumptions. No fabricated lock guarantee across a running operation.
- End with Outcome/Changed/Validation/Not verified/Report/Notes.
