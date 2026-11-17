# Remaining tenant HTTP and stream routing discovery
Role: Heavy worker, gpt-6.1-sol max; keep existing configured worker.
Goal: Identify remaining customer-facing routes using primary/global instances, especially dataset/run streams and gateway views, and propose file-owned next units.
Own: docs/working/hosted-platform-launch-plan/reports/remaining-tenant-routes.md only.
Must not touch: source/tests/shared working docs, package files, builds/dist, private state, git; no server/browser/provider calls.
Read Current State, workspace-http-routing architecture, route adapter public API and existing program route lease pattern. Use scoped rg to locate relevant routes and their auth/data owners; do not read all application files.
Record exact route/path, allowed caller channels/IAM contract, current workspace selection, lease lifetime, sensitive payload and whether buffered or streamed. Exclude deliberate host/operator setup from customer migration.
For lazy responses design one owner holding the selected lease through EOF/cancel/error/request abort; guard current identity/binding before each outward chunk and after awaited reads. No new tenant selection midstream. Backpressure and cancellation must settle underlying producer once.
Do not use buffered JSON wrapper for streams or arbitrary Response. Distinguish irreversibly delivered bytes from later revocation; never claim rollback of delivered data or committed writes.
Identify global gateway presenter/context-map state that could cross tenants and the narrowest genuine owner for isolation. A reconnect/forget route must not confer content authority from credential-only teardown.
Prioritize next coherent units with file partitions and meaningful provider-free acceptance cases, not an oversized route rewrite. Preserve local/self-hosted behavior and current service operator denial.
Record source citations, not file dumps. No broad implementation/infra work.
Return Outcome/Changed/Validation/Not verified/Report/Notes.
