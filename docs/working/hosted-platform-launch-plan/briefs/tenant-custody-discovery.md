# Tenant identity and credential custody discovery

- Role: heavy discovery worker, gpt-6.1-sol, max. Read-only except own report. No git/agents.
- Goal: identify and specify the concrete strict grant for hosted PKCE without copying users' keys across tenants or borrowing other sessions.
- Own only docs/working/hosted-platform-launch-plan/reports/tenant-custody-discovery.md.
- Read Current State, public identity snapshot/session validation, secretKeysCredentialCustody in programs/_shared/runtime.ts, SecretKeysService credentialUnlocks and HeldKeys, web login/tenant construction, existing custody tests as necessary.
- Missing integration: platform authenticates on primary identity, tenant runtimes have distinct SecretKeysService/HeldKeys and identity state. A browser token must bind an approving platform session digest to that tenant only.
- New strict issuer authority port (not yet implemented): grantCredential({credential,trustedClientId,userId,approvingSessionDigest,expiresAt}):Promise<void>. It may fail; raw cookie is never stored. Existing best-effort custody hook is insufficient as authorization evidence.
- Determine exactly where user key records, password-unlocked key material, session digests and revocation subscribers live in service mode today; no secrets or runtime-state reads.
- Propose smallest coherent ownership changes and tests for ordinary panel login, tenant key settings, approved credential issuance, restart/reunlock, signout versus whole-user revocation, and cross-workspace isolation.
- Distinguish need for a key unlock from basic gateway auth: users with no configured model key must still be able to connect; never silently grant another user's key.
- Do not implement or run full tests/builds. Source review only during lead checkpoint push.
- Return concise actionable findings, exact files/public ports, blockers, and standard Outcome/Changed/Validation/Not verified/Report/Notes.
