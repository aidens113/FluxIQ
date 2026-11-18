# Session-ready credential metadata integration
Role: Standard worker, gpt-6.1-sol medium; keep existing configured worker.
Goal: Trace and propose concrete minimal end-to-end wiring for server-authored rotation metadata before durable client acknowledgement.
Own initially report only: session-ready-metadata-integration.md. No source edits until root releases exact paths/API.
Read: your credential foundation report follow-up; transport types/commitSession/connection wrapper; Core client-gateway service lifecycle/trust-grant/options/composition; web tenant gateway construction and connect approval/issuer authority as needed.
Current gap: wire ClientGatewaySessionReady supports optional user/workspace/credentialExpiresAt, but both server send sites omit them; tokenStorage.write receives only token. Hosted repo requires real validated expiry and identity summaries.
Propose additive write(token, metadata?) with detached server-ready fields minus token plus messageId; existing one-arg adapters remain compatible. Preserve before-ack persistence, queued frames, late-socket protections.
Find authoritative host source for user/workspace summaries and actual trustedClient.expiresAt, without fabricated names/emails, client-supplied tenant, extra password/unlock, or locally invented TTL.
Generic gateway must remain usable locally; hosted composition must require valid matching metadata and fail closed before publishing ready if identity/account/tenant access changes.
Identify exact owned paths for transport/type/test and server/host composition/test units. Reuse existing primary-identity eligibility/tenant options ports; avoid new account database or secret resolution scheme.
Address current/previous token rotation, PKCE-first resume, local reference approval, regular reconnect, provider exception sanitization, revoked trust during awaited metadata, malformed/absent hosted metadata, one-use storage operation id and old single-argument consumers.
Report proposed stable API, minimal phases and source-level evidence, not implementation claims. No builds/tests/live server/provider/git. Return Outcome/Changed/Validation/Not verified/Report/Notes.
