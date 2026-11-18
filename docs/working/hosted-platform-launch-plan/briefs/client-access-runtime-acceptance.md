# Runtime authenticated-client acceptance
Role: standard worker, gpt-6.1-sol, medium; no delegation/git/shared-document edits.
Goal: prove new behavior through real Core identity/gateway/SecretKeys composition on isolated disk stores; replace obsolete lock acceptance, not meaningful revocation assertions.
Own: packages/fluxiq/src/programs/_shared/tests/runtime-credential-unlock.test.ts and runtime-credential-changes.test.ts, new adjacent focused runtime-access fixture/test if needed.
Read: Current State; authenticated-client-access report; those tests; actual programs/_shared/runtime.ts wiring as needed.
Must not touch production, backend-owned tests, UI, extension, any other report. Report runtime-client-access-acceptance.md.
Behavior: actual authenticated approval immediately permits authorized key use without explicit unlock, key before/after approval, ordinary panel logout, reconnect, restart, rotated credential; actual client revoke/account disable/IAM revoke still deny.
Call `secretKeys.access.createUseAuthorization({id,principal:{kind:'client',userId,trustedClientId}})` then existing one-use reveal to prove usable material, not merely boxes/snapshot status. Derive id from actual ready authenticated gateway; exercise real principal authority.
Keep no plaintext keys/tokens in database checks and credential reuse proof. No real model call needed. Keep normal password-change/reveal expectations that remain actual policy; flag unresolved tenant password lifecycle rather than invent acceptance.
No first_unlock, lift, ticket, password-on-approval or signOutLocks requirement; those are superseded user behavior.
Default runtime now automatically persists Windows DPAPI/POSIX private-file protection; no real user root/env/data. Services explicitly use dedicated temp paths.
Source still moving in backend: prepare tests, then signal stable and coordinate before execution. No builds/full suite/servers/browser/paid calls.
After root says backend stable run only these tests, report failures with cause; do not weaken independent authentication checks.
