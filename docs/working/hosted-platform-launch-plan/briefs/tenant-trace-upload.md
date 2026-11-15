# Selected tenant trace artifact upload
Role: Heavy worker, gpt-6.1-sol max; retain configured worker on followup.
Goal: Migrate trace artifact upload from process primary to proved held tenant without changing upload format or authority.
Own: apps/web/src/app/api/client-gateway/trace-artifacts/[sha256]/** and own reports/tenant-trace-upload.md.
Must not touch: lib/fluxiq, workspace shared contexts/types, shared IAM matrix/fixtures, Core packages/contracts/dist, other routes, docs shared state, git.
Read: Current State; remaining-tenant-routes and tenant-route-completion-discovery trace notes; existing trace route/tests; uploadTraceArtifact implementation read-only; workspace routes public context/current/revalidate and body-derived resources.
Use workspaceRouteContext with paired-only route contract; cookie+bearer follows frozen shared precedence, no primary or tokenless fallback. Resolve trustedClientId resource from proved selection callback, not caller body or preliminary selfgrant.
Hold selected instance throughout params/body/hash/intake/serialization. Preserve actual Core upload validator, size/media/hash limits, response statuses and drain semantics. Never duplicate upload engine.
Pass upload helper's stillAuthorized a fresh full context revalidation plus exact pinned gateway binding; synchronous current() before handoff/intake where public seam permits. Refuse session/trust/user/domain/project/recording changes, not just sessionId.
If existing helper cannot safely enforce current authority at actual intake, report precise missing public seam before any library edit; do not invent a successful check or silently loosen.
Ensure all failure/abort/storage/validation outcomes release once after held work settles. Fixed errors/no payload/token logging. Preserve already committed side effects honestly, no rollback claim.
Tests: real selector/tenant IAM, two tenants same ids, no primary data fallback, panel/cookie precedence, foreign domain, delayed body authority changes and abort, malformed params/hash/media/size, intake exceptions, drain, local/selfhost compatibility.
Use source-stable actual libraries, provider-free focused Vitest forks1, scoped types/structure. No builds/live server/provider/model/browser or full suite.
Write concise report, source-frozen signal and Outcome/Changed/Validation/Not verified/Report/Notes. Root integrates shared matrix after your unit freezes.
