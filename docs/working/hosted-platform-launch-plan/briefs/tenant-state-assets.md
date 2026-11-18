# Tenant state-asset route migration
Role: Standard worker, gpt-6.1-sol medium; keep existing configured worker.
Goal: Route buffered state-asset GET/PUT through the frozen tenant context and full immutable binding.
Own: apps/web/src/app/api/programs/automation-studio/state-assets/[projectId]/[sha256]/route.ts and its tests/** only; report tenant-state-assets.md.
Must not touch: shared adapter/IAM fixtures/lib, dataset/other routes, Core/packages, shared docs, dist, git.
Read: tenant-route-completion-discovery asset lane; frozen workspaceRouteContext types/source; current asset route and Core uploadStateAsset contract (read-only).
First inspect/test plan only. Source edits HOLD while root final219-web acceptance reads existing route through parity cases.
GET remains panel-only, private buffered asset response; retain media/digest/header behavior. Hold lease through bytes+final authorization, release once on every path.
PUT retains Core body/digest/media/recording/trace validators; select trusted tenant first, freeze URL project/digest and full client/session/domain/project/recording binding. Nonempty cookie never falls back bearer.
After body await, Core stillAuthorized must revalidate same context/binding and current project-domain access. Never select a new workspace or recreate auth based on new mutable body/state.
Retain existing paired project/domain refusal codes, operator identity from primary authority, proper trace-intake session and bound gateway. Request body cannot supply identity/tenant.
Use raw context try/finally for binary responses; JSON adapter intentionally refuses arbitrary Response/streams. Do not add streaming owner here.
Tests actual selected tenant/primary identity/real IAM seam (reuse read-only existing route fixture module if useful): A/B same project IDs, GET channel restriction, wrong domain/project, mixed credentials, body-wait membership/client/project/recording changes, abort/release and existing trace/upload limits.
No unrelated shared fixture edits; request exact ownership if truly needed. Run narrow asset tests/type/structure after root release/fresh deps, no builds/dist or browser.
Return Outcome/Changed/Validation/Not verified/Report/Notes; source-stable signal.
