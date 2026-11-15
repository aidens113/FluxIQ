# Durable revocation decisions
Role: Heavy worker, existing cloud_portability configuration.
Goal: Fix gateway teardown decisions that can observe tentative revocation before durable save; await root dispatch with reproduced probe result.
Own after dispatch: packages/fluxiq/src/client-gateway/service/access.ts, trusted-clients.ts, necessary focused adjacent owner module/barrel and tests; report durable-revocation.md only.
Must not touch: web teardown/manager/route files, other gateway owners without explicit path grant, shared docs/package version/dist/git.
Read: actual access revoke/forget paths, registry mutation queue and existing trusted-client tests, lifecycle refusal/credential lookup contract as needed; prior trace/first-project source stays frozen.
Required: decide idempotent absence/already-revoked only after preceding mutations settle, inside the durable mutation owner; preserve existing registry revoke repeat-save/rollback contract.
No outside-queue settled-then-read race, wrapper polling, swallowed save failure, fake completed false, second revocation store or new lock/unlock mechanism.
Cover both revokeTrustedClient and local forgetByCredential resolution around tentative token indexes. Retain expired/obsolete/invalid credential semantics and actual owning persistence/CAS.
Account for custody/session cleanup after durable revoke: a prior cleanup failure must not make later request falsely complete without retrying required cleanup. Do not hold registry mutation writer while external custody callbacks run.
Tests: concurrent pending save, save rollback then second retry success/failure, durable repeated revoke, unrelated client isolation, current/previous/obsolete/local proof paths, cleanup failure retry, no deadlock/reentrant mutation.
Preserve explicit true/false public outcomes, closed proof behavior and stored rollback fields. No callback/rawerror/token leakage.
No builds or full suites; focused Core owner tests/scoped types after source freeze. Root handles versions/build and downstream acceptance.
Return exact change rationale, observed checks, source freeze and standard report contract. First-project design remains separate.
