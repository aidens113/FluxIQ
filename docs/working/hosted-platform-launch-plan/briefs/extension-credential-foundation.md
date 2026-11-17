# Extension audience-bound credential foundation
Role: Standard worker, gpt-6.1-sol medium; keep existing configured worker.
Goal: Implement private durable credential repository foundation for hosted extension sign-in, without enabling dialing yet.
Core root: C:/Users/osrs_/FluxStuff/fxwork/t914/!FluxIQ
Extension root: C:/Users/osrs_/FluxStuff/fxwork/t914/!FluxIQWebExtension
Own only: extension apps/extension/src/background/credentials/** (new module/tests); Core report extension-credential-foundation.md.
Must not touch: existing extension composition/storage/session/outbox/manifest, package files/lockfile, Core source/contracts, shared docs, dist, git.
Read Core reports/extension-hosted-connect-discovery.md; extension AGENTS boundary and background storage/session/outbox source only as needed to define compatible ports.
Implement explicit origin+instance+gateway/endpoints binding, per-binding install identity, CAS durable credential record/revision, private pending revocations and fresh trusted lineage identifier.
Use extension-origin IndexedDB; no local/sync storage or memory fallback for lasting credentials. Do not mutate/erase existing legacy records in this standalone unit.
Credentials are read only for exact canonical checked binding. Refuse changed/absent hosted instance, foreign origin endpoints, insecure nonloopback endpoints, expired/malformed credential, stale CAS.
Repository must commit before returning a usable credential, serialize/idempotently handle competing writes and fail safely on transaction abort/storage closure. No raw credential in errors/status/report.
Expose narrow typed ports for future bound HTTP/gateway consumers and scoped lineage. Do not create a new auth or token protocol.
First report proposed API and available test infrastructure; request exact dependency change if fake IndexedDB package required. Root owns dependency changes.
Tests: independent bindings, same-origin changed instance, no stale writes, expiry, transaction failure, close/reopen, concurrent CAS, no secret in errors. Isolated synthetic data only.
No browser/live/provider/server/build. Source tests via existing filtered runner only after root says Core dependencies stable; source-local type probes okay.
Report limitations honestly: module is not yet wired; actual browser-origin isolation requires browser proof.
Freeze source after acceptance for coordinated downstream build. Return Outcome/Changed/Validation/Not verified/Report/Notes.
