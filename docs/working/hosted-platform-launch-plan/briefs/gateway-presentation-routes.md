# Selected gateway presentation routes
Role: Heavy worker, gpt-6.1-sol max; retain configured worker for followup.
Goal: Migrate gateway snapshot and Automation Studio context to held tenant/caller authority and new presentation owner.
Own: apps/web/src/app/api/client-gateway/snapshot/** and automation-studio-context/** only; report gateway-presentation-routes.md.
Must not touch: lib/fluxiq.ts, presentation foundation, workspace route helpers, shared matrix/fixture, Core libraries, other gateway routes, docs/index, git/builds.
Read: relevant Current State, remaining-tenant-routes report; routes/types/context/json-response; new presentation API; existing two routes and owning tests; actual gateway snapshot view fields.
Stable API: getWorkspaceWebPresentation(workspaceId, exactFluxIQ, trusted {userId,clientId?}) returns context(), beginContextWrite().commit(selection), present(). Host facts are supplied inside lib/fluxiq.ts.
Snapshot: held workspaceRouteContext/withWorkspaceRouteJson, cookie-first identity, exact trusted caller; never getFluxIQ/primary fallback. Fresh binding/IAM around project lookup/name and final serialized response.
Preserve own-project lookup/name, using selected registry and bound domain/project. Stored context is a preference, not proof: revalidate visibility before exposing project/name. Do not create a project on read.
Snapshot must filter service panel to own sessions/trusted clients and paired callers on all profiles to exact bound session/client/trust. Do not return foreign sessions, pending pairings, raw arbitrary audit metadata. Explicit field projections where needed; no entire global snapshot spread for service/paired.
Local/self-hosted panel visibility compatibility may retain existing authorized operator snapshot behavior; document this separately from service own-user filtering. No invented blanket admin bypass in service.
Context POST: authorize selected tenant with frozen target resources; current user comes from trusted cookie. Body clientId is only a requested context target, prove it is owned by this user in this tenant before using it. Paired unsupported remains explicit.
Hold one lease through body/validation/commit/serialization. Begin write intent before asynchronous validation after slot known; late older write must not overwrite newer slot intent. Revalidate project/flow/domain/client ownership after awaits and immediately before commit. Null clears selection deliberately.
Use existing domain/project permission helpers; preserve errors safely and refuse incomplete authority. No fictitious successful fallback. Do not widen generic buffered owner just to return arbitrary Response.
Tests: two tenants same ids, cookie/bearer precedence, current binding/session/user/tenant changes, own/foreign gateway rows, service metadata omission, local compatibility, body/lookup races and no cross-tenant data/write, stale write ordering, exact once lease release.
Update route-local old mocks to real shared route authority fixtures where practical. Root owns shared parity matrix/fixture compatibility.
Core artifacts frozen/current. Narrow tests only after your owned source freezes. No full suite, whole-web types or library build while other editors work.
First propose filtering/error/lifecycle details where actual snapshot lacks ownership evidence, then implement. Unknown ownership is omitted, not guessed.
Return contract with tests observed and source-stable signal; no live/browser proof claim.
