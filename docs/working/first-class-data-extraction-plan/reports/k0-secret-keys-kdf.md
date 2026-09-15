# Report: k0-secret-keys-kdf

Worker report for brief `k0-secret-keys-kdf` in
`docs/working/first-class-data-extraction-plan.md`. Read-only investigation of
FluxIQ Core, 2026-09-15. Path prefixes: `SK/` is
`packages/fluxiq/src/programs/secret-keys/`, `IA/` is
`packages/fluxiq/src/programs/identity-access/`, `SH/` is
`packages/fluxiq/src/programs/_shared/`. No real secret, password, hash, or
key appears in this report. The timing probe used only a dummy password.

---

## Outcome

Done. The brief asked for an inventory and a fix design, and both are below.

- **Four password-derived sites**, all in two files, all calling
  `scryptSync(value, salt, 32)` with Node's defaults (N=2^14, r=8, p=1,
  maxmem 32 MiB). None records its parameters:
  1. the Secret Keys value seal;
  2. the Identity Access credential seal;
  3. the Identity Access password hash;
  4. the Identity Access PIN hash, which is also persisted **outside** the seal
     as `pinVerifierHash`.
- No pbkdf2, argon2, bcrypt, HKDF, or WebCrypto key derivation exists in Core
  source. The Client Gateway token SHA-256 is excluded because it hashes a
  32-byte random token, not a password.
- **Timings, single observations on faulty RAM (Node v22.11.0, x64):**
  - N=2^14: 44 ms.
  - N=2^17, r=8, p=1, maxmem 256 MiB: 357 ms sync, 347 ms async.
  - N=2^17 with maxmem of 128 MiB or 134,220,799 bytes is refused
    (`ERR_CRYPTO_INVALID_SCRYPT_PARAMS`). The requirement is
    128·r·(N+2)+128·r·p = 134,220,800 bytes.
- **Login cost today is 4 + K scrypt calls (cold) or 2 + K (warm).** K is
  the number of *all* Secret Keys records, whoever owns them. At N=2^17 with
  the code as it is, that is about 1.4 s + 0.36 s·K, blocking the event loop.
  The design brings it to about 0.36 s + 0.36 s·⌈K/2⌉ without blocking.
- **Design:**
  - Versioned v2 envelopes and a PHC-style hash string that record their
    scrypt parameters.
  - One shared async KDF module, with an allowlist of parameters and a
    concurrency limit.
  - Opportunistic re-seal at the next successful login, unlock, reveal, or PIN
    check. It runs once per record at a time and swaps the keys other sessions
    hold.
  - Redundant derivations removed.
- **Three pre-existing defects found by reading** (not executed):
  1. Any Secret Keys metadata update makes that key permanently unusable for
     login session unlock and LLM grants.
  2. Changing a password leaves every Secret Key sealed under the old one
     unreadable.
  3. The PIN verifier hash sits in cleartext metadata, where 10^4 PINs are
     brute-forceable offline at any scrypt cost.

## What changed and why

Only this report file was written. No source, document, or `.fluxiq` data was
touched; `git status --short` in `F:\!FluxIQ` was clean. The findings and
design follow.

### 1. Inventory

#### Site A: Secret Keys value seal (`SK/runtime/service.ts`)

- **KDF:** `deriveSecretKey` (456-461), `scryptSync(password, salt, 32)`.
  - The salt is 16 random bytes as a base64url *string*, fed to scrypt as
    UTF-8.
  - Parameters are Node's implicit defaults, so v1 readability depends on
    Node's default never changing.
- **Envelope:** `encryptSecretValue` (463-480) writes
  `EncryptedSecretValueRecord` (`SK/types.ts:30-38`):
  `{ version: 1, algorithm: "aes-256-gcm", kdf: "scrypt", salt, iv(12 bytes), tag, ciphertext }`.
  - There is no additional authenticated data.
  - The plaintext is JSON `{ id, value, updatedAtMs }`, where `updatedAtMs`
    equals the record's `lastRotatedAtMs` at seal time.
- **Stored record:** `SecretKeyRecord` (`SK/types.ts:24-28`): summary fields
  plus `recordType: "secret-key"`, `encrypted: true`, and `sealed`.
  - It lives in the `secret.keys` table of `global.sqlite`
    (`SH/runtime.ts:57,71`) with id `secret:<uuid>`, via `secretRecord`
    (400-406).
  - Writes are a blind upsert (`database-manager/storage/sqlite-repository.ts:71-92`).
- **Read guard:** `isSecretKeyRecord` / `isEncryptedSecretValueRecord`
  (515-539) require `version === 1` and `kdf === "scrypt"`. `load` (383-392)
  silently skips any record that fails it.
- **Public type:** `EncryptedSecretValueRecord` is exported through
  `SK/index.ts` → `programs/index.ts:17` → `src/index.ts:10`.

| Path | Where | KDF calls |
| --- | --- | --- |
| Create | `createKey` 120-145 (seal at 140); API `create-key` `SK/api/handlers.ts:22-34`, gate `authorizeSessionPasswordPin` (no TOTP) | 1, plus gate |
| Read metadata | `snapshot` 105-112, `getKeySummary` 114-118 | 0 |
| Update metadata | `updateKey` 147-167; bumps `updatedAtMs` (150, 161), revokes held keys (164); API `update-key` 35-47 | 0, plus gate |
| Rotate | `rotateKey` 169-183 (new salt, 177); API `rotate-key` 48-59 | 1, plus gate |
| Reveal (password) | `revealKey` 185-197 → `decryptSecretValue` 482-489 (zeroes key 487); checks payload `id` only (189); API `reveal-key` 60-71 (full gate with TOTP); `resolveSecretValue` 207-209 | 1, plus gate |
| Reveal authorization (password) | `createRevealAuthorization` 211-232; derives at 217 **without verifying** that it decrypts; tests are the only callers | 1 |
| Unlock at login | `unlockSession` 234-264: trial-decrypts **every** record (242-252), keeps keys whose payload `updatedAtMs === record.updatedAtMs` (246), zeroes failures (250); caller `apps/web/src/app/api/auth/login/route.ts:63-68`, which revokes the identity session if unlock throws (69-72) | K |
| Session reveal authorization | `createSessionRevealAuthorization` 266-298 copies the held key (291); caller `automation-studio/runtime/llm/execution-grants.ts:168-181`, which binds `keyUpdatedAtMs` (162, 175) | 0 |
| Claim | `revealKeyWithAuthorization` 300-330: decrypts with the held key (313), compares payload `updatedAtMs` to the record (314), persists `lastRevealedAtMs` (317) | 0 |
| Delete | `deleteKey` 199-205; API `delete-key` 72-83 | 0, plus gate |
| Revoke | `revokeRevealAuthorization` 332-338, `revokeSessionUnlock` 348-359, `revokeRevealAuthorizationsForKey` 366-376, `close` 361-364; logout `apps/web/src/app/api/auth/logout/route.ts:11-13` | 0 |
| Password change | None. Identity Access never re-seals Secret Keys; see open question 2 | none |

#### Site B: Identity Access credential seal (`IA/runtime/service.ts`)

- **KDF:** `deriveCredentialKey` (658-663), same call and salt form as Site A.
- **Envelope:** `encryptCredential` (665-681) writes the module-local type
  `EncryptedCredentialRecord` (34-42), same shape as Site A.
  - The plaintext is the whole `UserCredential` (`IA/types.ts:29-36`):
    `passwordHash`, `pinHash`, `totpSecret`, `pendingTotpSecret`,
    `updatedAtMs`.
  - `tryEncryptCredential` (582-592) re-encrypts with the cached key on every
    `persist()`, keeping the same salt and using a fresh IV.
  - `decryptCredential` (683-696) never zeroes its derived key, and the
    `credentialKeys` map (58) holds keys for the life of the process.
- **Stored record:** id `credential:<userId>`, kind `identity.users`, in
  `global.sqlite` (`SH/runtime.ts:56,70`), written by `persist` (456-467).
  Data is `{ stateKind, recordType: "credential", encrypted: true, metadata: CredentialMetadata (646-656), sealed }`.
- **Read guard:** `isEncryptedCredentialRecord` (698-707) requires version 1.
  `readStoredState` (482-513) drops a record that fails it (500-505), and
  that user then cannot log in.
- **Legacy plaintext records** (`recordType: "credential"` with a cleartext
  `credential` field) are still read (503-505). They are sealed at that user's
  next login.
- **Paths:**
  - Create: `setCredentialHash` 539-549 (key at 545), called from
    `upsertUser` 109, `setPassword` 144-149, `setPasswordAuthorized` 151-178,
    and `ensureDefaultAdmin` 594-610.
  - Unlock: `unlockCredentialWithPassword` 560-580.
  - Delete: none. There is no user or credential delete, and the endpoints in
    `IA/api/contracts.ts:3-16` include none.
  - Admin reset of another user's sealed credential replaces it with an empty
    credential (169-172), which drops PIN and TOTP.

#### Site C: password hash `passwordHash` (`IA/runtime/service.ts`)

- **Hash:** `hashSecret` (631-635) produces `scrypt:<salt>:<hash>`.
  `verifySecret` (637-644) ignores the prefix and uses `timingSafeEqual` on
  base64url strings. No parameters are recorded.
- **Where it lives:** inside the Site B seal, and in cleartext in legacy
  plaintext credential records.
- **Created:** `setCredentialHash` (541), via:
  - `upsertUser` 109, API `create-user` `IA/api/handlers.ts:24-33`;
  - `setPassword` 146;
  - `setPasswordAuthorized`, API `set-password` 52-68;
  - `ensureDefaultAdmin` 608;
  - the e2e seed `apps/web/e2e/support/seed-fixtures.mjs:61`.
- **Verified:**
  - `authenticate` 266;
  - `unlockCredentialWithPassword` 562 and 570;
  - `verifyCredentialGate` 553, used by `authorizeSessionCredentials` 310-319
    and `authorizeSessionPasswordPin` 321-330, which in turn serve Secret Keys
    mutations, the Database Manager sensitive-store view
    (`database-manager/api/handlers.ts:97-119`), `update-user` role changes,
    `disable-totp`, and credential rotation;
  - `unlockVault` 368.

#### Site D: PIN hash `pinHash` and `pinVerifierHash` (`IA/runtime/service.ts`)

- **Hash:** the same `hashSecret`. Created at `setCredentialHash` via
  `upsertUser` 110, `setPin` 180-185, `setPinAuthorized` 187-203 (API
  `set-pin` 69-85), and the e2e seed `seed-fixtures.mjs:62`.
- **Stored twice:**
  - inside the seal as `pinHash`;
  - **in cleartext metadata** as `pinVerifierHash` (23, 651, persisted at
    462).
- **Verified:**
  - `authorizeSessionPin` 332-342, which falls back to metadata at 337. It
    serves every Automation Studio PIN-gated handler through
    `SH/authorization.ts:14-22`. PINs are 4-12 digits (`SH/authorization.ts:10`).
  - `verifyCredentialGate` 554.
  - `unlockVault` 369.
- **Upgrade precedent:** `ensurePinVerifierMetadata` 474-480 already upgrades
  metadata at login (`authenticate` 271).

#### Excluded, with reason

- `client-gateway/service/trusted-clients.ts:30-32`: SHA-256 of a
  `randomBytes(32)` token (`client-gateway/service/config.ts:24`). High-entropy
  input, so a fast hash is correct.
- TOTP HMAC-SHA1 (`IA/runtime/service.ts:739-746`,
  `programs/tests/totp-code.ts:11`) and WebSocket accept SHA-1
  (`apps/web/src/server/client-gateway-websocket.ts:122`). Neither involves a
  password.
- Every other `createHash` hit is a content digest.

#### Existing tests

- `SK/runtime/tests/service.test.ts`, lines 11, 31, 57, 87, 129, 143, 163:
  - redacted snapshot and wrong password;
  - persisted seal without plaintext, asserting `kdf: "scrypt"` at 48;
  - one-use authorization zeroing;
  - session unlock and revocation;
  - expiry and wrong-password unlock;
  - invalidation on update, rotate, and close;
  - fail-closed on delayed persist, with a fake repository counting `put`
    calls.
- `programs/tests/global-secret-keys.test.ts:10`: create without TOTP, reveal
  requires TOTP.
- `programs/tests/global-identity-access.test.ts`:
  - 17 sessions; 28 final admin; 38 login and gate; 58 PIN rotation;
  - 95 Studio PIN; 168 legacy PIN metadata upgrade;
  - 225 sealed credential shape, asserting `kdf` at 244-247;
  - 258 legacy plaintext migration; 318 TOTP login; 333 disable-TOTP recheck;
  - helper `testHashSecret` 360-364 builds the legacy hash format.
- `SH/tests/runtime-llm-grants.test.ts:14`: login, `createKey` (38),
  `unlockSession` (48), grant issue.
- `apps/web/src/app/api/auth/login/tests/route.test.ts:5`: TOTP format only.
  No test covers login plus unlock.
- `apps/web/src/features/automation-studio/testing/tests/phase8-fixture-integrity-contract.test.ts:14-15`:
  asserts that the seed calls `setPassword` and `setPin`.

### 2. KDF calls per operation today (counted from code)

| Operation | Calls |
| --- | --- |
| Login, cold (sealed credential not in memory: after restart, or after `validateSession` → `reloadFromStore` clears maps at 433-436) | 4: decrypt (569→684), inner hash verify (570), re-derive the same key (575), verify again (266); plus K for `unlockSession` |
| Login, warm | 2: verify (562), verify again (266); 3 if the key is not cached (563); plus K |
| Wrong password | 1 cold; 2 warm (562 fails, then decrypt fails) |
| Credential gate (password, PIN) | warm 2-3 (562, 553, 554); cold 4-5 |
| PIN gate (`authorizeSessionPin`) | 1 |
| `setPassword` | 2 (hash 541, key 545) |
| `setPin` | 1 |
| Secret create, rotate, reveal, password authorization | 1 each, plus any gate |

`unlockSession` derives for every record, including keys other users sealed
under other passwords. Those derivations are pure cost at every login.

### 3. Timing (single observations, faulty-RAM machine)

The probe was `k0-scrypt-timing-probe.cjs` in the session scratchpad: a dummy
password and salt, each key zeroed at once, nothing printed but timings. The
output was captured before the session's computer crash; the probe was not
rerun.

| Cost | Mode | Result |
| --- | --- | --- |
| N=2^14, r=8, p=1, maxmem 32 MiB (current) | sync | 44 ms |
| N=2^17, r=8, p=1, maxmem 128 MiB | sync | refused, `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` |
| N=2^17, r=8, p=1, maxmem 134,220,799 | sync | refused, `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` |
| N=2^17, r=8, p=1, maxmem 256 MiB | sync | 357 ms |
| N=2^17, r=8, p=1, maxmem 256 MiB | async | 347 ms |

`typeof require("node:crypto").argon2` is `undefined` on Node 22.11.0, and CI
runs Node 22 (`docs/architecture/package-boundaries.md:84`). Argon2id would
therefore need a native dependency, which is why scrypt stays.

### 4. Design

#### 4.1 Parameters

- **New seals and hashes:** scrypt N=2^17, r=8, p=1, keyLength 32. This is
  OWASP's scrypt minimum.
- **maxmem = 256·N·r bytes.** That is 256 MiB at the target, which was
  observed to work, and 32 MiB at 2^14, which equals Node's default.
- **Why not stronger now:** N=2^18 would double every figure in 4.7 (about
  0.7 s per derivation, projected, not measured) and needs 512 MiB maxmem.
  Recommend N=2^17 now, and put 2^18 in the read allowlist so a later raise is
  a constant change that re-seals automatically.
- **Read allowlist, exact match:**
  - v1 is implied as `{N: 2^14, r: 8, p: 1, keyLength: 32}`, stated as an
    explicit constant rather than Node's implicit default;
  - v2 accepts `{2^17 | 2^18, 8, 1, 32}`;
  - anything else is rejected before any derivation, so a tampered record
    cannot request 2^30.

#### 4.2 Shared module

The two copies are replaced by one module used by both programs. It is also
the module downstream D13 (open question 5) should reuse.

Proposed location: `SH/password-kdf/` with an `index.ts` barrel. Placement
must be confirmed against `docs/architecture/code-structure.md`, which this
worker did not read. `SH/` has 9 entries today.

- **`scrypt-parameters.ts`:** the `ScryptParameters` type, the
  `CURRENT_SCRYPT_PARAMETERS`, `LEGACY_V1_SCRYPT_PARAMETERS`, and accepted
  sets, and an `isAcceptedScryptParameters` guard.
- **`derive-scrypt-key.ts`:** `deriveScryptKey(secret, salt, params): Promise<Buffer>`.
  It checks the allowlist, uses async `crypto.scrypt` with the maxmem above,
  and runs through the limiter.
- **`scrypt-derivation-limiter.ts`:** a process-wide limiter with
  concurrency 2.
  - It bounds transient memory to about 256 MiB.
  - It leaves two of libuv's four default threads for fs and sqlite3 work.
  - It must be promise-only, with no timers, because two existing tests use
    `vi.useFakeTimers()`.
- **`password-hash.ts`** (split into `hash-password.ts` and
  `verify-password-hash.ts` if the one-export rule requires it):
  - writes `$scrypt$ln=17,r=8,p=1$<salt>$<hash>`;
  - reads that form and legacy `scrypt:<salt>:<hash>` (as ln=14);
  - returns `{ ok, needsRehash }`;
  - uses `timingSafeEqual` on decoded bytes;
  - returns `ok: false` for malformed input and never throws.
- **Injection, for tests only.** Each service takes an optional
  `passwordKdf?: { derive?: DeriveFn; testOnlyWeakParameters?: ScryptParameters }`.
  - `derive` lets tests count derivations.
  - `testOnlyWeakParameters` (such as N=2^10) is the only way to write below
    the floor, and it widens only that instance's read allowlist.
  - `createGlobalProgramRuntime` (`SH/runtime.ts:70-71`) passes neither.

#### 4.3 Record formats

```ts
type ScryptParameters = { N: number; r: number; p: number; keyLength: 32 };

// Secret Keys (SK/types.ts); the exported name becomes the union
type EncryptedSecretValueRecordV1 = { version: 1; algorithm: "aes-256-gcm"; kdf: "scrypt"; salt: string; iv: string; tag: string; ciphertext: string };
type EncryptedSecretValueRecordV2 = { version: 2; algorithm: "aes-256-gcm"; kdf: "scrypt"; kdfParams: ScryptParameters;
  sealedByUserId?: string; salt: string; iv: string; tag: string; ciphertext: string };
type EncryptedSecretValueRecord = EncryptedSecretValueRecordV1 | EncryptedSecretValueRecordV2;

// Identity Access credential seal: the same V1/V2 shapes without sealedByUserId
// (the record id names the user). The inner passwordHash/pinHash use the PHC string.
```

- **Plaintexts do not change.**
- **The salt stays** 16 random bytes as a base64url string, as today.
- **No additional authenticated data is used.** Salt and `kdfParams` are key
  inputs, and IV and tag are GCM inputs, so tampering with any of them already
  fails closed. The guard ties `version` to the presence of `kdfParams`. An
  AAD binding would have no observable effect and so could not be
  mutation-tested.
- **`sealedByUserId`** (recommended; see 4.7 and open question 4) is a
  non-secret hint. Tampering with it affects only availability.

#### 4.4 Reading older records

- Readers accept v1 (legacy parameters) and v2 (allowlist).
- Legacy plaintext credential records keep working.
- Legacy hash strings verify at ln=14 and report `needsRehash`.

#### 4.5 Re-seal at the next successful unlock or login (no user step)

The rule is to upgrade only after a successful decrypt or verification. The
condition is `version === 1 || kdfParams ≠ this instance's write parameters`,
not `version === 1`, so that later raises also upgrade. Test instances must
not re-seal on every call.

**Secret Keys**, re-sealed in `unlockSession` and `revealKey`:

1. Decrypt with the recorded parameters. Keep the plaintext value until it
   has been re-sealed; today it is dropped at 247.
2. Seal again with a new salt and IV at the write parameters, keeping the
   payload `{ id, value, updatedAtMs }` as it was.
3. Commit only if `this.records.get(id)?.sealed === openedSealed`, an
   identity compare-and-swap. If a rotation or delete won the race, zero the
   new key and give up.
4. Write `{ ...record, sealed: next }` and **do not change** `updatedAtMs`
   or `lastRotatedAtMs`. LLM grants and Flow settings bind `keyUpdatedAtMs`
   (`execution-grants.ts:162,175`).
5. Persist through a per-record write chain, so an in-flight re-seal `put`
   cannot resurrect a record that `deleteKey` removed. The same race exists
   today for the `lastRevealedAtMs` write at 317.
6. Swap held keys: for every session unlock and reveal authorization holding a
   key for that id, fill the old buffer with zeros and store
   `Buffer.from(newKey)`. This is sound because both holders proved the same
   password against the same v1 seal. Without this step, claims fail the GCM
   check.
7. Retain the **new** key in the unlocking session.

**Identity Access**, re-sealed in `authenticate` and the credential gates:

- **Cold path:** after decrypting a v1 seal, derive a new-salt key at the
  write parameters into `credentialKeys`. The existing `createSession` →
  `persist()` → `tryEncryptCredential` then writes v2. `encryptCredential`
  takes `kdfParams` from the cached key object.
- **Legacy `passwordHash`:** rehash it once the verification succeeds.
- **PIN hash:** rehash on a successful PIN check in `authorizeSessionPin` or
  `verifyCredentialGate`, **only if the full credential is in memory**. Then
  recompute the metadata and persist. Upgrading metadata alone would make
  `ensurePinVerifierMetadata` (477) copy the old inner hash back at the next
  login.
- **Default admin and new users** are written v2 from the start.

#### 4.6 Concurrent unlocks

- **Converting to async opens interleavings.** Today `unlockSession`'s loop
  and the identity paths run to completion synchronously.
- **Prerequisite: single-flight `load()` in both services.** Both set
  `loaded = true` before awaiting the store (`SK` 385-387, `IA` 410-415). A
  concurrent caller can then see empty maps: zero keys unlocked, or "Invalid
  username". Async derivation widens that window. Memoize a `loadPromise`.
- **Secret Keys:** `resealing: Map<keyId, Promise<{ sealed, key } | null>>`.
  A second unlock of the same v1 record first verifies its own v1 decrypt.
  Then it awaits the promise and takes `Buffer.from(key)` instead of sealing
  again. Exactly one `put` results.
- **Identity:** `credentialUpgrades: Map<userId, Promise<CredentialKey>>`.
  Concurrent cold logins share one new-salt derivation.
- **Across processes:** writes are blind upserts, and `SecretKeysService`
  never reloads after its first load. A second process can therefore write a
  v1 seal back when it persists `lastRevealedAtMs`. The re-seal is
  idempotent, so the next unlock there upgrades again. Recommend documenting
  the single-writer assumption rather than adding compare-and-swap in K0
  (open question 6).

#### 4.7 Login latency

Projected as call counts × the single observations in §3. K is the number of
records tried at unlock. The design column assumes the limiter's two
derivations run on two free cores, which was not measured.

| Scenario | Today (2^14) | 2^17, code as is (sync, blocks the event loop) | 2^17 with design (async) |
| --- | --- | --- | --- |
| Cold login | 176 + 44K ms | 1,428 + 357K ms | 357 + 357·⌈K/2⌉ ms |
| Warm login | 88 + 44K ms | 714 + 357K ms | 357 + 357·⌈K/2⌉ ms |
| Cold login, K=3 / K=10 | 0.31 / 0.62 s | 2.5 / 5.0 s | 1.1 / 2.1 s |
| First login after upgrade (v1 data), K=3 | not applicable | about 2.9 s | about 1.6 s (identity 44+357+357, keys ⌈3/2⌉×401) |
| Credential gate (password, PIN) | 88-132 ms | 714-1,071 ms | 357-714 ms |
| PIN-gated Studio action | 44 ms | 357 ms | 357 ms (off the event loop) |

The design column depends on these required changes:

1. **One identity derivation per operation.**
   - `unlockCredentialWithPassword` returns a verified credential or throws
     on every path. Today its `!sealed` branch (567) returns unverified,
     which is why 266 and 553 verify again.
   - A successful GCM decrypt proves the password, so the inner check at 570
     goes.
   - `decryptCredential` returns its key, so the re-derive at 575 goes.
2. **Async derivation.** A login no longer stalls every other request in the
   Next.js process, including gateway traffic.
3. **Recommended `sealedByUserId`.** `unlockSession` tries only v2 records
   sealed for the logging-in user, plus all v1 records until they are
   upgraded. K then becomes the user's own keys instead of every key.
   - `createKey` and `rotateKey` take the actor id, which the handler already
     passes as `createdBy` at `SK/api/handlers.ts:32`.
   - A v1 re-seal stamps `createdBy` if present, otherwise the unlocking user.

Unknown usernames still return before any derivation (263-264). The timing
difference from known users grows from 44 ms to 357 ms (open question 7).

#### 4.8 Compatibility and version impact

- **Data moves forward only.** New binaries read v1 and write v2; there is no
  schema migration, because the envelope is JSON inside `data`. An older
  binary silently skips v2 records:
  - a user whose credential was re-sealed **cannot log in**, the default
    admin is not recreated (595), and the record is not overwritten;
  - Secret Keys records disappear from snapshots;
  - a v2 `pinVerifierHash` fails the PIN gate with "Invalid PIN".
- **Rollback** means rolling forward, or restoring a `global.sqlite` backup
  taken before the upgrade. Say so in the migration note.
- **Wire contracts do not change.** Snapshots exclude `sealed`, and the
  endpoints are unchanged. The Database Manager's sensitive-store view will
  show `kdfParams`, which are not secret.
- **The public type changes.** `EncryptedSecretValueRecord`, which `fluxiq`
  exports, widens from `version: 1` to a union, and `IdentityAccessService` and
  `SecretKeysService` gain optional constructor options.
- **Version:** the policy at `package-boundaries.md:86-92` judges
  compatibility by what a consumer observes. Downgrade lockout and a widened
  exported type are both consumer-observable. Recommend `fluxiq` 0.4.0 →
  **0.5.0** with a Migration Notes entry.
- **Downstream:** the Web Extension uses Client Gateway pairing, which is
  unaffected. D13's Encrypt-column key custody should consume `SH/password-kdf`.

#### 4.9 Documents to update

- `docs/operations/data-and-state.md`:
  - 198-203: v2 envelope parameters, PHC hash form, upgrade at login and PIN
    use.
  - 213-217: plaintext legacy migration now seals v2.
  - 238-243: add the v2 fields and re-seal at unlock and reveal. Also correct
    the claim at 242-243 that only reveal decrypts: `unlockSession`
    trial-decrypts every value at login.
  - 255-257: envelope field list.
  - Add a downgrade note.
- `docs/programs/global-programs.md:53-55`: parameters are now recorded.
- `docs/architecture/automation-studio/persistence.md:119-129`: add
  "re-seal swaps held keys and zeroes the old ones" to the key lifecycle.
- `docs/architecture/package-boundaries.md`: version line 86, plus a
  Migration Notes entry.
- Generated `docs/reference/framework-reference.md` and
  `packages/fluxiq/docs/reference/framework-reference.md`: regenerate through
  their owning script, never by hand.
- The working document's open question 6: close it with the decisions.

### 5. Ordered steps (exact files, partitioned for workers)

1. **K0.1 Shared KDF** (one worker, first). New `SH/password-kdf/{index.ts, scrypt-parameters.ts, derive-scrypt-key.ts, scrypt-derivation-limiter.ts, password-hash.ts}`
   and `SH/password-kdf/tests/*.test.ts` (§6). Nothing else depends on the
   other steps.
2. **K0.2 Secret Keys** (worker S, after K0.1). Owns `SK/types.ts`,
   `SK/runtime/service.ts`, `SK/api/handlers.ts` (actor id to create and
   rotate for `sealedByUserId`), `SK/runtime/tests/service.test.ts`,
   `programs/tests/global-secret-keys.test.ts`, and
   `SH/tests/runtime-llm-grants.test.ts`. In order:
   1. single-flight `load`;
   2. v1/v2 union and allowlist guard;
   3. async seal and open through `deriveScryptKey`, removing `scryptSync`;
   4. the injectable `passwordKdf` option;
   5. re-seal in `unlockSession` and `revealKey` with compare-and-swap,
      single-flight, per-record write chain, and held-key swap;
   6. `sealedByUserId` filtering;
   7. fix the payload comparison at 246 and 314 to use `lastRotatedAtMs`
      (open question 1).
3. **K0.3 Identity Access** (worker I, parallel with K0.2; no shared files).
   Owns `IA/runtime/service.ts`, a new credential-seal module under
   `IA/runtime/` (placement by code structure), a new
   `IA/runtime/tests/service.test.ts`, and
   `programs/tests/global-identity-access.test.ts`.
   - **Size budget first.** `service.ts` is 747 lines against the 800 limit,
     and `IdentityAccessService` has about 37 methods against 40, counted by
     reading. Move hash, verify, derive, encrypt, decrypt, and guard (631-707)
     into the new module rather than adding methods.
   - Then, in order:
     1. single-flight `load`;
     2. async `setCredentialHash`, `ensureDefaultAdmin`, and the gates;
     3. v2 envelope and PHC hashes;
     4. one derivation per operation (4.7);
     5. cold-login re-seal and legacy rehash with a per-user single-flight;
     6. PIN rehash when the credential is in memory;
     7. zero derived keys in the decrypt path.
   - Rename the test helper `testHashSecret` to `legacyTestHashSecret`.
4. **K0.4 PIN verifier decision** (open question 3). If accepted, it belongs to
   worker I: remove `pinVerifierHash` from persisted metadata and keep the
   "sign out and sign back in" path at 338.
5. **K0.5 Docs and version** (supervisor or a docs worker, after K0.2 and
   K0.3): the §4.9 files and `packages/fluxiq/package.json:3`.
6. **K0.6 Validation** (supervisor):
   1. `pnpm structure:check`;
   2. targeted vitest files;
   3. `pnpm check`, `pnpm test`, `pnpm build`, run one at a time on this
      machine;
   4. one manual web login against an *isolated* fixture root seeded with v1
      records, timing the login once and confirming the records became v2.
      Never use the user's `.fluxiq`.

No change is needed in `apps/web/src/app/api/auth/login/route.ts`: it already
awaits `authenticate` and then `unlockSession`.

### 6. Tests: files and cases

`SH/password-kdf/tests/`

- **`derive-scrypt-key.test.ts`:**
  - N=2^17 with the computed maxmem derives 32 bytes;
  - parameters outside the allowlist (N not a power of two, N=2^30, r≠8,
    p≠1, keyLength≠32) are rejected before `crypto.scrypt` is called (spy).
- **`scrypt-derivation-limiter.test.ts`:**
  - at most 2 in flight with an injected slow derive;
  - the queue drains in order;
  - no timers are used, and it works under `vi.useFakeTimers()`.
- **`password-hash.test.ts`:**
  - a new hash matches `^\$scrypt\$ln=17,r=8,p=1\$`;
  - legacy `scrypt:salt:hash` verifies with `needsRehash: true`;
  - v2 verifies with `needsRehash: false`;
  - a wrong value returns `ok: false`;
  - malformed strings and out-of-allowlist `ln` return `ok: false` without
    throwing or deriving.

`SK/runtime/tests/service.test.ts` (low-cost test parameters unless noted)

1. A new seal records `version: 2` and `kdfParams`; extend the assertion at 48.
2. A v1 fixture record (built with legacy parameters) reveals with the right
   password and rejects the wrong one.
3. `unlockSession` on v1:
   - the stored record becomes v2 with a new salt;
   - `updatedAtMs` and `lastRotatedAtMs` are unchanged;
   - `unlockedKeyCount` is 1;
   - a session reveal authorization then claims successfully.
4. A wrong-password unlock on v1 leaves the stored record byte-for-byte
   unchanged, with no `put`.
5. `revealKey` on v1 re-seals.
6. Two concurrent `unlockSession` calls on one v1 record (`Promise.all`):
   exactly one re-seal `put`, and both sessions claim.
7. An outstanding password `createRevealAuthorization` holding a v1 key still
   claims after another session re-seals (held-key swap).
8. `deleteKey` during an in-flight re-seal: the record is absent afterwards,
   both in memory and in the repository.
9. `rotateKey` during an in-flight re-seal: the rotated seal wins and the
   re-seal is discarded.
10. A tampered v2 `kdfParams` that is still in the allowlist makes reveal
    fail closed. An out-of-allowlist value is skipped with no derivation (spy).
11. A v2 record already at the write parameters is not rewritten on unlock
    (no `put`).
12. `updateKey` then `unlockSession` still unlocks the key (open question 1).
13. `sealedByUserId`: another user's v2 record is not tried at unlock
    (derivation spy count).
14. A service with `testOnlyWeakParameters` reads its own records. A service
    without it rejects a record written at N=2^10.

`programs/tests/global-secret-keys.test.ts`: one real-cost assertion that a
key created through `createGlobalProgramRuntime()` records
`kdfParams.N === 131072`.

`IA/runtime/tests/service.test.ts` (new) and
`programs/tests/global-identity-access.test.ts`

1. The sealed credential records `version: 2` and `kdfParams`; extend 244-247.
2. A v1 sealed credential fixture with legacy inner hashes:
   - login succeeds;
   - the stored record is v2 with a new salt;
   - a fresh service instance logs in again;
   - the test decrypts with the known fixture password and asserts the inner
     `passwordHash` is PHC.
3. A wrong password against v1 leaves the record unchanged.
4. The legacy plaintext migration test (258-316) asserts that the sealed
   record is `version: 2`.
5. Derivation count via the `derive` spy:
   - warm login = 1;
   - cold v2 login = 1;
   - credential gate = 1 plus 1 when a PIN is configured.
6. PIN upgrade:
   - a v1 PIN plus a correct `authorizeSessionPin` upgrades both the metadata
     verifier (if kept) and the inner `pinHash`;
   - reload, login, and PIN still work;
   - a wrong PIN causes no upgrade;
   - a credential that is not in memory causes no metadata-only upgrade.
7. Two concurrent cold logins for the same v1 user both succeed, with one
   new-salt derivation (spy), and the final record opens on a fresh instance.
8. A below-floor `passwordKdf` without `testOnlyWeakParameters` is refused at
   construction.

### 7. Mutation targets

Each mutation must turn at least one §6 case red.

1. `CURRENT_SCRYPT_PARAMETERS.N` 2^17 → 2^14 turns the recorded-`kdfParams`
   assertions red (secret keys 1, global secret keys, identity 1).
2. `LEGACY_V1_SCRYPT_PARAMETERS.N` 2^14 → 2^15 breaks the v1 fixture cases
   (secret keys 2 and 3, identity 2).
3. maxmem `256·N·r` → `128·N·r` makes `derive-scrypt-key` N=2^17 throw
   `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`, as the probe observed.
4. Re-seal condition → `false` breaks secret keys 3 and 5 and identity 2;
   → `true` breaks secret keys 11.
5. Re-seal before verifying the decrypt breaks secret keys 4 and identity 3.
6. The re-seal setting `updatedAtMs: now` breaks secret keys 3.
7. Removing single-flight breaks secret keys 6 and identity 7.
8. Removing the held-key swap breaks secret keys 7.
9. Removing the compare-and-swap or the per-record write chain breaks secret
   keys 8 and 9.
10. Removing the allowlist guard breaks secret keys 10 and 14 and the
    password-hash out-of-allowlist case.
11. Restoring any redundant identity derivation (570, 575, 266, 553) breaks
    identity 5.
12. Dropping the PIN upgrade's in-memory gate breaks identity 6.
13. Removing the floor check breaks identity 8 and secret keys 14.
14. Limiter concurrency 2 → unbounded breaks the limiter test.
15. Reverting the comparison at 246 to `updatedAtMs` breaks secret keys 12.

## Commands run and observed results

- **Grep sweeps** over `F:\!FluxIQ`, excluding node_modules, dist, and build
  output, for `scrypt|pbkdf2|argon2|bcrypt|createHash\(|timingSafeEqual` and
  `hkdf|deriveKey|deriveBits|createHmac|subtle\.|hashPassword|verifyPassword|hashSecret|verifySecret`.
  - scrypt appears only in `IA/runtime/service.ts` and `SK/runtime/service.ts`,
    plus tests and docs.
  - No pbkdf2, argon2, bcrypt, HKDF, or WebCrypto hits.
  - `createHash` hits are content digests plus the gateway token hash.
- **`node --version && node -e "console.log(process.arch, require('os').totalmem())"`**
  printed `v22.11.0` and `x64 27754020864`.
- **`node <scratchpad>/k0-scrypt-timing-probe.cjs`**, the one timing probe,
  run alone, printed five JSON lines:
  - default: sync, ok, 44 ms;
  - N=2^17 with maxmem 128 MiB: `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`, 0 ms;
  - N=2^17 with maxmem 134220799: `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`, 0 ms;
  - N=2^17 with maxmem 256 MiB: sync, ok, 357 ms;
  - N=2^17 with maxmem 256 MiB: async, ok, 347 ms.
  - Single observations. Output was captured before the session's computer
    crash; the probe was not rerun.
- **`git status --short; git log -1 --oneline; ls .../reports/; ls packages/fluxiq/src/programs/_shared/ | wc -l; node -e "...typeof crypto.argon2"`**
  printed:
  - an empty status;
  - `be869c4 docs: add K0 and K11 and record the plan-firming briefs`;
  - `ex-b-core.md`;
  - `9`;
  - `argon2 in node:crypto: undefined`.

## Not verified

- **No tests, type checks, or structure audit were run.** The brief is
  read-only, and node runs were limited to the probe. Line and method counts
  near the 800-line and 40-method budgets are by reading.
- **The three pre-existing defects** (open questions 1-3) and the downgrade
  lockout come from reading code, not from execution.
- **Latency figures** are call counts × single observations. Parallel
  speed-up under the limiter, libuv contention, core count, and memory
  pressure were not measured.
- **Placement** was not checked against `docs/architecture/code-structure.md`
  (not read). The Secret Keys and Identity Access web UI and the multi-process
  deployment topology were not inspected.
- **The vitest fake-timer interaction** with async `crypto.scrypt` is
  inferred, not run.

## Open questions or contradictions found

1. **Metadata update breaks session unlock (defect, by reading).**
   - `updateKey` bumps `updatedAtMs` (150, 161) but leaves the sealed payload
     unchanged.
   - `unlockSession` (246) and `revealKeyWithAuthorization` (314) then compare
     the payload's `updatedAtMs` against the record's and fail.
   - After a rename or enable/disable, the key never unlocks at login again
     until it is rotated, and LLM grants fail with "Secret key session unlock
     is unavailable". No test covers this.
   - Recommendation: compare against `lastRotatedAtMs` in K0.2, with test 12.
2. **A password change orphans Secret Keys (defect, by reading).**
   - `setPassword` never re-seals Secret Keys.
   - After a change, `unlockSession` unlocks 0 keys, and `reveal-key` fails,
     because its gate and its decrypt both use the new password.
   - The values become unrecoverable unless rotated with the value re-entered.
   - D13's plan to seal a project private key with the account password
     inherits this.
   - Recommendation: in `setPasswordAuthorized`, when the actor is the target
     (old password available), re-seal that user's keys through the K0
     re-seal path.
   - Admin reset of another user cannot recover them; surface that in the UI
     and docs. Needs a supervisor decision on scope.
3. **Cleartext PIN verifier.**
   - `pinVerifierHash` is persisted outside the seal (462, 651).
   - A 4-digit PIN space is exhausted offline in about 7 minutes at 2^14 or
     about 1 hour at 2^17 on one core (10^4 × the observed times). Raising the
     cost does not fix it.
   - Recommendation: stop persisting it, and verify PINs only against the
     credential unlocked in memory.
   - Trade-off: after a server restart, PIN-gated actions ask the user to sign
     in again, using the existing message at 338.
4. **`sealedByUserId` hint.** Recommended so login cost scales with the
   user's own keys. It changes behaviour only in the accidental case where two
   users share a password.
5. **Version.** Recommend 0.5.0 with a migration note covering the downgrade
   lockout.
6. **Multi-process blind writes** can undo a re-seal. The next unlock heals
   it. Recommend documenting the single-writer assumption now; compare-and-swap
   would need repository versioning.
7. **Username timing oracle.** Unknown or disabled users return before any
   derivation (263-264). The gap grows from 44 ms to 357 ms. A dummy
   derivation would close it but adds denial-of-service surface; the login
   rate limiter is keyed per address and username (`route.ts:8-10,38-52`).
   Supervisor decision.
8. **Out of scope, noted.** Identity session ids, the cookie bearer values,
   are stored raw in `identity.users` as `session:<id>` records, while the
   gateway hashes its tokens. `createRevealAuthorization` derives a key
   without verifying that it decrypts (217).
9. **Checks against the working document:**
   - Open question 6's facts are confirmed: `scryptSync(password, salt, 32)`
     at `service.ts:456-460`, and `kdf` without parameters at 471-479.
   - `data-and-state.md:242-243` contradicts the code: login unlock decrypts
     every value without a per-reveal recheck.
