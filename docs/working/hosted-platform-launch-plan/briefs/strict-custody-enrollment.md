# Strict locked-holder enrollment

- Role: heavy worker, gpt-6.1-sol, max. No git or agents.
- Goal: provide a durable failure-propagating fresh locked-holder enrollment API for the hosted trust issuer without copying keys.
- Own: packages/fluxiq/src/programs/secret-keys/runtime/unlocks/** and own report reports/strict-custody-enrollment.md. May add/export types through existing unlock barrel only.
- Read Current State, your tenant-custody-discovery report, credential-unlocks and relevant persistence/crypto/tests. Follow code-structure; no baseline exceptions.
- Must not touch: runtime.ts, identity-access, gateway, platform trust, contracts, web, shared documents, other reports/repos.
- Existing presentCredential mutates memory before persistence and can reuse an existing holder, so it is not strict enrollment. Root currently calls it provisionally and will switch to your API.
- Add a focused method such as enrollLockedCredential(holder, credential) with the real final signature sent to lead early.
- Require a durable repository; reject missing persistence instead of pretending a hosted grant is durable.
- Fresh holder has exact user/approving-session digest/expiry binding and zero key boxes. Do not inspect live/unlocked sessions, copy keys or lift existing holds.
- Existing exact binding may be explicitly idempotent only if verified safe; conflicting owner/digest/credential must fail rather than overwrite or re-key.
- Serialize same-holder enrollment and preserve revocation/forget/session-end races. A failed save must not leave provisional memory, held keys, or an early-return path that publishes on retry.
- Use existing crypto and store, not a second key scheme. Avoid changing ordinary local presentation behavior incidentally; fix shared concurrency only where the regression requires it.
- Test durable success/reopen, no repository, mismatched existing owner/digest, failed persistence then retry, overlapping enrollment, forget/revoke during pending persistence, zero keys valid, no unrelated key borrowing.
- Run focused tests only and focused types/structure. No whole build while transport/gateway work is active. Signal stable source before lead validation.
- End with standard Outcome/Changed/Validation/Not verified/Report/Notes and exact API integration instructions.
