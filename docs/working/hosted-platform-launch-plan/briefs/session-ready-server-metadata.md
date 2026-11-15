# Server-authored session-ready metadata
Role: Heavy worker, gpt-6.1-sol max; retain existing configured worker if runtime cannot override followup.
Goal: Populate current server-authorized identity and persisted expiry in both actual ready paths; no fabricated browser TTL.
Own: packages/fluxiq/src/client-gateway/service/session-metadata/** (new); service/types.ts, service/index.ts, client-gateway/service.ts, service/lifecycle.ts, service/trust-grant.ts; focused existing/new adjacent tests; report session-ready-server-metadata.md.
Must not touch: framework/index.ts, programs/_shared/runtime.ts, web, contracts, client transport, extension, package files, shared docs, dist, git.
Read session-ready-metadata-integration report and current gateway lifecycle/trust issuance/custody/revocation paths. Inspect first; report concrete plan/API before editing.
Root Core build is in progress: source edits MUST wait for root release; read-only inspection allowed now.
Frozen option sessionMetadata?: ClientGatewaySessionMetadataProvider on ClientGatewayServiceOptions, exported through existing service barrel.
Provider input readonly {trustedClientId,userId,clientType}, derived only from actual trusted record. Output {user:ConnectUserSummary,workspace:ConnectWorkspaceSummary}|null, async. No token or client-supplied tenant passed.
Use shared existing summary schemas; require userId match actual owner. Gateway supplies credentialExpiresAt from successfully persisted trustedClient.expiresAt, never provider TTL.
Provider absent preserves generic local behavior; configured null/error refuses safely, never silently omits metadata or falls back to local pairing. Service host will always inject it for ordinary human records.
Apply human provider only to actual ordinary trusted records; managedHost exception comes only from authoritative record, never hello fields. Managed enrollment remains unchanged.
Use one helper for both resume and grant. Obtain eligibility before credential/custody work; refresh after awaited work and before ready. Recheck same session/trust object, active status, owner/client/domain and exact current token hash after waits.
No ready registry state/event/frame on refusal. Newly created undelivered trust must be cleaned up. Temporary metadata failure must not masquerade as credential reuse/revocation. No old panel session requirement/password/unlock.
Preserve current/previous proof rotation/recovery and persistence ordering; no duplicate expiry engine.
Tests through actual service/send sites: persisted expiry matches frame; valid metadata; absent local provider; real managed compatibility; null/throw/malformed/mismatched owner; revoke/session replacement/owner change during await; no credential-ready publication on refusal; current/previous token resume.
Run focused Core source tests/types only after root source release. No builds/dist or full suites.
Return Outcome/Changed/Validation/Not verified/Report/Notes, plus source-stable signal.
Ownership expansion: service/trusted-clients.ts plus adjacent tests for a narrow committed-read barrier/snapshot if pending-save expiry race is reproduced. Preserve existing queue; never hold it across external metadata callbacks. Test rollback so ready never quotes tentative expiry.
