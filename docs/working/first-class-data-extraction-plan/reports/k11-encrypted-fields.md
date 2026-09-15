# k11-encrypted-fields: Core's share of the Encrypt column (downstream D13)

Path prefixes, all relative to `F:\!FluxIQ`:
`AS/` = `packages/fluxiq/src/programs/automation-studio/`,
`FX/` = `packages/fluxiq/src/`, `WEB/` = `apps/web/src/`,
`SK/` = `FX/programs/secret-keys/`, `IA/` = `FX/programs/identity-access/`.

## Outcome

Done. This was a read-only investigation. Every question in the brief is
answered below with file:line references, followed by one recommended design
with contracts, files, ordered steps, tests, mutation targets, and
compatibility.

The recommendation departs from open question 5's current wording in two
places, both explained under "Open questions or contradictions found":
- The key hierarchy has an account level.
- No record-key unlock is held for the whole session.

The investigation also found a clear-text leak path that Core must close
before any encrypt field is captured. Runtime command attempts persist
`result.payload` unwithheld.

**What the user would see.** A Flow extracts a `password` column marked
Encrypt.
- The run needs no password and completes unattended.
- The run's table shows `••••••` with a Reveal button in that column.
- Reveal asks for the account password, then shows the value for 30 seconds.
- A CSV export leaves the column out. The user can instead tick "include
  encrypted columns in clear" and confirm the password.
- A copied `projects/{projectId}` folder holds only ciphertext cells and no
  key.
- An unattended later run that needs those values fails before it sends any
  browser command.

## What changed and why

Two files were written.
- This report.
- A throwaway benchmark script in the session scratchpad, outside both
  repositories (`scratchpad/k11-cell-bench.mjs`). It uses random, discarded
  keys and prints timings only.

No source, document, `.fluxiq` data, build, test, server, or git state was
touched. No real secret, password, hash, or key was read, printed, or
persisted.

## Findings

### 1. Identity model

**Accounts.**
- A `User` is `{ id, username, displayName, roleId, enabled, totpEnabled, ... }`
  (`IA/types.ts:16-27`).
- Credentials are a password hash, a PIN hash, and a TOTP secret
  (`IA/types.ts:29-36`). Hashes are `scrypt:{salt}:{hash}` at Node's default
  cost (`IA/runtime/service.ts:631-644`).
- The credential record itself is sealed with AES-256-GCM under a key derived
  from the password with scrypt (`IA/runtime/service.ts:456-467, 658-696`).
- When the store holds no users, a default `admin` account with the shipped
  default password is created (`IA/runtime/service.ts:594-610`). The login
  route flags `requiresCredentialSetup` while that default is in use
  (`WEB/app/api/auth/login/route.ts:80`).

**Roles and permissions.**
- There are two default roles: `admin` with all eight permissions, and
  `viewer` with `programs.read` only (`IA/runtime/roles.ts:3-22`; permission
  list at `IA/types.ts:1-9`).
- Permissions are global per role. The program API checks only
  `actor.permissions.includes(permission)` (`FX/programs/_shared/api.ts:59-72`).

**Sessions.**
- A session is `{ id: randomUUID, userId, expiresAtMs }` with a 12-hour default
  (`IA/runtime/service.ts:51, 278-292`).
- Sessions are persisted in the `identity.users` store
  (`IA/runtime/service.ts:468-470`). Another runtime sharing the store can
  validate them, because a miss reloads from the store
  (`IA/runtime/service.ts:294-308`; test
  `FX/programs/tests/global-identity-access.test.ts:225`).
- The session id is the bearer value of the httpOnly cookie
  (`WEB/app/api/auth/login/route.ts:83-89`). It must therefore never appear in
  an audit record.

**Domain scopes.**
- `ProgramScope` is `{ domainId?: string | null }`
  (`FX/programs/_shared/types.ts:4-6`).
- The web route builds it from the request URL's `?domainId=` query
  (`WEB/lib/program-route.ts:11-13`; used at
  `WEB/app/api/programs/[programId]/[endpoint]/route.ts:24,41`).
- An Automation Studio project carries only `domainId`, with no owner,
  creator, or members (`AS/api/contracts/project.ts:6-15`).
- `assertProjectDomainAccess` checks only that the project's domain equals the
  request's domain (`AS/runtime/service.ts:1689-1692`).
- A domain scope is therefore a view filter the caller names, not a per-user
  authorization boundary.

**Can several accounts open one project?** Yes. Any authenticated account
whose role holds the endpoint's permission can open every project in whichever
domain it names. Core has no project membership. D13's "the user's" private key
therefore needs a membership concept that K11 must introduce: the set of
accounts that hold a wrapped copy of the project private key.

### 2. How login creates the Secret Keys unlock and one-use reveal authorizations

**Login sequence** (`WEB/app/api/auth/login/route.ts:54-72`):
1. `identityAccess.authenticate` runs.
2. `secretKeys.unlockSession` is called with the clear password, the session
   id, the user id, and the session expiry.
3. If the unlock throws, the new session is revoked and login fails.

**Session unlock** (`SK/runtime/service.ts:234-264`):
- For every stored secret, it derives an scrypt key from the login password
  and that record's salt (`:242-243`). It keeps the derived key only when
  AES-GCM opens the record and the payload's id and `updatedAtMs` match
  (`:244-248`). Otherwise it zeroizes the key (`:249-251`).
- It stores `{ sessionId, userId, expiresAtMs, decryptionKeys }`
  process-locally (`:80-86, 256-262`), with an unref'd timer that revokes it at
  session expiry (`:253-255`).
- Cost scales with the number of secret records: one scrypt per record per
  login.

**One-use reveal authorization.**
- `createSessionRevealAuthorization` (`SK/runtime/service.ts:266-298`):
  - requires a live unlock for the same user;
  - copies the derived key into an authorization with `remainingUses: 1`;
  - takes a TTL of 1-300 s, capped by the unlock's expiry (`:88, 277-281`);
  - binds the key revision (`keyUpdatedAtMs`) and the session.
- `revealKeyWithAuthorization` (`:300-330`):
  - claims atomically (`state = "claimed"`, `:308`);
  - rechecks key revision, then active state and expiry after the async
    persist (`:312, 318-322`);
  - revokes and zeroizes on success and on every failure (`:324, 327`).
- `revokeRevealAuthorization` zeroizes the key (`:332-338`). Key update,
  rotate, and delete revoke dependent authorizations and unlock entries
  (`:164, 180, 201, 366-376`).
- The one consumer is LLM execution grants. They check the actor session and
  then create one authorization per allowed call
  (`AS/runtime/llm/execution-grants.ts:151-189`).

**Password path without a session.**
- `createRevealAuthorization` derives the key directly from a supplied password
  (`SK/runtime/service.ts:211-232`).
- The `reveal-key` endpoint requires `secrets.manage` plus a password, PIN,
  and TOTP gate (`SK/api/handlers.ts:60-71, 86-111`).
- The web live view hides a revealed value after 30 s
  (`WEB/features/programs/live-views/secret-keys.tsx:105-116, 155-162`).

**Teardown.**
- Logout revokes LLM grants, the Secret Keys unlock, and the session
  (`WEB/app/api/auth/logout/route.ts:10-14`).
- Framework close closes Automation Studio and Secret Keys
  (`FX/framework/index.ts:197-205`).
- Unlocks and authorizations are process-local and never persisted
  (`docs/architecture/automation-studio/persistence.md:119-129`).
- Identity sessions do survive a restart, so a still-valid cookie after a
  restart has no unlock. `createSessionRevealAuthorization` then fails with
  "unavailable" (`SK/runtime/service.ts:269-273`).

### 3. How the project-content protection key resolver is supplied today

**The boundary.**
- `AutomationStudioProjectContentProtection` has `seal` and `open`
  (`AS/storage/project/content-protection.ts:9-14`).
- The built-in `AutomationStudioAesGcmProjectContentProtection` takes a
  host-owned resolver `({ projectId, keyId? }) => { keyId, key(32 bytes) }`
  (`:5-6, 18-56`).
- AAD binds provider, project, media type, and key id (`:78`). The envelope is
  parsed strictly and fails closed (`:58-69`).

**Callers.**
- `AutomationStudioProjectContentStore.putBytes({ protect: true })` refuses
  without a provider (`AS/storage/project/content-store.ts:47-51`). `readObject`
  opens protected objects only with the provider (`:108-110`).
- `AutomationStudioProjectReusableLlmContextStore` requires protection for
  writes (`AS/storage/project/reusable-llm-context-store.ts:102-108, 123`),
  opened from `AS/runtime/service.ts:5205`.

**How a provider is supplied.**
- Either through `AutomationStudioServiceOptions.reusableLlmContext.contentProtection`
  (`AS/runtime/service.ts:363-367, 707-709`), or through
  `bindReusableLlmContext` (`:771-785`).
- `bindReusableLlmContext` is reached only through
  `FluxIQ.bindAutomationStudioReusableLlmContext`
  (`FX/framework/index.ts:231-235`), called by a `FLUXIQ_HOST_MODULE`
  (`WEB/lib/fluxiq.ts:155-181`).
- `createGlobalProgramRuntime` passes none (`FX/programs/_shared/runtime.ts:41-46`).
  Only tests supply one (`WEB/lib/tests/fluxiq.test.ts:193-216`;
  `AS/runtime/tests/service.test.ts:718-746`;
  `AS/storage/project/tests/content-protection.test.ts`).
- Without a provider, status reports `contentProtection: "unavailable"`
  (`AS/runtime/service.ts:1683-1686`).
- The architecture doc states Core does not create, persist, derive, or log
  these keys, and that Secret Keys and Identity Access crypto is not reused as
  project-content crypto (`persistence.md:180-198`).

**Why it cannot carry D13.**
- It is symmetric, and the host resolves the key whenever the process runs. An
  unattended run could therefore decrypt as easily as it encrypts, which
  breaks "viewing needs the password".
- It has no per-account wrapping.
- It protects whole objects, not cells.

K11 should leave it untouched. Optional whole-object protection of dataset row
bodies can still layer on it later.

### 4. How runs start and what identity they carry

**Web panel and API.**
- Both use one route. It reads the session cookie, calls `validateSession`, and
  builds `actor = { sessionId, userId, roleId, permissions }`
  (`WEB/app/api/programs/[programId]/[endpoint]/route.ts:30-58`).
- For session-bound programs it also injects `authSessionId` into the payload
  (`WEB/lib/program-route.ts:1, 15-18`).
- Core has no API token or service-account mechanism. Every API caller is a
  cookie session.

**Run endpoints.**
- `start-runtime-session` creates a queued session
  (`AS/api/handlers/runtime-execution.ts:10-18`;
  `AS/runtime/service.ts:2806-2836`).
- `run-runtime-session` executes one
  (`AS/api/handlers/runtime-execution.ts:19-55`). Both require
  `runtime.control`.
- The actor reaches the service only inside `llmExecution`, and only when an
  LLM grant is present (`runtime-execution.ts:29`). Explicit grant runs must
  create a fresh session (`:31-34`).
- `runRuntimeSession`'s input has no actor field
  (`AS/runtime/service.ts:3345-3360`). The persisted session metadata holds
  withheld inputs, authorized domain ids, and flags, but no user
  (`AS/runtime/service.ts:2832`).
- An ordinary run therefore carries no identity.

**Schedules.**
- Core has no Flow scheduler.
- `ProductionRunnerService` schedules loop records through a pluggable
  dispatcher (`FX/programs/production-runner/runtime/service.ts:6-9, 22,
  35-114`). Its default dispatcher only returns a message (`:197-202`), and the
  runtime constructs it with that default (`FX/programs/_shared/runtime.ts:87`).
  Grep finds no Automation Studio reference in `production-runner/`.
- Background Tasks registers only `docs.rebuild`
  (`FX/programs/_shared/runtime.ts:114-126`).

**Unattended runs.**
- A host module or a Node script holding `FluxIQ` can call
  `fluxiq.programs.automationStudio.runRuntimeSession(...)` directly. The
  service method is public and needs no actor.
- The Client Gateway (the extension) cannot start runs. Grep finds
  `runRuntimeSession`/`startRuntimeSession` only in the handler and in the
  service itself.

**Consequence.** Sealing must need no identity, so it uses the public key.
Decryption must need an authenticated, password-confirmed actor, so an
unattended run can never decrypt.

### 5. Where per-account sealed material can live outside project content

- Project content lives under `paths.recordings`, which in the v2 layout is
  `.fluxiq/artifacts/automation-studio` (`FX/framework/index.ts:169`). The
  project tree is `projects/{projectId}/...` (`persistence.md:6-8, 21-72`).
- Global program stores live under `paths.databases`
  (`FX/framework/index.ts:158`) as `SQLiteRepository` kinds. Examples are
  `identity.users` and `secret.keys` (`FX/programs/_shared/runtime.ts:55-57`).
  A new kind there, `record.keys`, sits outside every project folder, so
  copying `projects/{id}` never copies a key.
- **Database Manager exposure.** Registered repositories are readable through
  `list-records` and `get-record` with `programs.read`. Only
  `identity.users` and `secret.keys` get a credential recheck
  (`FX/programs/database-manager/api/handlers.ts:40-63, 97-124`).
  `put-record` and `delete-record` need only `data.manage` and never recheck,
  even for those two stores (`:64-84`).
- The new store must therefore not be registered with Database Manager (see
  open question 4).
- `Repository` offers no compare-and-set
  (`FX/programs/database-manager/types.ts:31-37`). Concurrent writers across
  runtimes are last-write-wins.

### 6. Clear-text paths an encrypt field would hit today

1. **Runtime command attempts.** The domain's extracted values come back as
   `result.payload`. `RuntimeService` saves the attempt to
   `artifacts/runtime/command-attempts/{attemptId}/attempt.json`
   (`FX/runtime/storage.ts:51-57, 67-69`). `result.payload` is explicitly not
   withheld (`docs/architecture/package-boundaries.md:210-217`;
   `withheldResult` rewrites only `message` and `error`,
   `FX/runtime/service.ts:429-437`). This write happens before
   Automation Studio sees the result.
2. **Node outputs and the saved trace.** The payload becomes `outputs.result`
   (`AS/runtime/io-policy.ts:113`; in-process adapter path at
   `io-policy.ts:49` per ex-b-core). From there it enters the attempt trace,
   `values`, the runtime session file, and the run event projections (ex-b-core
   §1).
3. **Content objects.** These are addressed by the sha256 of the stored bytes
   (`AS/storage/project/content-store.ts:53-65`). Sealed cells are random, so a
   stored digest reveals nothing. A clear body would dedupe identical values.

## Recommended design

### Principles

- **Seal at capture, in Core, with the project public key.** The domain sends
  clear values as it does today, and C1 needs no crypto downstream. No clear
  value of an encrypt field may enter node outputs, a trace, a command attempt,
  a dataset row, an audit record, or a log.
- **Every decryption needs the account password at that moment.** This covers
  Reveal, clear export, and a decryption grant for a later run. No record-key
  material is unlocked at login or held for a session.
- **Everything fails closed.** A missing, unreadable, or ambiguous key state
  refuses the operation. It never falls back to clear.

### Key hierarchy

```text
account password --scrypt(salt, N=2^17,r=8,p=1)--> account sealing key (32B, transient)
  seals: account X25519 private key               [record.keys: account-key, one per user]
account X25519 public key
  wraps (sealed box): project X25519 private key  [record.keys: project-key-wrap, one per holder per key]
project X25519 public key                         [record.keys: project-record-key, one per project key id]
  seals (sealed box, per value): cell            [dataset rows, project content]
```

**Sealed box.** This is one construction used at both wrap levels.
1. Generate a fresh ephemeral X25519 key pair.
2. Compute `shared = X25519(eph_priv, recipient_pub)`.
3. Reject an all-zero `shared`.
4. Compute `k = HKDF-SHA256(ikm = shared, salt = label, info = eph_pub || recipient_pub || canonicalJson(context), 32)`.
5. Encrypt with AES-256-GCM using a random 12-byte IV and
   `AAD = canonicalJson(context)`.
6. Zeroize `shared`, `k`, and the ephemeral private key.

The labels are `fluxiq.cell.v1` and `fluxiq.project-key-wrap.v1`.

**Why X25519 + HKDF + AES-256-GCM rather than RSA-OAEP.**
- Keys and ephemeral keys are 32 bytes, so each cell grows by about 100
  base64 characters. RSA-OAEP-3072 adds about 512.
- Both directions are fast. Measured: seal 0.16 ms, open 0.12 ms per cell on
  Node v22.11.0 (see Commands). RSA private-key operations cost milliseconds
  per cell, and RSA key generation is slow.
- X25519 is a constant-time primitive with no padding-oracle class.
- It is native in Node 22. Core requires `node >= 22`
  (`packages/fluxiq/package.json:7`), and `x25519`, `hkdfSync`,
  `diffieHellman`, and `aes-256-gcm` were verified present. It also exists in
  WebCrypto if sealing ever moves to the client.
- HKDF is required because raw X25519 output is not uniform. Binding both
  public keys in `info` prevents key-substitution and unknown-key-share
  confusion.

**Per-value keys rather than a per-dataset data key.**
- D13 promises a fresh random key and IV for each value, and the ephemeral
  sealed box gives exactly that.
- Each cell is self-contained. Append batches, `for-each` loops,
  `write-records`, and later runs need no data-key record, cache, or
  lifecycle.
- Rows can be deleted, paged, or exported independently.
- A run holds only a public key. It never holds anything that decrypts earlier
  cells.

Note that a per-dataset key with random IVs would also give distinct
ciphertexts for identical values. Lookup resistance is not what separates the
two options; self-containment and D13's wording are.

Cost is linear: about 1.6 s of CPU per 10,000 encrypted cells, from a single
observation. The capture loop must yield, for example with `setImmediate` every
256 cells, so the gateway event loop is not starved.

**Why an account level rather than wrapping the project key directly under
each account's password.**
- A decrypting operation runs one scrypt, not one per project.
- A holder can grant access to another account using only that account's
  public key. The recipient's password is never needed.
- A password change re-seals one record, not every project wrap.

**Password seal parameters.**
- scrypt with N=2^17, r=8, p=1, a 32-byte output, and a random 16-byte salt.
- `maxmem` must be at least 128 MiB, because 128·N·r = 134,217,728 bytes and
  Node's default of 32 MiB is too small. Use 256 MiB.
- The parameters are stored beside the ciphertext.
- K11 must use K0's versioned seal primitive rather than a copy. Its AAD binds
  `{ recordType, userId, accountKeyId, publicKey }`.

**Padding.** This goes beyond D13 but is recommended. Ciphertext length
otherwise reveals exact value length.
- Pad the canonical JSON plaintext with ISO/IEC 7816-4 padding (`0x80` then
  zeros).
- Round up to a multiple of 32 bytes up to 256 bytes, then to the next power of
  two.
- Cap a single field value at 64 KiB.

### What a stored encrypted cell holds

```json
{ "$fluxiqEncrypted": "cell.v1", "kid": "record-key:<uuid>", "epk": "<43 b64url>", "iv": "<16 b64url>", "tag": "<22 b64url>", "ct": "<b64url>" }
```

- **Plaintext** is `pad(canonicalJson(typedValue))`, so numbers, booleans, and
  JSON values round-trip.
- **AAD** is `canonicalJson({ format: "cell.v1", projectId, datasetId, fieldId, valueType, kid })`.
  `runId` is left out, so a later run may append an unchanged cell into the
  same `(datasetId, fieldId)`.
- Moving a cell into a different `(datasetId, fieldId)` fails authentication,
  so `write-records` refuses it with `records.encrypted_cell_rebind_refused`.
  The only exception is a run holding a decryption grant, which decrypts and
  re-seals.
- **Parsing** is strict, like `content-protection.ts:58-69`: exact keys,
  base64url, 32-byte `epk`, 12-byte `iv`, 16-byte `tag`.
- **Never stored:**
  - a hash, HMAC, or deterministic token of the value;
  - its clear length;
  - a per-value digest in `run_dataset_rows`.
  `schemaDigest` covers the schema only.
- `run_datasets` gains `encryptedFieldIds` and `keyIds` (the ids only).

### Records in the `record.keys` store (outside project content)

**`account-key`**
- `{ userId, accountKeyId, publicKey, status: active|reset, sealed, pendingSealed?, createdAtMs, updatedAtMs }`
- `sealed` and `pendingSealed` are K0 versioned seals of the 32-byte private
  key.

**`project-record-key`**
- `{ projectId, kid, publicKey, status: active|retired, createdBy, createdAtMs, retiredAtMs? }`
- At most one `active` key per project.

**`project-key-wrap`**
- `{ projectId, kid, userId, accountKeyId, epk, iv, tag, ct, status: active|orphaned, grantedBy, grantedAtMs }`

**`record-keys-audit`** (append-only)
- `{ eventId, kind, actorUserId?, projectId, datasetId?, runId?, kids[], fieldIds[], cellCount?, rowCount?, holderCount?, reasonCode?, atMs }`
- It records ids and counts only. It never holds a value, a ciphertext, key
  bytes, a password, or a session id.

The public key of record is always read from this store, never from project
files. Otherwise a tampered project folder could redirect future seals to an
attacker's key.

### Lifecycle

**Account key creation.**
- Created at the first successful login that has no `account-key`. The password
  is in hand, and there is one scrypt at that login only.
- Skipped while `requiresCredentialSetup` is true (the shipped default
  password). Created instead at that user's password change.
- Login never fails because of record keys. A store failure is audited and
  leaves record-key status `unavailable`. This deliberately differs from the
  Secret Keys unlock (`login/route.ts:69-71`), so a key-store fault cannot lock
  users out of the product.

**Password change, self-service** (`IA/runtime/service.ts:151-178`).
1. The actor proves the current password
   (`authorizeCredentialRotation`, `:344-355`).
2. Prepare: open `sealed` with the current password, seal the same private key
   under the new password, and write it as `pendingSealed`.
3. The identity credential write runs.
4. Commit: promote `pendingSealed` to `sealed` and delete the old seal.

At the next unlock, try `sealed`, then `pendingSealed`. Whichever opens is
promoted and the other deleted. A crash at any point therefore leaves the key
openable by whichever password is actually in force. If prepare fails, the
password change is refused with a fixed message rather than silently losing the
key.

**Password reset by an administrator of another account** (`:169-176`, where
the old password is unknown).
- Delete that account's seals and set `status: reset`.
- Mark every wrap to its old `accountKeyId` as `orphaned`.
- Audit `account.reset` with the orphaned count.
- A new pair is created at that user's next login. A holder must re-grant.
- This is not an escalation: the administrator gains no access.

**Project key creation.**
- Endpoint `create-project-record-key` (see API). It requires `secrets.manage`
  plus the password, PIN, and TOTP gate.
- Generates the pair, wraps the private key to the caller's account public key,
  sets it `active`, and audits.
- A run never creates keys.

**Grant a holder.**
- The granter proves their password and opens the project private key(s). The
  key is wrapped to the recipient's `account-key.publicKey` for every
  non-deleted `kid`. The recipient must have an active account key.
- Audit `holder.granted`.

**Remove a holder.**
- Delete their wraps for every `kid`, then rotate.
- Refuse to remove the last holder.
- The UI must state plainly that removal cannot revoke values the removed
  account could already decrypt and may have copied.

**Rotate.**
- Generate a new `active` pair and mark the old one `retired`, which is
  decrypt-only.
- Wrap the new private key to each current holder's account public key. This
  needs no old private key.
- New seals use the new `kid`.
- A retired key and its wraps are deleted only when no retained dataset
  references its `kid`, through dataset retention, deletion, or an optional
  password-authorized re-encrypt job.

**Concurrency.**
- Use an in-process async mutex per `userId` and per `projectId`.
- After each write, re-read and verify the written revision. Report a conflict
  instead of retrying blindly, because `Repository` has no compare-and-set
  (open question 5).

### Capture, Reveal, export, and later-run use

**Capture preflight (fail closed before dispatch).**
- If a run's Flow has any `recordOutput` field with `handling: encrypt`, and
  the project has no `active` record key or the store is unreadable, the run
  fails before any domain command is sent.
- The failure is `records.encryption_key_unavailable` with category
  `blocked_by_capability_or_policy`.

**Capture.**
- `io-policy` receives the result.
- Before building `outputs`, and for each validated row, it replaces each
  encrypt field with a sealed cell. That keeps `outputs.result`,
  `outputs.records`, the trace, and `onRecordBatch` rows sealed from the
  start.
- A seal error fails the whole batch with `records.encryption_failed`. The
  clear payload is dropped and no rows are written.
- Validation messages never echo a value.
- A domain-supplied object shaped like a cell is treated as a clear value and
  sealed. Core never trusts client-made ciphertext.

**Command attempts.**
- The dispatch passes `protectedResultPaths` (JSON paths into `result.payload`,
  for example `["extracted", "*", "password"]`) beside `withheldValues`
  (`io-policy.ts:98-99`).
- `RuntimeService` writes those paths as a `[encrypted]` marker in the attempt
  it saves (extending `FX/runtime/service.ts:429-437`). The caller still
  receives the unredacted result.
- Both the gateway path and the in-process adapter path must pass the paths.

**Schema rules.** These extend K1's validator.
- An encrypt field cannot be `primaryKey`.
- It cannot be used by sort, filter, dedupe, or `filter-list` on sealed cells.
- Changing a field from `encrypt` to `include` or `exclude` is a security
  downgrade. It needs the password gate, not only the PIN, and is audited as
  `field.handling_downgraded`. It affects future runs only; existing cells stay
  sealed.

**Reveal.**
- Endpoint `reveal-run-dataset-cells`: `secrets.manage`, at most 50 cells, with
  the password, PIN, and TOTP gate.
- Steps:
  1. `assertProjectDomainAccess`, then `authorizeSessionCredentials`
     (`IA/runtime/service.ts:310-319`).
  2. Open the account key with the password: one scrypt.
  3. Open the wrap for each referenced `kid`, then open the cells.
  4. Zeroize everything.
  5. Audit `cells.revealed` with counts.
- It is all-or-nothing: any missing or orphaned wrap, unknown `kid`, or
  authentication failure returns one fixed error with no partial values, and
  audits `decrypt.denied` with a reason code.
- Failed password attempts go through a durable per-user attempt tracker like
  `DurableLoginAttemptTracker` (`WEB/app/api/auth/login/route.ts:8-19`).
- The response carries `Cache-Control: no-store`.
- The UI follows the Secret Keys live view: auth modal and 30-second hide.

**Export.**
- `export-run-dataset` gains `encryptedFields: "omit" | "clear"`, defaulting to
  `omit`. With `omit`, the columns are absent from both the header and the
  rows.
- `clear` requires the same authorization as Reveal plus
  `confirmClearExport: true`. The streaming route takes the credentials in a
  POST body, never in the URL.
- CSV formula escaping still applies. The export is audited as
  `dataset.exported_clear` with row and field counts.

**Later-run use.**
- Endpoint `issue-record-decryption-grant`: `runtime.control` plus
  `secrets.manage`, with the password gate.
- The grant is a process-local, TTL-bounded authorization of at most 300 s,
  modelled on `SK/runtime/service.ts:73-78, 266-330`. It holds the opened
  project private key(s) for the named `kid`s and is bound to:
  - `actorUserId`, `actorSessionId`, `projectId`, `flowId`;
  - the execution digest (`resolveExecutionDigest`,
    `FX/programs/_shared/runtime.ts:72`);
  - the referenced `(runId, datasetId, fieldIds)`;
  - `maxCells`.
- `run-runtime-session` accepts `recordDecryptionGrantId`, bound to the actor
  as `llmExecution` is (`runtime-execution.ts:29-34`), with a fresh session
  required.
- Decryption happens only while a `$output` binding resolves (K6). Each clear
  value joins the run's resolved values, so existing withholding removes it
  from the saved trace and the command-attempt parameters.
- The grant is consumed at run end and zeroized on expiry, logout, web reload,
  or close.
- An unattended run has no grant, so any binding to a sealed cell fails with
  `records.decryption_grant_required`.

### Contracts

**In `packages/contracts/src/record-sets/`** (browser-safe, zod-only):
- `encrypted-cell.ts`:
  - `AUTOMATION_STUDIO_ENCRYPTED_CELL_FORMAT = "cell.v1"`;
  - `automationStudioEncryptedCellSchema`;
  - type `AutomationStudioEncryptedCell`;
  - `isAutomationStudioEncryptedCell`.
- `record-encryption-status.ts`: `AutomationStudioRecordEncryptionStatus`,
  which is
  `{ projectId, state: "not_configured" | "active" | "caller_not_holder" | "caller_orphaned" | "unavailable", activeKeyId?, holderCount, callerIsHolder }`.
- `reveal-cells.ts`: `AutomationStudioRevealRunDatasetCellsRequest` and
  `...Response` (cells addressed by row ordinal and field id).
- Run dataset summary gains `encryptedFieldIds?: string[]` (additive).
- K1's refusal of `handling: encrypt` is lifted only when a host has wired
  record keys. Otherwise the parse error stays.

**In `fluxiq`:**
- `FluxIQRuntimeDispatchOptions.protectedResultPaths?`.
- `AutomationStudioGraphExecutionOptions.recordCellSealer?` and
  `.recordDecryption?`.
- A `RecordKeys` program export, and an `IdentityAccessCredentialChangePort`
  type owned by Identity Access so the dependency points
  `record-keys → identity-access`, never back.

### Files

**New global program `FX/programs/record-keys/`.** One exported thing per file,
a barrel in every directory, and tests in `tests/`.
- `metadata.ts` (`RECORD_KEYS_PROGRAM`), `types.ts`, `index.ts`
- `crypto/`:
  - `index.ts`
  - `x25519-sealed-box.ts` (class `X25519SealedBox`)
  - `cell-padding.ts`
  - `encrypted-cell-codec.ts`
  - `account-key-seal.ts` (wraps K0's primitive)
  - `tests/`
- `storage/`: `index.ts`, `record-keys-store.ts` (over `SQLiteRepository` kind
  `record.keys`), `tests/`
- `runtime/`:
  - `index.ts`
  - `account-keys.ts` (`AccountKeysService`)
  - `project-record-keys.ts` (`ProjectRecordKeysService`)
  - `record-cell-sealer.ts` (public-key only)
  - `record-decryption-grants.ts`
  - `record-keys-audit.ts`
  - `tests/`
- `api/`: `contracts.ts`, `handlers.ts`, `tests/`
  - Endpoints: `status`, `create-project-key`, `rotate-project-key`,
    `list-holders`, `grant-holder`, `remove-holder`, `list-audit`

**Edits to existing files.**
- `FX/programs/_shared/catalog.ts:13-24` adds the program.
- `FX/programs/_shared/runtime.ts:55-72, 130-137` constructs the store and
  services, and does not register `record.keys` with Database Manager.
- `IA/runtime/service.ts`: `bindCredentialChangePort` is invoked in
  `setPasswordAuthorized` around `setPassword`. The port type goes in new file
  `IA/runtime/credential-change-port.ts`.
- `WEB/app/api/auth/login/route.ts:62-72` calls
  `recordKeys.accounts.ensureForLogin`, non-blocking.
- `WEB/app/api/auth/logout/route.ts:10-14` calls
  `recordKeys.decryptionGrants.revokeForSession`.
- `FX/runtime/service.ts` and its dispatch options add redaction of
  `protectedResultPaths`.
- `AS/runtime/io-policy.ts` (K3 code) seals encrypt fields and passes the
  protected paths on both dispatch paths.
- `AS/runtime/executor/contracts.ts` and `AS/nodes/parameter-bindings.ts` (K6
  code) add the sealer and decryption hooks.
- `AS/runtime/service/datasets/` (K4) and `AS/api/handlers/datasets.ts` (K8)
  add preflight, reveal, export `encryptedFields`, and the decryption-grant
  endpoint.
- `WEB/features/automation-studio/datasets/` (K9) adds the masked cell, Reveal
  modal, export option, and a project "Encrypted columns" panel (key status,
  holders, rotate, audit).

### Ordered steps

These depend on K0 (versioned password seal) and on K1, K3, K4, K6, K8, and K9
existing.

1. Contracts: encrypted-cell schema, status, and reveal types. Lift K1's
   refusal behind the wiring check.
2. `record-keys/crypto`: sealed box, padding, cell codec, account-key seal.
3. `record-keys/storage` and `AccountKeysService`. Add the Identity Access
   credential-change port and hook, and the login and logout calls.
4. `ProjectRecordKeysService`: create, grant, remove, rotate, orphan, audit.
   Then API handlers, catalog, and runtime wiring.
5. `FX/runtime` `protectedResultPaths` redaction.
6. Capture: preflight, sealing in `io-policy` on both paths, schema rules,
   dataset summary fields.
7. Reveal and export `encryptedFields` endpoints and the streaming route.
8. Decryption grants, the `run-runtime-session` binding, and decryption at
   binding resolution with withholding.
9. Web UI.
10. Docs:
    - `persistence.md`: record-key custody, next to `:180-198`.
    - `automation-studio.md`: runs and decryption grants.
    - Native nodes: `write-records` rebind rule.
    - `package-boundaries.md`: versions and a Migration Notes entry.
    - Regenerate `docs/reference/framework-reference.md`.
11. Gates, one at a time: `npx vitest run <files> --no-file-parallelism`, then
    `pnpm check`, `pnpm test`, `pnpm docs:check`, `pnpm build`,
    `pnpm package:validate`.

### Tests, one-to-one with their subjects

**`packages/contracts/src/record-sets/tests/encrypted-cell.test.ts`**
- Strict keys and lengths.
- Rejects a clear string and extra keys.

**`record-keys/crypto/tests/x25519-sealed-box.test.ts`**
- Round trip.
- Two seals of the same plaintext differ in `epk`, `iv`, and `ct`.
- Wrong recipient fails.
- Altered AAD, tag, `epk`, or `ct` fails.
- A low-order or all-zero peer public key is rejected.

**`record-keys/crypto/tests/cell-padding.test.ts`**
- Bucket boundaries.
- Unpadding rejects malformed padding.
- The 64 KiB cap.

**`record-keys/crypto/tests/encrypted-cell-codec.test.ts`**
- Typed round trip for each `valueType`.
- AAD binding: a different `datasetId`, `fieldId`, or `valueType` fails.

**`record-keys/crypto/tests/account-key-seal.test.ts`**
- Stores N, r, p, and `maxmem`.
- Opens a record with stored older parameters.
- A wrong password fails.

**`record-keys/storage/tests/record-keys-store.test.ts`**
- Round trip of all record types.
- A malformed record reads as unavailable.
- Audit append-only ordering.

**`record-keys/runtime/tests/account-keys.test.ts`**
- Creation happens at the first login only, and not while the default password
  is in use.
- Self password change: a simulated crash after prepare still opens with the
  old password; a crash after the credential write opens with the new one.
- Admin reset orphans wraps.

**`record-keys/runtime/tests/project-record-keys.test.ts`**
- Create wraps to the creator.
- A grant needs a holder's password.
- Removing the last holder is refused.
- Remove then rotate leaves the removed account without a wrap to the new
  `kid`.
- A retired key still decrypts.

**`record-keys/runtime/tests/record-decryption-grants.test.ts`**
- One use; expiry; actor or session mismatch.
- Logout revoke zeroizes.
- The `maxCells` cap.

**`record-keys/runtime/tests/record-keys-audit.test.ts`**
- Records carry ids and counts only. Scan every audit record for a canary value
  and for the session id.

**`record-keys/api/tests/handlers.test.ts`**
- Permission and credential gates, and the `requiresRecheck` shape.

**`IA/runtime/tests/service.test.ts`** (new file)
- Port order is prepare, credential write, commit.
- A prepare failure refuses the password change.

**`FX/runtime/tests/service.test.ts`**
- `protectedResultPaths` are redacted in the saved attempt and intact for the
  caller.

**`AS/runtime/tests/io-policy.test.ts`**
- Encrypt fields are sealed in `outputs.result` and `outputs.records`.
- A seal error fails the batch.
- Preflight refusal never calls the adapter (spy).

**`AS/api/handlers/tests/datasets.test.ts`**
- Reveal is all-or-nothing.
- Export omits by default; `clear` needs the password and
  `confirmClearExport`.
- An encrypt `primaryKey` is refused.

**`FX/programs/tests/global-record-keys-canary.test.ts`** (end to end)
- A mock domain adapter returns a random canary in an encrypt field.
- After the run, recursively scan every file under the temporary host root:
  SQLite files, JSON and JSONL, command attempts, runtime sessions, run
  detail, and objects. Search for the canary's UTF-8, base64, and hex forms.
  Expect none.
- Reveal with the password then equals the canary.

**`WEB/app/api/auth/login/tests/route.test.ts`**
- Login succeeds when record keys are unavailable.

**`WEB/features/automation-studio/datasets/tests/encrypted-cell.test.tsx`**
- The masked cell, Reveal modal, and 30-second hide.

### Mutation targets

Each change below must make the named test fail.

| Change | Test that catches it |
| --- | --- |
| Remove `recipient_pub` from the HKDF `info` | substitution test |
| Use a fixed IV | "two seals differ" |
| Drop `setAAD` | AAD tamper |
| Skip the zero shared-secret check | low-order key test |
| Accept extra cell keys | strict parse |
| Ignore stored scrypt parameters | older-parameters open |
| Drop the `pendingSealed` fallback | crash-after-credential-write |
| Allow removing the last holder | last-holder refusal |
| Skip rotation on removal | removed-account-new-kid |
| Allow a second grant use | one-use |
| Ignore grant expiry | expiry |
| Remove attempt redaction | canary in `command-attempts` |
| Build `outputs` before sealing | canary in the runtime session |
| Remove preflight | adapter spy called |
| Skip the Reveal credential gate | handler recheck test |
| Partial Reveal on one bad cell | all-or-nothing |
| Default export `encryptedFields` to `clear` | omit test |
| Log `sessionId` or the value in audit | audit scan |
| Admin reset without orphaning | orphan test |

### Compatibility

- **`@fluxiq/contracts`:** additive (new cell and status contracts, summary
  field), so a patch (`0.2.x`, currently 0.2.0,
  `packages/contracts/package.json:3`).
- **`fluxiq`, additive:** the new program, store kind, and endpoints; the
  optional `protectedResultPaths`; optional executor options; the port type.
- **`fluxiq`, observable behaviour changes:**
  - `handling: encrypt` now runs instead of being refused;
  - login creates `account-key` records;
  - a password change can be refused when the key re-seal cannot be prepared;
  - an administrator's reset of another account orphans that account's wraps;
  - the global program list gains an entry.

  Under `docs/architecture/package-boundaries.md:86-94` these require a minor
  increment with a Migration Notes entry. They fold into the planned `0.5.0`
  (currently 0.4.0, `packages/fluxiq/package.json:3`).
- **Existing data:** no migration. No existing cell is encrypted.
- **Backups:** restoring `projects/{id}` without the `record.keys` store makes
  sealed cells permanently unreadable. Document this. Exporting or importing
  project keys between installations is out of scope.
- **Downstream:** C1 passes `handling: encrypt`, and the extension sends clear
  values as it does for `include`. No extension crypto and no gateway protocol
  change. The extension's X1 contract reservation stands unchanged.

## Commands run and observed results

- Read, Grep, and Glob over the files cited above, in both repositories. The
  output was read and cited directly.
- `wc -l` on `docs/architecture/automation-studio.md` (1008),
  `AS/storage/project/content-store.ts` (200), `FX/programs/_shared/api.ts`
  (102), and `WEB/lib/fluxiq.ts` (284). All four were then read in full.
- A Node crypto feature probe that printed booleans only:
  `{"node":"v22.11.0","x25519":true,"hkdfSync":true,"diffieHellman":true,"aesGcm":true,"rsaOaep":true,"scrypt":true}`.
- `grep` of `engines` and `version`: `fluxiq` 0.4.0 with `"node": ">=22"`;
  `@fluxiq/contracts` 0.2.0.
- `ls` of `FX/programs/` (11 program directories plus `_shared` and `tests`),
  `AS/runtime/`, `AS/runtime/service/`, and the reports directory, which held
  only `ex-b-core.md` before this report.
- `node scratchpad/k11-cell-bench.mjs` sealed 2,000 cells with throwaway random
  keys and a dummy plaintext, printing timings only:
  `{"cells":2000,"sealTotalMs":323,"sealPerCellMs":0.1614,"openTotalMs":230,"openPerCellMs":0.115,"roundTripOk":true}`.
  This is a single observation on a machine with faulty RAM. Treat it as an
  order of magnitude.
- No build, test, server, or git command was run.

## Not verified

- K0's report did not exist when this was written. The shape of the K0 seal
  primitive and the cost of scrypt at N=2^17 here are assumed from the brief;
  K0 measures the latter.
- Whether the Client Gateway server or `ClientGatewayRuntimeTransport` logs or
  persists `result.payload` anywhere beyond command attempts. The end-to-end
  canary test is designed to catch it.
- `AS/runtime/io-policy.ts:40-50` (the in-process adapter path) was not read
  directly; it is cited from ex-b-core.
- K3, K4, K6, and K8 code does not exist yet. Their file names follow the Core
  plan's Design section.
- Whether `FX/runtime/tests/service.test.ts` and
  `AS/runtime/tests/io-policy.test.ts` already exist. Their names follow
  ex-b-core.
- The effect of adding a program to `GLOBAL_PROGRAMS` on the web program list
  and on `FX/programs/tests/permission-matrix.test.ts`.
- Whether `SQLiteRepository.put` is atomic per record, and how two runtimes on
  one store interleave.
- The behaviour of Node's `diffieHellman` on low-order X25519 points, which is
  why the design adds an explicit all-zero check.
- WebCrypto X25519 browser support, stated from knowledge. It matters only for
  a future seal-at-source option.
- `AS/storage/project/retention-store.ts` and the dataset retention rules that
  would delete retired keys.

## Open questions or contradictions found

1. **Contradiction with open question 5's recommendation** ("session unlock at
   login"). Recommended instead: no record-key unlock at login; every
   decryption asks for the password.
   - D13 already requires the password for Reveal and clear export.
   - Holding an opened private key for a 12-hour session widens exposure
     without a user need.
   - Unlocks die at restart while sessions survive (§2), which gives confusing
     "unavailable" states.
   - It keeps login at one scrypt, and only on first key creation.

   The cost is that starting a run which reads encrypted values asks for the
   password. If the user prefers otherwise, the Secret Keys session-unlock
   pattern (§2) is the drop-in alternative. Owner: senior supervisor agent.
2. **Hierarchy detail beyond open question 5.** Open question 5 describes the
   project private key sealed with the account password. This report adds an
   account X25519 key pair in between, for one scrypt per operation,
   password-free grants, and one-record re-seal on password change. The
   properties D13 requires are unchanged: per-value key and IV, no stored
   hash or token, random salt, scrypt at N=2^17 or stronger with stored
   parameters. Owner: senior supervisor agent.
3. **Core has no project membership.** Every account with the permission opens
   every project. Domain scope is a URL parameter (§1). K11 introduces "key
   holders" as the only membership. Should holder management require
   `secrets.manage`, as recommended, or a new permission?
4. **Pre-existing Database Manager gap, not K11.** `put-record` and
   `delete-record` on the sensitive `identity.users` and `secret.keys` stores
   need only `data.manage`, with no credential recheck
   (`FX/programs/database-manager/api/handlers.ts:64-84` against `:97-124`).
   K11 avoids it by not registering `record.keys`. Should the gap itself be
   fixed?
5. **No compare-and-set in `Repository`** (`database-manager/types.ts:31-37`)
   while identity sessions are shared across runtimes. Key rotation and grants
   are last-write-wins across processes. Add CAS to `SQLiteRepository` in Core,
   or document a single-writer assumption?
6. **Pre-existing Secret Keys behaviour, relevant to K0.**
   - A secret is sealed under the password given at creation
     (`SK/runtime/service.ts:140`).
   - The login unlock silently skips any secret that password cannot open
     (`:244-251`).
   - Nothing re-seals secrets on password change
     (`IA/runtime/service.ts:144-149` calls no Secret Keys code).

   So after a password change, or for a second administrator, those secrets no
   longer unlock at login. K0's re-seal happens "at next successful unlock",
   which never succeeds with a new password.
7. **Clear extracted data in command attempts is wider than D13.** Every
   dataset, not only encrypt fields, lands in clear in
   `command-attempts/*/attempt.json` (§6.1). This interacts with open
   question 1 (dataset withholding and retention).
8. **Seal at source**, meaning the extension seals with the project public key
   through WebCrypto, would keep clear values out of Core memory and gateway
   messages entirely. It is not recommended now because it needs crypto
   downstream and a gateway contract change, and D13 does not protect a live
   process. It is recorded as a later hardening option.
