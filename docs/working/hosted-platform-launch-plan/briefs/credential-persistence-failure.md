# Credential persistence failure transition
Role: Standard worker, gpt-6.1-sol medium; use existing configured worker.
Goal: Fix the actual Core WebSocket transport failure when tokenStorage.write rejects.
Own: packages/client-gateway-websocket/src/transport.ts and its existing adjacent tests; packages/client-gateway-websocket/src/connection/connection.ts and owning tests; new narrowly scoped helper/tests under that package if needed; report credential-persistence-failure.md.
Must not touch: contracts, extension, app kernel, web routes, shared docs, dist, git.
Read: your extension-hosted-connect-discovery report persistence seam; transport and owning test files; current plan Current State.
Preserve existing current/previous token, credential_received, outbox and lost-reply semantics.
No session-ready publication/credential acknowledgement before durable storage succeeds.
Failure must produce a bounded safe error/terminal connection transition; no unhandled rejection, in-memory credential adoption, or automatic retry with uncommitted credential.
Use existing error/event contracts; report if a new contract is truly necessary before changing one.
Tests: rejection after rotation, no ready/ack; late rejection from replaced socket cannot tear down a new connection; no secret strings in errors; normal rotation/recovery remains.
Run package narrow tests and no-emit typecheck only; do not build or mutate dist.
No real server/browser/provider needed. Root coordinates package build later.
Report Done/Partial/Blocked, Changed, Validation command/output, Not verified, Report, Notes.

Expanded after trace: connection must stop auto-reconnect on terminal storage failure via existing error event; generic recoverable errors retain reconnect. Bind socket callbacks and serialize rotation writes; do not publish stale completions. Already-started external writes cannot be undone.
