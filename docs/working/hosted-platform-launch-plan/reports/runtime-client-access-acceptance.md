# Runtime authenticated-client acceptance

Outcome: Done. Two focused real-runtime files passed 15/15 tests. Runtime acceptance changed no production/backend source. No builds, servers, browser sessions, provider calls or git operations were run by this worker.

Changed:

- Replaced the obsolete first-unlock/client-lock scenarios in `packages/fluxiq/src/programs/_shared/tests/runtime-credential-unlock.test.ts` with 13 actual client-access scenarios. No approval password, lift, ticket, extra model-key unlock, or sign-out-lock requirement remains in these tests.
- Added adjacent `runtime-access-fixture.ts`, which creates isolated temporary disk stores, real Identity Access/gateway/Secret Keys composition, and the normal automatic Windows DPAPI/private-file host protector. Profile and keyring-file environment inputs are isolated; no existing user root or secret file is read. The fixture's sign-in only authenticates Identity Access and never calls a model-key unlock.
- Preserved both password reseal/reset assertions in `runtime-credential-changes.test.ts`; added actual authenticated key use after own password change and cold restart. Added environment isolation and runtime detach cleanup.

Every positive client-access assertion derives `trustedClientId` from an actually ready gateway session authenticated by its issued token, then calls `secretKeys.access.createUseAuthorization({id,principal:{kind:"client",userId,trustedClientId}})` and consumes the existing one-use reveal. The result is the synthetic provider value, not a box count or a readiness label. Negative revocation tests retain the original principal and minted authorization so a helper's preflight cannot hide a missing consume-time authority check.

Verified provider-free behavior:

1. Approved client uses a preconfigured compatible model key immediately; one-use authorization refuses a second consumption.
2. Ordinary panel logout preserves independent client use, including a client authorization minted before logout. The panel principal and its already-minted use authorization are refused.
3. Logout plus a cold runtime restart and authenticated client reconnect restores actual key use without another panel sign-in or a held panel key session.
4. An approved client with no keys survives logout/restart, then automatically uses a key configured later. The configuring panel may log out without half-disabling that client.
5. Repeated reconnect rotates credentials while current client key use continues.
6. Lost credential reply recovery preserves the existing current/previous contract across restart; acknowledgement retires the older credentials. Presenting an obsolete credential later ends real trust and denies the newest client's fresh and already-minted use.
7. Client forget and operator trust revoke each invalidate both fresh authorization and an already-minted reveal; the credential no longer authenticates.
8. Account disablement and loss of current role permissions each deny fresh and already-minted use, and remain denied after restart.
9. Invented client ids, a different user on a real client id, and use of another owner's unoffered key are refused.
10. Actual SQLite files exist and contain neither the synthetic provider value nor the issued raw client token. Forget removes the stored credential-holder row after a WAL checkpoint.
11. The existing real-endpoint identity-row deletion/recreation guard remains enforced.
12. Own password change re-seals the value for the new password and rejects the old one, survives restart and permits actual authenticated key use. Administrator reset of another account retains the existing old-password seal/reveal policy; that assertion was not weakened.

Validation:

- From `packages/fluxiq`: `pnpm.cmd exec vitest run src/programs/_shared/tests/runtime-credential-unlock.test.ts src/programs/_shared/tests/runtime-credential-changes.test.ts` -> 2 files passed, 15/15 tests passed, 152.78s total (13 lifecycle tests; 2 credential-change tests). Started only after the backend owner's final `dataKeys.protect` repair and explicit stable signal.
- No-emit TypeScript compiler API probe using the package's tsconfig, rooted at the two files and fixture -> 3 roots, 0 owned diagnostics, 0 imported diagnostics. No emitted artifacts or build-cache mutation.
- Direct scoped invocation of the repository `statement-packing` rule over 10 owned new/changed UI and acceptance files -> no findings. The lead's four `KeyAvailability.tsx` switch-case findings were fixed by expanding statements, with no behavior change. No baseline expansion or whole audit was run.

No failures were observed in the runtime run and no test was weakened to obtain a pass. Earlier UI owner checks are recorded separately in `client-access-ui-implementation.md`: 91 shared UI and 147 web tests passed.

Not verified: live browser/extension behavior, HTTP tenant routing in these particular tests, service/hosted primary-identity password lifecycle, standing grant admission, Linux filesystem protection, real provider dispatch/failures, deployment, or power-loss/concurrent keyring initialization. The runtime tests run on Windows with isolated local-profile stores; they exercise actual Windows DPAPI, local runtime authority and custody, not those broader claims.
