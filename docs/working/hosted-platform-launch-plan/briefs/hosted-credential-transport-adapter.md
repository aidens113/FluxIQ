# Hosted credential transport adapter
Role: Standard worker, gpt-6.1-sol medium; keep current configured worker.
Goal: Adapt the verified private credential repo to the new optional server-ready write metadata, without enabling dialing/composition.
Own: extension apps/extension/src/background/credentials/transport/** (new) and credentials/index.ts additive export; Core report hosted-credential-transport-adapter.md.
Must not touch: existing repository implementation/tests, other extension composition/session/outbox, Core/client/contracts, package files, shared docs, dist, git.
Read: session-ready-metadata-integration report, existing credential model/repository/commit tests, new ClientGatewayCredentialWriteMetadata transport API.
First propose exact adapter API/read-write lifecycle. Source edits HOLD until root says final extension package check finished.
Use fixed checked binding, current private record/owner/workspace/connected-client/lineage and mandatory current-selection guard. Never combine a token with mutable settings.
read obtains current durable snapshot for that exact trust; stale/replaced selection or lineage refuses, no token escape.
write strictly validates actual server metadata/user/workspace/expiry/messageId against bound current trust; use server expiry only, no invented summaries/TTL. Missing metadata is a hosted refusal, old local adapters untouched.
Build validated response for existing rotation commit from real ready summaries plus stored PKCE connectedClientId and pinned gateway. Preserve lineage; never auto-revoke a previous rotation proof.
Capture expected revision corresponding to the hello read; CAS prevents late old write overwriting newer credentials. Exact already-durable replay may be recognized; conflicting message/intent refuses.
Map bounded validated message id deterministically to durable operation identity; do not mint a new id for retry. Explain crash/replay behavior before code.
All calls must settle only after durable transaction; stale selection after await prevents activation/ready even if an already-started transaction committed. No memory fallback. Fixed errors, no secret logs/status.
Tests fake-IDB plus actual direct/reconnecting transport where feasible: before ack, missing/malformed metadata preserves prior record, identity/lineage/gateway mismatch, stale callback/current selection, CAS/replay, server expiry, normal rotation. No real sockets/browser/server/provider.
No builds/dist; filtered tests only after root fresh outputs signal, unique label. Report unwired/source-only browser limitations.
Return Outcome/Changed/Validation/Not verified/Report/Notes; source freeze before integration.
