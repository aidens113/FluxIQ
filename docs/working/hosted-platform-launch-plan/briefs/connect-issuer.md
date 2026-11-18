# Trusted connection credential issuance

- Role: heavy worker, gpt-6.1-sol, max; no agents/git mutations.
- Goal: implement ordinary client trust issuance for authenticated PKCE consent before a WebSocket exists, using existing gateway credentials and mandatory scoped persistence.
- Own: packages/fluxiq/src/client-gateway/service/** except credentials/** and trusted-clients.ts (ask lead before changing these completed units); own report reports/connect-issuer.md below this plan.
- Read: Current State, reports/browser-trust.md, connect/model/types.ts, gateway service public API/registry/pairing/custody and their tests. Read only necessary files.
- Must not touch: platform, web, framework, contracts, transport, shared docs/reports, other repositories.
- First investigate and propose API; shared build is in progress. Do not edit source until lead releases the build hold.
- Use a server-only trusted input with approver identity and actual authenticated session authority; request body never supplies actor/workspace. Generic client contract, not browser-domain names in Core.
- No managed-host enrollment tickets, no synthetic connected pending session, no second credential scheme.
- Persist before returning raw credential; scoped-store failure cannot publish trust. Custody delivery must not borrow another user's held keys.
- Enforce client limit and replacement for same authenticated client installation atomically across concurrent issuance; define operation failure/retry semantics, account/tenant scope comes from trusted composition.
- Existing ClientGatewayService has tight public method budget; prefer cohesive property facade instead of adding unrelated coordinator methods or bypassing checks.
- Preserve local approvePairing and managed-host paths. All existing credential replay/rotation/rollback protections must remain.
- Freeze API with lead before implementation, including client install binding and custody requirements.
- Tests: pre-socket credential authenticates correct client only, fails persistence without publication, disabled/revoked authority fails, concurrency/replacement/limit, local and managed paths unchanged.
- Run only focused owner tests; no whole builds, paid runs, real data or servers except isolated test harnesses. Report exact results and limitations.
- End with Outcome/Changed/Validation/Not verified/Report/Notes.
