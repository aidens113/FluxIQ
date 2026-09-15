# Report: k0-2-secret-keys

Worker report for brief `k0-2-secret-keys` (step K0.2), including the supervisor's write-ahead amendment. Repository: FluxIQ Core (`F:\!FluxIQ`). Paths below are under `packages/fluxiq/src/programs/secret-keys/` unless stated.

## Outcome

**Done.**

- **Built:** version 2 Secret Keys seals at scrypt N=2^17, read support for version 1, automatic upgrade at unlock and reveal, the `lastRotatedAtMs` fix, `sealedByUserId` filtering, the reveal-authorization check from CD5, single-flight loading, and the three credential-change calls K0.5 wired.
- **Amendment:** the credential change is now written ahead. Prepare persists each re-sealed copy as a pending seal beside the current one; commit promotes it; abort removes it; and unlock and reveal open the current seal or else the pending one, promoting whichever opened. No failure now leaves a key sealed only under a password that no longer authenticates.
- **Tests:** 10 files and 57 tests pass, including `global-secret-keys`, K0.5's `runtime-credential-changes` (real cost), and `runtime-llm-grants`.
- **Mutations:** 4-9 and 15 from the k0 report, plus five for the write-ahead behaviour, were each observed red and reverted. No permission refusals occurred.
- **Package check:** `pnpm --filter fluxiq check` passes, exit 0, at `fluxiq@0.5.0`.
- **Structure audit:** exit 1. Its only failure is `docs/working/README.md` being out of date, which is not mine; K0.1 reported the same failure.
- **Structure:** I split the service class after the audit flagged it at 34 methods and 726 lines. It is now 21 methods and 477 lines; it was 544 lines before this work.

## What changed and why

### Record format (`types.ts`)

`EncryptedSecretValueRecord` is a union of `EncryptedSecretValueRecordV1` (unchanged) and `EncryptedSecretValueRecordV2`, which adds `kdfParams` and an optional `sealedByUserId`. This is the public type change named in the k0 report §4.8.

`SecretKeyRecord` also gains an optional `pendingSealed`: the value re-sealed under the user's next password, written before the credential write and removed when the change settles.

### Runtime files

| File | What it owns |
| --- | --- |
| `runtime/service.ts` | **Public surface.** Every existing public method keeps its signature. Adds an optional `passwordKdf` constructor option and the three credential-change methods. Re-exports `SecretKeyCredentialChange`, `SecretKeyCredentialChangeInput`, and `SecretRevealAuthorizationMetadata`. That last type now lives in `held-keys.ts`; its public name is unchanged. |
| `runtime/value-sealer.ts` (new) | **`SecretValueSealer`: sealing and opening.**<br>- AES-256-GCM through `deriveScryptKey`, or the injected `derive`.<br>- `parametersOf`: the read allowlist, checked before any derivation.<br>- `needsReseal`: `version === 1 \|\| isBelowScryptWriteCost(kdfParams, writeParameters)`.<br>- `deriveKey`: version 1 derives from the salt text; version 2 from `decodeKdfSalt(salt)`, failing closed on null.<br>- `seal`: writes version 2 at the write parameters with `createKdfSalt()`.<br>- `openRecord` and `openRecordWithKey` open a seal, by default the record's current one, and check that its payload names the record at `lastRotatedAtMs`. This is the CD5 fix. |
| `runtime/record-guard.ts` (new) | **`isSecretKeyRecord(value, sealer)`.** `version` must match the fields: version 1 has no `kdfParams` or `sealedByUserId`; version 2 has `kdfParams`, a decodable salt, and a non-empty string stamp if a stamp is present. Parameters must pass the allowlist, and a pending seal must be an accepted version 2 seal. Failing records are skipped at load. |
| `runtime/record-write-queue.ts` (new) | **`RecordWriteQueue`:** runs repository writes for one record id in order. |
| `runtime/key-store.ts` (new) | **`SecretKeyStore`: records in memory and on disk.**<br>- Single-flight `load`; a failed read is retried by the next caller.<br>- `sealedFor(userId)`: version 1 records, unstamped version 2 records, and version 2 records stamped for that user.<br>- `persist` and `delete` go through the write queue. A write sends the in-memory state at the moment it runs, so a queued `put` cannot bring back a deleted record. |
| `runtime/held-keys.ts` (new) | **`HeldKeys`: custody of derived keys** in session unlocks and reveal authorizations.<br>- Rule: every held key opens its record's current seal.<br>- `revokeKey` drops a record's holders.<br>- `replaceKey(keyId, nextKey, keepUserId?)` gives holders a copy of the new key and zeroes the old buffers. With `keepUserId`, only that user's sessions keep the key and all other holders are revoked. |
| `runtime/seal-upgrades.ts` (new) | **`SealUpgrades`: upgrading older seals.**<br>- Single-flight per opened seal.<br>- Commits only if the record still holds the exact seal that was opened (compare-and-swap).<br>- Keeps `updatedAtMs` and `lastRotatedAtMs`, replaces held keys, and persists through the queue.<br>- Never rejects: a failed upgrade leaves the verified seal in place.<br>- A `WeakMap` remembers each upgrade's predecessor, so a credential change prepared before an upgrade still applies after it. |
| `runtime/credential-changes.ts` (new) | **`CredentialChanges`:** the write-ahead credential change. Details below. |
| `api/handlers.ts` | The acting user's id, never the payload, is passed as `createdBy` on create and as `actorUserId` on rotate and reveal. A payload `createdBy` is now ignored. |

### How unlocking works now

1. The session unlock is registered before any derivation.
2. Each record is opened with its current seal, or else its pending seal. Its key is added the moment it is verified, and only if the record still holds the same seals it was derived for. A record whose seals were replaced mid-derivation is retried once.
3. If the pending seal opened, it is promoted to current and the old key's holders are revoked; the unlocking session then holds the new key.
4. An upgrade then replaces that key for every holder at once. That includes a concurrent unlock of the same key, so no key travels through the single-flight promise.
5. If the session is revoked or superseded during the unlock, `unlockSession` throws "Secret key session unlock is unavailable". The login route already revokes the Identity Access session when that call throws.

### The credential change, written ahead (the amendment)

The calls K0.5 wired keep their names and signatures:

```ts
prepareCredentialChange(input: { userId: string; currentPassword: string; nextPassword: string }): Promise<{ changeId: string; resealedKeyCount: number }>
commitCredentialChange(changeId: string): Promise<{ changeId: string; resealedKeyCount: number }>
abortCredentialChange(changeId: string): void
```

- **Prepare**, before the credential write, re-seals every key from `sealedFor(userId)` that opens with the current password, stamps it for the user, and **persists it as `pendingSealed` beside the current seal**. The current seal is untouched, so the old password keeps working until commit.
  - A key that does not open is skipped, not refused.
  - If a derivation or the write fails, prepare removes what it placed, zeroes every key, and rejects, so the caller refuses the change.
- **Commit**, after the credential write, promotes each pending seal to current and removes it. A key rotated or deleted in between keeps its newer state; an upgrade in between does not stop the change. The user's own sessions keep the key, with the new copy, and every other holder is revoked.
- **Abort** removes the pending seals and zeroes the keys. It keeps its `void` signature, so the removal is written in the background; a removal that fails to write is dropped by the next unlock or reveal with the current password.
- **Recovery, whatever failed:** an unlock or reveal opens the current seal or else the pending one.
  - If the pending seal opened, the credential was written but the commit did not land: it is promoted, and the old key's holders are revoked.
  - If the current seal opened and no change in this process still owns the pending seal, that change never took effect: the pending seal is dropped.
  - While a change is in flight in this process, a login with the old password leaves the pending seal alone, so a commit that follows still applies.
- **Timeout:** a change neither committed nor aborted within 60 seconds is only forgotten. Its keys are zeroed and its pending seals are left on disk for the next unlock or reveal, so a caller that crashes after writing the credential cannot strand a key. `close()` behaves the same way.
- **Rotation** clears a pending seal, because that seal holds the old value.

### Other hardening

Opening a seal requires a 16-byte GCM tag (`authTagLength: 16`), so a truncated tag no longer authenticates. It is tested.

### Tests: §6 Secret Keys cases and where they live

| Case | Test |
| --- | --- |
| 1 | `service.test.ts`: "persists version 2 sealed payloads that record their parameters…". `global-secret-keys.test.ts` asserts `kdfParams.N === 131072` at real cost and that the key is stamped for the actor. |
| 2 | `service.test.ts`: "reads a version 1 record…" |
| 3 | `seal-upgrades.test.ts`: "re-seals a version 1 key at unlock…". It also asserts the stamp is the unlocking user. |
| 4 | "leaves a version 1 key byte-for-byte unchanged after a wrong-password unlock" |
| 4b (added) | "neither unlocks nor re-seals a version 1 key carrying another key's seal" |
| 5 | "re-seals a version 1 key when it is revealed with its password" |
| 6 | "shares one re-seal between concurrent unlocks…": one `put`, one seal derivation, and both sessions claim. |
| 7 | "keeps an outstanding password reveal authorization usable after another session re-seals the key" |
| 8 | Two tests: deleted while the upgrade is being derived (8a), and while it is being written (8b). |
| 9 | Two tests: rotated while the upgrade is being derived (9a), and while it is being written (9b). |
| 10 | `service.test.ts`: "fails closed on tampered kdfParams inside the allowlist, and skips a record outside it without deriving" |
| 11 | "does not rewrite a version 2 seal already at the write parameters on unlock". Also `seal-upgrades.test.ts`: "never rewrites a seal stronger than its write parameters", with real N=2^17 read by a weak-parameter service. |
| 12 | "keeps unlocking and claiming a key after a metadata edit" |
| 13 | "tries at unlock only keys sealed for the unlocking user, unstamped keys, and version 1 keys", counting derivations. |
| 14 | "reads its own weak-parameter records, while a service at the real parameters skips them without deriving", plus "refuses test-only weak parameters that are not below the current cost". |

`credential-changes.test.ts` (11 tests), driven by a fake caller in the port's order:

| Test | What it pins |
| --- | --- |
| writes each re-sealed copy beside the current seal at prepare, and promotes it at commit | the write-ahead shape: current seal untouched, pending seal stored, another user's key untouched, then promotion |
| **lets the new password unlock and reveal a key when the commit fails after the credential write** | the amendment's first case: the commit's write fails, and both this process and a restart open the key with the new password, promoting the pending seal |
| **leaves the old password working when the credential write fails after prepare, even if abort never runs** | the amendment's third case: after a restart the old password unlocks, claims, and reveals, and the stale pending seal is dropped |
| **aborting removes the pending seals, zeroes the prepared keys, and leaves the old seal working** | the amendment's second case: the old password still reveals, the new one does not |
| keeps the user's session keys and revokes every other holder at commit | key custody across a change |
| keeps a rotation that lands between prepare and commit, and drops the stale pending seal | rotation wins, and its pending seal goes |
| keeps the pending seal of a change still in flight when the old password unlocks, and commits over the upgrade | the in-flight guard, and commit over an upgrade |
| refuses the change, leaving no pending seal and holding nothing, when a derivation fails | prepare's failure path |
| refuses the change and removes its pending seals when writing them fails | prepare's write failure path |
| forgets a change left unsettled past its time limit, leaving its pending seal for the next unlock | the timeout no longer strands a key |
| rejects a change without a user or both passwords | input validation |

Other tests:
- **`service.test.ts` (17):** the 7 existing tests, kept and switched to weak parameters, plus the §6 cases above, the CD5 reveal-authorization check, single-flight load, and the create and rotate stamps.
- **`value-sealer.test.ts` (5):** version 2 derives from the salt bytes, not the salt text, checked with real `scryptSync`; version 1 derives from the salt text; allowlist and salt refusal without deriving; `needsReseal`, including a below-cost version 2; a truncated tag.
- **Small module tests:** `record-guard.test.ts` (4, including pending-seal acceptance and rejection), `record-write-queue.test.ts` (2), `key-store.test.ts` (3).
- **Test support:** `runtime/tests/secret-key-fixtures.ts`. Version 1 fixtures are sealed exactly as the old service did, with `scryptSync` over the salt text.
- **`runtime-llm-grants.test.ts`:** passes `createdBy: login.user.id`, the shape the API produces.
- **Test data:** only dummy passwords.

### Placement

- No `runtime/index.ts` barrel was added. `secret-keys/index.ts`, which I do not own, imports `./runtime/service.ts` directly, and adding a barrel would turn that import into a barrel-skip violation.
- `runtime/` has 8 source files; the `record-` prefix is used by only 2.
- Every test file sits in `runtime/tests/`.

## Commands run and observed results

Every heavy command ran alone. All ran from `F:\!FluxIQ\packages\fluxiq` except the audit, which ran from `F:\!FluxIQ`.

### The original brief

1. **Scoped type check, first attempt:** exit 2, `TS2688: Cannot find type definition file for 'node'` — the config sits outside the package. Fixed by adding `typeRoots`. Rerun: exit 0.
2. **Tests:** `Test Files 8 passed (8)`, `Tests 48 passed (48)`.
3. **Audit:** exit 1 on `docs/working/README.md`, plus warnings `class SecretKeysService has 34 methods, past the 25-method advisory threshold` and `service.ts: 726 lines`. I acted on the warnings by splitting the class.
4. **After the split:** scoped type check exit 0; `Test Files 9 passed (9)`, `Tests 51 passed (51)`; audit exit 1 with the README failure only, the method warning gone, `service.ts: 454 lines` advisory remaining.
5. **Package check:** exit 0.
6. **Mutations 4-9 and 15.** Each was an edit, then the named test file run alone, then a revert.

| # | Edit | Run | Observed |
| --- | --- | --- | --- |
| 4 → false | `needsReseal` returns `false` | seal-upgrades | `8 failed \| 3 passed`, including case 3 and case 5. The five tests that hold a derivation timed out at 15 s, since no upgrade starts. |
| 4 → true | `needsReseal` returns `true` | service + seal-upgrades | `3 failed \| 25 passed`: case 11, the no-downgrade test, and case 13, whose derivation count changed. |
| 5 | `openRecordWithKey` skips the payload check, so an upgrade runs on an unverified payload | seal-upgrades | `1 failed`: case 4b. Case 4 (wrong password) stays green, because GCM fails before a payload exists, so no reordering can reach an upgrade. |
| 6 | Upgrade sets `updatedAtMs: Date.now()` | seal-upgrades | `5 failed \| 6 passed`, including case 3 and case 5. |
| 7 | Single-flight lookup removed | seal-upgrades | `1 failed`: case 6, `expected 2 to be 1` (seal derivations). |
| 8 | `heldKeys.replaceKey` call removed | seal-upgrades | `3 failed`, including case 7, case 3, and case 6. |
| 9a | Compare-and-swap removed (`if (false)`) | seal-upgrades | First run `1 failed` (9a only). 8a stayed green: the removed check let a record without an id into memory under an undefined key. I added `expect((await service.snapshot()).keys).toEqual([])` to 8a. Rerun: `2 failed` (8a and 9a). |
| 9b | Write queue bypassed in `persist` and `delete` | seal-upgrades + key-store | `3 failed`: 8b, 9b, and the key-store queue test. |
| 15 | Payload check compares `updatedAtMs` | service | `2 failed`: case 12, and the existing "actively expires, closes, and invalidates reveal authorizations when a key changes". |

7. **After reverting:** no `MUTATION` marker anywhere in `secret-keys`; `Test Files 9 passed (9)`, `Tests 51 passed (51)`.
8. **Package check at that point:** exit 2, `src/programs/automation-studio/storage/project/index.ts(39,15): error TS2307: Cannot find module './run-dataset-store.ts'` — another worker's change in progress, not a Secret Keys file. The one permitted re-run gave the same single error. That file has since been completed, and the check now passes.

### The write-ahead amendment

9. **Tests:** `Test Files 10 passed (10)`, `Tests 57 passed (57)`, including `runtime-credential-changes` (2 tests, 12.5 s at production cost) and `runtime-llm-grants`.
10. **Type check scoped to Secret Keys only:** exit 0. This config reaches no other program, so it is a clean signal for my files.
11. **Mutations for the write-ahead behaviour.** Each was an edit, then `credential-changes.test.ts` run alone, then a revert.

| # | Edit | Observed |
| --- | --- | --- |
| 16 | `openCurrentOrPending` never tries the pending seal | `1 failed`: "lets the new password unlock and reveal a key when the commit fails after the credential write". |
| 17 | Prepare keeps the pending seals in memory and does not write them | `5 failed`, including the commit-failure recovery test, the prepare test, the abort test, the prepare-write-failure test, and the timeout test. |
| 18 | Abort zeroes its keys but leaves the pending seals on their records | `1 failed`: "aborting removes the pending seals, zeroes the prepared keys, and leaves the old seal working". |
| 19 | Prepare writes the next seal as the current seal instead of beside it | `7 failed`, including "leaves the old password working when the credential write fails after prepare, even if abort never runs". |
| 20 | `settle` drops a pending seal whose change is still in flight | `1 failed`: "keeps the pending seal of a change still in flight when the old password unlocks, and commits over the upgrade". |

12. **After reverting:** no `MUTATION` marker in `secret-keys`; `Test Files 10 passed (10)`, `Tests 57 passed (57)`.
13. **Audit:** exit 1, the `docs/working/README.md` failure only. `service.ts: 477 lines` keeps the 400-line advisory; no method warning; nothing new from the pending-seal code.
14. **Package check:** `pnpm --filter fluxiq check` → **exit 0** at `fluxiq@0.5.0`.

## Not verified

- **Out of scope for this brief:** `pnpm test`, `pnpm build`, and any live login or browser run.
- **Upgrade from a cost below 2^17** runs end to end only once the current cost is raised. It is unit-tested through `needsReseal` only.
- **No real N=2^18 derivation** was run.
- **The pending-seal paths at production cost.** `runtime-credential-changes` exercises a real password change end to end, but the failure paths (commit failure, abort, crash before the credential write) are covered only at weak test parameters.
- **Cross-process pending seals.** A second process writing the same store is still outside the design; the single-writer assumption is stated in code comments.
- **Race paths without direct tests:** `unlockSession` throwing when its session is revoked partway through; the "changed during reveal" and "changed during authorization" errors; the unlock retry after a seal is replaced mid-derivation.
- **Timings** are single observations on this faulty-RAM machine: the real-cost no-downgrade test 1.0-1.2 s, `runtime-credential-changes` 11.5-12.5 s.
- **Mutations 1-3 and 10-14** from the k0 report were not run; they are not in this brief.

## Open questions or contradictions found

1. **Stamp order differs from k0 report §4.7.**
   - §4.7 stamps an upgraded version 1 seal with `createdBy` first, then the unlocking user.
   - I stamp the user whose password just opened the seal first, then any existing stamp, then `createdBy`.
   - Reason: a key created by user A but last rotated under user B's password would otherwise be stamped for A, and B's logins would stop trying it.
   - Reverting to §4.7 is a one-line change in `seal-upgrades.ts` (`reseal`).
2. **Unstamped version 2 keys are tried for every user at unlock, like version 1 keys.** CD4 reads as "only keys sealed for that user plus version 1". Such keys arise only from direct service calls without an actor; the handlers always pass one. Without this, those keys could never be unlocked into a session.
3. **Credential-change edge cases that remain.**
   - A version 1 or unstamped key that opens with the user's current password is treated as theirs. If two users share a password, the first to change password takes it.
   - A key created or rotated under the old password between prepare and commit is not moved.
   - A pending seal is a second ciphertext of the same value under a second password. It is removed at commit, at abort, or at the next unlock or reveal that settles it, but it exists on disk in between.
4. **Abort stays `void`,** as K0.5 wired it, so its removal write is not awaited. A failed removal is repaired by the next unlock or reveal with the current password.
5. **The timeout no longer deletes anything.** A change left unsettled for 60 seconds is forgotten in memory only; its pending seals stay on disk by design, so a caller that dies after writing the credential cannot strand a key.
6. **Error text changed.** A wrong-password reveal now says "Secret key could not be opened"; a wrong-password `createRevealAuthorization` now fails with "Secret reveal authorization was refused", where before it succeeded. I did not search `apps/web` for UI that matches on message text. K0.5's `runtime-credential-changes` test already asserts the first message.
7. **Handler change.** A payload `createdBy` is ignored in favour of `request.actor?.userId`.
8. **Generated framework reference.** `SecretRevealAuthorizationMetadata` moved files and is re-exported under the same name, so the reference's location column changes when the generated docs are next rebuilt.
9. **The audit's remaining failure is not mine:** `docs/working/README.md` needs `pnpm structure:baseline`.
10. **The plan moved during the first run.** The brief's heading went from line 600 to line 534 of the plan. I re-read it at the new position, and its text was the same.
