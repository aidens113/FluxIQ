# Report: k0-3-identity-access

Worker report for brief `k0-3-identity-access` (step K0.3, amended by CD4-CD5). Repository: FluxIQ Core (`F:\!FluxIQ`). Built on K0.1's `password-kdf` module. Nothing committed.

## Outcome

**Done.** Every item in the brief is implemented and every named check was run.

- **Tests.** The new unit file has 20 tests and the rewritten global file has 10. All 30 pass.
- **Type check.** `pnpm --filter fluxiq check` passes: `tsc --noEmit`, exit 0.
- **Structure audit.** Unchanged from before my edits: exit 1 on the same single failure, `docs/working/README.md`, which is not my file. No audit line fails for Identity Access.
- **Mutations.** All twelve went red and were restored byte-identical:
  - §7 mutations 1, 2, 5, 7, 11, 12 and 13;
  - storing a raw session id;
  - skipping the dummy derivation.
- **Consumer tests.** Four other suites that call Identity Access at the real cost pass: 23 tests.

## What changed and why

Paths are under `packages/fluxiq/src/programs/`.

### Files

| File | Status | What it holds |
| --- | --- | --- |
| `identity-access/runtime/service.ts` | changed, 746 → 731 lines | The service, rewritten on the new modules. Class at 37 methods, up from 36. |
| `identity-access/runtime/credential-seal.ts` | new | The crypto moved out of the old `service.ts:631-707`:<br>- version 1 and version 2 envelope types and the stored-shape guard;<br>- `createCredentialKdf`, which holds the floor check;<br>- `createCredentialKey`, `openSealedCredential`, `sealCredential`, `needsCredentialReseal`;<br>- `runDummyCredentialDerivation` and `isSameSealedCredential`. |
| `identity-access/runtime/stored-state.ts` | new | The store's record formats: `readStoredState`, `identityRecord`, `credentialMetadata`. Moved out to keep `service.ts` under 800 lines. |
| `identity-access/runtime/session-digest.ts` | new | `digestSessionId`: SHA-256 hex, the same format as Client Gateway token digests. |
| `identity-access/runtime/run-credential-change.ts` | new | `runCredentialChange`, which runs the prepare, write, commit or abort sequence. |
| `identity-access/runtime/totp.ts` | new | The authenticator-code functions, moved unchanged apart from `createTotpSecret`. Moved for the size budget. |
| `identity-access/types.ts` | changed | New exported types:<br>- `IdentityCredentialChange`;<br>- `IdentityCredentialChangeSubscriber`;<br>- `IdentityAccessServiceOptions`, with `passwordKdf` and `credentialChangeSubscribers`. |
| `identity-access/runtime/tests/service.test.ts` | new | 20 tests. Derivations run at the test-only N=2^10; the version 1 fixtures are built at N=2^14. |
| `tests/global-identity-access.test.ts` | rewritten | 10 tests. Details in the last section below. |

### Behaviour, item by item against the brief

1. **Single-flight load.**
   - Concurrent callers share one load promise. A failed load clears it so the next call can retry.
   - The first load also deletes session records stored under a raw id and rewrites any credential record that still carries a `pinVerifierHash`. It does this before any other operation can run.
2. **Async gates.**
   - These now await the derivation: `setCredentialHash`, `ensureDefaultAdmin`, the password and PIN gates, `unlockVault`, and `authenticate`.
   - No `scryptSync` call remains in Identity Access.
3. **Version 2 envelopes and PHC hashes.**
   - New seals are written as `version: 2` with `kdfParams`. The salt is 16 random bytes stored as base64url, and the key derives from the decoded bytes.
   - Opening a version 2 seal decodes the salt with `decodeKdfSalt` and checks `isAcceptedV2ScryptParameters` before anything is derived. A record that fails either check fails closed.
   - Version 1 seals derive from the salt text at N=2^14.
   - Inner password and PIN hashes are written by `hashPassword` and checked by `verifyPasswordHash`.
   - Decryption now also requires a full 16-byte GCM tag (`authTagLength: 16`).
4. **One derivation per operation.** The credential unlock either returns a proven credential or throws.
   - **Warm path** (credential already in memory): one verification of the password hash.
   - **Cold path** (sealed record): one derivation. A successful GCM decrypt proves the password, so the inner hash check (old line 570) and the second key derivation (old 575) are gone.
   - The extra verifications in `authenticate` (old 266) and in the credential gate (old 553) are removed.
   - A wrong password on the warm path throws at once instead of also trying the seal.
5. **Re-seal and rehash.**
   - A cold open re-seals and rehashes only when `needsCredentialReseal` holds: a version 1 record, or `isBelowScryptWriteCost`.
   - When it does, it rehashes the password, derives a new-salt key at the write cost, holds that key, and persists. A record at an equal or higher cost is left alone.
   - The warm path rehashes a legacy or below-cost hash after it verifies.
   - Concurrent cold unlocks for the same user share one re-seal. Later callers wait for the one in flight, then take the warm path.
6. **PIN rehash.**
   - A correct PIN with `needsRehash` is rehashed and persisted only when this exact credential and its key are both held in memory.
   - A wrong PIN writes nothing.
7. **Zeroed keys.** Key buffers are zeroed in each of these cases:
   - a failed open;
   - a version 1 key after the re-seal;
   - a replaced held key;
   - the dummy derivation;
   - keys dropped on a reload;
   - a new key when the credential it belongs to is missing.
8. **No persisted `pinVerifierHash`.**
   - Metadata is rebuilt field by field, so a stored verifier is never copied.
   - PINs verify only against a credential unlocked in this process.
   - Otherwise the existing message is shown: "PIN verifier upgrade required. Sign out and sign back in, then try again."
   - `ensurePinVerifierMetadata` is removed.
9. **Session ids stored as SHA-256 digests.**
   - Sessions are held and stored under `session:<digest>` with `sessionDigest: { digest, userId, expiresAtMs }`.
   - `validateSession` digests the cookie value before looking it up.
   - Records stored under a raw id are ignored and deleted, so those users sign in again.
   - `snapshot().sessions[].id` is now the digest.
   - `revokeSession` also deletes the stored record. Before this change, the next reload brought a revoked session back.
10. **Dummy derivation.** Unknown and disabled usernames run one derivation at the write cost through the injected derive, which is K0.1's limited `deriveScryptKey` in production. So do accounts that have no password or credential.
11. **Credential-change port.**
    - `setPassword` and `setPasswordAuthorized` both go through `changePassword` and `runCredentialChange`.
    - **Prepare.** Subscribers prepare in order. A `prepare` that throws refuses the change: every subscriber asked so far, the failing one included, is sent `abort`, and the error is rethrown.
    - **Write.** The credential is written only after every prepare succeeds.
    - **Failed write.** A failed write also aborts. The write is undone in memory too (credential, metadata, seal, user and key), so this instance, the store, and the aborted subscribers still agree on the old password.
    - **Commit.** After a successful write every subscriber commits.
    - **The change object.** It carries `changeId`, `userId`, `actorUserId` and `newPassword`. It has a `currentPassword` only for a self-service change; an administrator's reset of another account carries `undefined`.
    - **Registration.** Subscribers are registered through the constructor option `credentialChangeSubscribers`.
12. **Reload keeps unlocked credentials.** A reload after an unknown session id keeps a held credential and key while the stored seal is unchanged. Without this, under CD5, any request with a stale cookie would force every PIN user to sign in again.
13. **Floor check.** `createCredentialKdf` calls `scryptWriteParameters`, so invalid test-only weak parameters throw a `RangeError` at construction.

The global test file changes:
- **Low-cost setup.** Tests that construct the service directly and are not about cost use the test-only N=2^10.
- **Real-cost tests.** The tests built through `createGlobalProgramRuntime`, plus "sees persisted sessions" and "migrates a legacy plaintext", run at the production cost.
- **New assertions.**
  - `version: 2` with `kdfParams` N=131072;
  - a session record stored under its digest, with the raw id absent from the store;
  - the PIN flow after a restart: sign in again first, and a stored verifier is removed at load.
- **Renamed helper.** `testHashSecret` is now `legacyTestHashSecret`.

## Commands run and observed results

All commands ran one at a time. Timings are single observations on this faulty-RAM machine.

1. **Audit before edits.** `node scripts/structure-audit.mjs`
   - Exit 1, one failure: `[working-docs] docs/working/README.md is out of date`.
   - Advisory warnings for `service.ts`: 36 methods, 746 lines.
2. **Scratch type check of Identity Access plus both test files.** `npx tsc -p <scratchpad>/k0-3-identity.tsconfig.json`
   - Exit 0, no output.
   - The first run, on an earlier draft, showed `service.ts` at 811 lines. That led to extracting `stored-state.ts`; after it, 731 lines.
3. **Unit tests.** `npx vitest run src/programs/identity-access/runtime/tests/service.test.ts --no-file-parallelism`
   - `Tests 20 passed (20)`, 2.02 s.
4. **Global tests.** `npx vitest run src/programs/tests/global-identity-access.test.ts --no-file-parallelism --reporter=verbose`
   - `Tests 10 passed (10)`, 14.14 s.
   - Slowest: the Automation Studio PIN test at 3846 ms, and the PIN verifier test at 2810 ms.
5. **Package check.** `pnpm --filter fluxiq check`
   - `tsc --noEmit`, exit 0.
6. **Audit after edits.** `node scripts/structure-audit.mjs`
   - Exit 1 with the same single README failure.
   - Identity Access lines are advisory only: 37 methods, 731 lines.
7. **Consumer tests.** Run: `global-database-manager`, `database-manager/api/tests/handlers`, `_shared/tests/runtime-llm-grants`, `global-secret-keys`.
   - `Tests 23 passed (23)`, 41.76 s.
   - `handlers.test.ts` took 26.6 s, with each test at 1.0-1.76 s against the 15 s timeout.
8. **Mutations.** `node <scratchpad>/k0-3-mutations.mjs <id>...`
   - The runner checks the target file equals its backup, applies exactly one replacement, runs the tests, restores from the backup in `finally`, and checks the restore byte for byte.
   - All twelve printed `restore byte-identical: true`.

   | Mutation | Unit tests failed | Test(s) that went red |
   | --- | --- | --- |
   | 5: re-seal and persist before the open is verified | 2 of 20 | "leaves a version 1 record untouched after a wrong password"; "zeroes derived keys" |
   | 7a: cold-unlock wait loop removed | 1 of 20 | "re-seals once when two cold logins … race" |
   | 7b: load no longer shared (second caller returns at once) | 1 of 20 | the same race test |
   | 11a: the gate verifies the password again | 1 of 20 | "spends one derivation per login and per password check…" |
   | 11b: the cold open checks the inner hash | 3 of 20 | derivation counts, race, zeroing |
   | 11c: `authenticate` verifies the password again | 2 of 20 | derivation counts, race |
   | 12: PIN rehash without the held-key check | 1 of 20 | "checks a PIN without rehashing it when the credential's key is not held" |
   | 13: floor check removed | 1 of 20 | "refuses password KDF parameters outside the test-only weak range at construction" |
   | Raw session id stored (`digestSessionId` returns its input) | 1 of 20 | "stores sessions under the SHA-256 digest of their id, never the id" |
   | Dummy derivation skipped in `authenticate` | 1 of 20 | "runs one dummy derivation for an unknown, disabled, or password-less username" |
   | 2: `LEGACY_V1_SCRYPT_PARAMETERS` 2^14 → 2^15 | 5 of 20 | the version 1 login, zeroing, race, legacy PIN rehash, and key-not-held PIN tests |
   | 1: `CURRENT_SCRYPT_PARAMETERS` 2^17 → 2^14 | global file, filtered with `-t` | "sees persisted sessions…" and "migrates a legacy plaintext…" (8 skipped by the filter) |

9. **Final run on the restored code.** Both test files: `Tests 30 passed (30)`, 16.09 s.
   - `cmp` of all four mutation targets against their backups: identical.

## Not verified

- **No live browser or web login**, and no manual login against an isolated fixture root. That is step K0.6.
- **No full suite, `pnpm test` or `pnpm build`**, per the brief and the RAM rule.
- **Other consumer suites.** No test in Automation Studio or `apps/web` was run. Many of them call `authenticate` through `createGlobalProgramRuntime`, which now runs at N=2^17, so they will be slower; this was not measured.
- **No real N=2^18 derivation.**
- **Multi-process races.** A second process writing the same user or session records was not tested; the service still writes blindly (upserts).
- **The port is not wired to Secret Keys.** That is K0.5; the port was tested only with fake subscribers.
- **No documentation or version change.** Those belong to K0.5 (§4.9 and CD6).
- **The web UI with digest session ids in the snapshot** was not exercised. The live view reads only `userId` and the session count.

## Open questions or contradictions found

1. **The brief both forbids and requires touching `password-kdf/`.** It lists that folder under "Must not touch", yet asks for §7 mutations 1 and 2, whose targets are in `password-kdf/scrypt-parameters.ts`.
   - I ran them as temporary edits, restored from a byte-exact backup and checked with `cmp`.
   - The file was mutated from 2026-09-15T21:43:17.700Z to 21:43:25.696Z (UTC).
   - At 21:43:15Z no K0.2 report existed, so K0.2 may have been running tests then. If K0.2 reports failures about recorded or legacy parameters in that window, they came from these mutations.
2. **An unguarded password path.** `upsertUser` with the `id` of an existing user and a `password` changes that password without the port and without a credential recheck. The `create-user` handler passes its payload straight through. `CreateIdentityUserRequest` declares no `id`, but nothing strips one. I left this alone because it is outside the brief.
3. **Commit errors.** A subscriber's `commit` error cannot undo the credential write. The remaining subscribers still commit, then the first error is rethrown. K0.5's Secret Keys adapter should do everything that can fail in `prepare`.
4. **Wiring order for K0.5.** Subscribers are registered only through the constructor. `_shared/runtime.ts` builds `identityAccess` before `secretKeys`, so K0.5 must reorder construction or ask for a subscribe method.
5. **Work beyond the brief's wording.** Each item is covered by the tests above:
   - `revokeSession` now deletes the stored record, fixing revoked sessions coming back on reload;
   - raw-id sessions and stored PIN verifiers are removed at first load;
   - a reload keeps a credential while its seal is unchanged;
   - a failed password write is undone in memory;
   - GCM decryption requires a 16-byte tag;
   - the TOTP functions moved to their own file.
6. **Placement judgement.** `runtime/stored-state.ts` parses the store's record format. By the layer table that belongs in `storage/`, which I did not own. `runtime/` still has no `index.ts`, and `identity-access/index.ts` still imports `runtime/service.ts` directly; both are unchanged.
7. **Snapshot session id.** `snapshot().sessions[].id` is now a digest, not a bearer value. The documentation should say so (K0.5).
8. **Unchanged message.** The PIN message "PIN verifier upgrade required…" is kept as CD5 asks, but it now means "sign in again after a restart". The UI and documentation wording is K0.5's decision.
9. **Gate timing.** A wrong password now fails before the PIN is checked, so timing tells a caller who already has a valid session which factor was wrong. The error message is the same either way.
10. **Legacy inner hash inside a current seal.** It is not rehashed on a cold login, because this build never writes one. Only a record below the write cost triggers the rehash.
11. **Class size.** `IdentityAccessService` has 37 methods against the advisory limit of 40. The next addition should move a group onto a collaborator.
