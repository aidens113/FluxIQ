# Tenant-owned dataset streaming
Role: Heavy worker, gpt-6.1-sol max; keep existing configured worker.
Goal: Route run dataset exports to the proved tenant and hold current authority/lease through lazy stream completion/cancel/error/abort.
Own: new apps/web/src/lib/workspaces/routes/streams/**; additive routes/index.ts export and type-comment clarification only; app/api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]/**; report tenant-dataset-stream.md.
Must not touch: other route/context implementation/shared fixtures/IAM matrix, accounts/gateway, Core libraries/contracts, package files, shared docs, builds/dist, git.
Read remaining-tenant-routes report stream owner requirements; route adapter/types; actual dataset route and producer cancellation/audit semantics. First propose small stream-owner API/lifecycle and acceptance; wait for root API confirmation before source edits.
Dependencies are fresh and checkpoint pushed. No current root tests/builds running; tests may run after implementation release with source frozen.
Use workspaceRouteContext panel-only contract and immutable URL project/dataset resources; never primary/default reselection. Preserve id/format/header behavior, actor id, domain-hidden404, actual raw CSV/JSON bytes and no-store.
Revalidate after every awaited metadata/domain/producer selection before returning response. Domain grant itself is rechecked at each read boundary where mutable. Unsupported/mixed channel handling follows adapter.
One explicit owner transfers lease only with a successfully constructed Response. Any pre-handoff error releases once and retires a created producer. Reader retains lease after route returns; do not use buffered JSON wrapper.
Guard before source.next and after awaited next and any further auth await, immediately before enqueue. Respect backpressure; do not eagerly buffer the export. EOF/cancel/source error/request abort/current-authority refusal converge on exactly-once iterator.return and lease release.
Race pending next/cancel/abort/late authority; no post-end chunks or raw error/path/row leakage. Don't claim rollback of bytes already emitted. Preserve first useful safe failure if cleanup also fails; no swallowed cleanup failures.
Cancellation must propagate to producer without holding an external callback under a lock or leaking a tenant. Understand underlying iterator cleanup while next is pending; don't invent a timeout/cap to hide a stuck producer.
Use provider-free isolated data, actual tenant adapter/IAM when practical, existing sibling fixtures read-only. Test two tenants with identical ids; primary untouched; local/self-hosted; malformed encoding and identifiers; domain404; read/lease lifetime; async revoke/member/session/selection loss; pending read/cancel/abort/cleanup races; no late data; output format/header compatibility.
No live server/browser/provider and no full suites/builds. Run narrow web filter and scoped types/structure after source freezes; no guard bypass. Root reruns acceptance and owns shared docs.
Return Outcome/Changed/Validation/Not verified/Report/Notes plus exact filter/source-stable signal.
