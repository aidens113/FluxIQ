# Report: k0-5-credential-wiring

Worker report for brief `k0-5-credential-wiring` (step K0.5; CD5, CD6, CD15). Repository: FluxIQ Core (`F:\!FluxIQ`). `FX/` is `packages/fluxiq/src/`, `WEB/` is `apps/web/src/`. Nothing committed.

This work had four parts:
1. **The brief.** All edits and the first full validation.
2. **After a Claude Code crash.** I re-checked every owned file (all edits present, no mutation text left), reran the whole validation set, and finished the Secret Key State doc section.
3. **Amendment 1, the login limiter.** The per-address bound applies only when a trusted client address exists, the per-username bound stays, and a whole-panel bound of 100 failures in 10 minutes is added.
4. **Amendment 2, the credential-change port.** Once the credential write has succeeded, a subscriber's commit error no longer fails the password change: it is recorded by ids and counts, and success is returned. A prepare failure still refuses.

## Outcome

**Done.**

- **Password changes now carry Secret Keys along.** The global runtime subscribes Secret Keys to the Identity Access credential-change port.
- **A commit failure after the write no longer fails the change.** `runCredentialChange` records it by ids and counts and returns the write's result.
- **`upsertUser` refuses** a password or PIN for an existing account.
- **The login route has three bounds:** per username, per trusted client address, and across the whole panel. It never keys the address bound on a shared placeholder.
- **Docs and version.** The four docs are updated, and `fluxiq` is now 0.5.0 with a Migration Notes entry.
- **Tests.** Every targeted test passes: 27 identity tests, 2 global runtime wiring tests, 8 route tests.
- **Checks.** `pnpm --filter @fluxiq/web check` and docs validation pass. The structure audit fails only on `docs/working/README.md`.
- **`pnpm --filter fluxiq check` now fails in another worker's file** and did so again on its one permitted rerun. Details below; it named no file of mine, and it passed earlier in this task.
- **Mutations.** All eleven went red and were restored byte-identical. No permission refusals.
- **One intermittent failure.** `global-secret-keys.test.ts` failed once at its TOTP reveal step, then passed on its one rerun alone. I found no link to my change.

## What changed and why

### `FX/programs/_shared/runtime.ts` (187 → 223 lines)

- **Construction order.**
  - `SecretKeysService` is now constructed before `IdentityAccessService`, because subscribers register only through the constructor.
  - `IdentityAccessService` gets `{ repository: identityUsersRepository, credentialChangeSubscribers: [secretKeysCredentialChangeSubscriber(secretKeys)] }`.
  - Both fields are written by name. `repository` may be `undefined`, which the option type allows.
- **New module-private adapter, `secretKeysCredentialChangeSubscriber(secretKeys)`.** It keeps a map from each Identity `changeId` to the Secret Keys `changeId`.
  - **`prepare`** calls `secretKeys.prepareCredentialChange({ userId, currentPassword, nextPassword: newPassword })`, but only when `change.currentPassword` is set.
    - That means a self-service change only.
    - An administrator's reset of another account, and a bare `setPassword`, carry no current password. Those keys cannot be opened, so the adapter leaves them alone (CD5).
    - If prepare rejects, the port refuses the password change.
  - **`commit`** takes the mapped id and calls `commitCredentialChange`. Its failure no longer fails the change (see the port, below).
  - **`abort`** takes the mapped id and calls `abortCredentialChange`.
  - Both remove the mapping first. An unknown id is a no-op, which covers abort after a failed prepare.
- **Placement.** The adapter bridges two programs at the composition root, so it stays unexported inside `runtime.ts`, beside the file's other private helpers.

### `FX/programs/identity-access/runtime/run-credential-change.ts` (amendment 2)

- **Before.** After the credential write, every subscriber committed and the first commit error was rethrown. The password had changed, yet the caller saw a failure.
- **Now.** Commit errors are counted, not thrown.
  - Every asked subscriber still commits.
  - If any failed, one `CredentialCommitFailure` is recorded: `{ changeId, userId, failedSubscriberCount, subscriberCount }`. Ids and counts only, never an error text, a message, or a password.
  - The write's result is returned, so the password change succeeds. The subscriber recovers its own state from what it prepared.
  - A recorder that itself throws is swallowed: recording must not fail a change whose credential is already written.
- **Unchanged.** A `prepare` that throws still refuses the change, nothing is written, every subscriber asked is aborted, and the error is rethrown. A failed write aborts the same way. Abort errors are still swallowed.
- **How it is recorded.** A new optional fourth parameter, `recordCommitFailure`, defaults to `warnCommitFailure`, which writes one `console.warn` line naming the change id, the user id, and "N of M subscribers failed to commit after the credential was written; the change stands." `service.ts` calls the function with three arguments, so it takes the default and needs no change.
- **New exported type** `CredentialCommitFailure`, beside the function it belongs to.

### `FX/programs/identity-access/runtime/service.ts`, `upsertUser` only (731 → 736 lines)

- **The refusal.** When `this.users.get(id)` exists and `params.password || params.pin`, it throws `"An existing account's password or PIN cannot be changed here; use a password or PIN change"`.
- **When it runs.** The check comes before any in-memory or stored change, and the port and its subscribers are never reached.
- **Why truthiness.** It matches the existing write conditions, so `""` still means "no change" and a profile update with blank credential fields still works.

### `WEB/app/api/auth/login/route.ts` (amendment 1)

- **Before K0.5.** The only bound was keyed `${address}:${username}`. Without a trusted proxy the address is always "direct", so one client could try any number of usernames.
- **Three trackers.** Each is a `DurableLoginAttemptTracker` with a 10-minute window and a 60-second lockout, built by one `attemptTracker(fileName, maxAttempts)` helper and cached per file under `.fluxiq/security/`:
  - **Username:** `login-attempts.json`, 5 failures, key `rateLimitKey(request, username)` exactly as before.
  - **Trusted address:** `login-address-attempts.json`, 20 failures, keyed by `trustedClientAddress(request)`.
    - That returns `null` unless `FLUXIQ_TRUST_PROXY=true`.
    - It also returns `null` when `loginClientAddress` gives its placeholder for a proxied request with no forwarded address, `"proxy-unknown"`.
    - With `null`, this bound is neither checked nor counted, so clients never share an address bucket.
  - **Whole panel:** `login-panel-attempts.json`, 100 failures, one constant key `"panel"`, applied whether or not a proxy is trusted.
- **Before authenticating.** The panel lockout, the address lockout when a trusted address exists, and the username lockout are checked, and the longest remaining lockout wins.
- **On failure.**
  - The username counter is always registered.
  - The address counter (when a trusted address exists) and the panel counter are registered only for a guess. An authenticator prompt is not a guess: a `TotpRequiredError` with no `totp` supplied, which `authenticate` throws only after the password is proven. A staged 2FA login therefore counts only against its username.
  - Status is 429 when any bound is locked.
  - `retryAfterMs` is the latest unlock, and `attemptsRemaining` is the smallest remainder.
- **On success.** Only the username counter clears. Clearing the address or panel counter would let one valid account reset the spray bound between rounds.
- **Unchanged.** `rateLimitKey` and `loginTotpError` are unchanged, and no new export was added. The route is 187 lines.

### Tests

- **`FX/programs/_shared/tests/runtime-credential-changes.test.ts`** (new, 2 cases, production cost, about 5.5 s each):
  1. **Own password change.** Through `createGlobalProgramRuntime` with real paths, admin creates a key and changes their own password with `setPasswordAuthorized`.
     - The key reveals with the new password.
     - The old password fails with "Secret key could not be opened".
     - After closing and restarting a runtime over the same databases, admin logs in with the new password, and the key still reveals with the new password and not the old.
  2. **Administrator reset of another account.** The reset succeeds and the account logs in with the reset password. Its key does not reveal with the reset password, and does reveal with the account's old password (CD5).
- **`FX/programs/identity-access/runtime/tests/run-credential-change.test.ts`** (new, 5 cases, test-only N=2^10):
  1. **A commit failure after the write.** Three subscribers, the middle one's commit throwing: the call returns the write's result, all three still commit, and the recorder gets exactly `{ changeId, userId, failedSubscriberCount: 1, subscriberCount: 3 }`.
  2. **The default recorder.** `console.warn` is called once, and the line carries the change id, the user id, and "1 of 1", and contains neither the commit error's text nor either password.
  3. **A recorder that throws** still leaves the change successful.
  4. **A prepare failure** refuses the change: nothing is written, the subscribers asked are aborted in order, the later subscriber is never asked, and nothing is recorded.
  5. **Through `IdentityAccessService`.** With a subscriber whose commit throws, `setPasswordAuthorized` resolves; the new password authenticates and the old one does not, both in that instance and in a fresh service over the same repository.
- **`FX/programs/identity-access/runtime/tests/service.test.ts`**, new `describe("IdentityAccessService upsertUser")` with 2 cases:
  1. **Refused changes.** A password change and a PIN change through `upsertUser` on an existing id both reject, and:
     - no repository put happens;
     - no subscriber event fires;
     - the stored seal still opens with the old password, and the profile name is unchanged;
     - the new password fails;
     - the attempted PIN fails and the old PIN passes;
     - a fresh service over the store logs in with the old password.
  2. **Profile update still allowed.** A profile update on an existing id with `password: ""` and `pin: ""` still succeeds and persists.
- **`WEB/app/api/auth/login/tests/route.test.ts`**, 8 cases.
  - **Setup.** The file mocks `fluxiq`, `next/headers`, and `lib/fluxiq`. Each bounds test gets a fresh temporary `.fluxiq` root and a freshly imported route module (`vi.resetModules()` then `await import("../route")`), so no count carries between tests. `FLUXIQ_TRUST_PROXY` is unset unless a test sets it.
  1. **TOTP code format:** the existing case, unchanged.
  2. **No trusted address**, two variants: no trusted proxy with an `x-forwarded-for` header that must be ignored, and a trusted proxy that forwards no address. In each, 25 failures with different usernames all return 401, and a different username then logs in (200).
  3. **Trusted proxy, one address:** 20 failures from one address with different usernames give 401 ×19, then 429. That address is then 429 for a new username before `authenticate` runs. Another address logs in (200).
  4. **Per-username bound, trusted proxy:** 5 failures for one username give 401 ×4, then 429. Another username from that address is 401.
  5. **Whole-panel bound**, two variants: a trusted proxy with every failure from its own address, and no trusted proxy. 100 failures with different usernames give 401 ×99, then 429; a further login with a new username is 429; `authenticate` was called exactly 100 times.
  6. **Authenticator prompts, trusted proxy:** 25 prompts from one address with different usernames are all 401 with `requiresTotp`. A following wrong guess reports `attemptsRemaining: 4`.
- **Test data.** Only dummy passwords are used: `dummy-password-*`, the bootstrap `admin`, and PINs `4321` and `9876` from the existing file.

### Docs

- **`docs/operations/data-and-state.md`, Identity State:**
  - the version 2 envelope with `kdfParams` at N=2^17, r=8, p=1, keyed from the decoded salt bytes, and PHC hashes;
  - derivations off the event loop, at most two at a time, and the dummy derivation;
  - how version 1 records and `scrypt:` hashes upgrade;
  - no PIN verifier stored, so a PIN gate after a restart needs a new sign-in;
  - sessions stored under a SHA-256 digest, with raw-id records deleted and users signed in again;
  - credentials change only through password or PIN changes, and `upsertUser` refuses;
  - the credential-change port, including (amendment 2) that a commit failure after the write is logged by change id, user id, and count, never an error text, and does not fail the change;
  - self-service re-seal, and administrator resets that cannot recover keys;
  - the Database Manager `put-record` and `delete-record` recheck;
  - legacy plaintext now sealed as version 2;
  - a downgrade and rollback note;
  - the session record id shown as a digest;
  - the three login-attempt files, their bounds, the trusted-address condition, and success and prompt behaviour (amendment 1).
- **`docs/operations/data-and-state.md`, Secret Key State:**
  - the version 2 seal, with `kdfParams` and `sealedByUserId`;
  - **corrected claim:** it used to say only reveal decrypts. It now says `unlockSession` opens the keys sealed for that user, unstamped keys, and version 1 keys at login, and holds their derived keys for the session;
  - the reveal-authorization check;
  - `lastRotatedAtMs` matching, so metadata edits no longer break unlock;
  - upgrade at unlock or reveal, with held keys swapped and old buffers zeroed, and never a weaker rewrite;
  - self-service password-change re-seal, refusal if preparation fails, and administrator resets that cannot recover keys;
  - the Database Manager write and delete recheck;
  - the envelope field list, now including `version`, `kdfParams`, and `sealedByUserId`.
- **`docs/programs/global-programs.md`:**
  - **Identity & Access:** sessions stored by digest; failed web logins bounded per username, per client address when a trusted proxy forwards one, and across the whole panel; PINs after a restart; credentials not changeable by re-creating a user.
  - **Secret Keys:** recorded parameters and upgrades at unlock or reveal, self-service re-seal, and administrator resets that cannot recover keys.
- **`docs/architecture/automation-studio/persistence.md`, key lifecycle.** A re-seal swaps held keys and zeroes the old buffers: an upgrade replaces the key for every holder; a re-seal after the owner's own password change keeps only that user's sessions and revokes other holders, including reveal authorizations and so any LLM grant built on one.
- **`docs/architecture/package-boundaries.md`:**
  - **Version line:** `fluxiq` is now `0.5.0`.
  - **New Migration Notes entry, "0.5.0: stronger password derivation, hashed session ids, and credential hardening":** who should read it; records upgrade forward only, with 0.4.x lockout and the rollback note; the `EncryptedSecretValueRecord` union; sessions signed out and the digest in `snapshot()`; PIN gates after a restart; login cost and the dummy derivation; the port options and methods, the hosts' obligation to subscribe Secret Keys, administrator reset, and `upsertUser` throwing; the reveal-authorization check, error text changes, metadata edits, `createdBy` from the actor, and the Database Manager write and delete recheck; and the CD15 and K4d change (`withheldResultPayload`, `FluxIQRuntimeCommandAttemptResult`).
  - **Amendment 2 in that entry:** a failure to *prepare* the re-seal refuses the change, while after the write the change stands and a subscriber's `commit` failure is logged by ids and counts. It says the port used to rethrow the first commit error.
  - **CD15 correction in the 0.4.0 entry.** The "Not withheld" bullet now lists `command.metadata`, `result.failure`, and `result.metadata`, and says `result.payload` was not withheld in 0.4.0 either, while from 0.5.0 a caller withholds it with `withheldResultPayload`.
  - **Not affected:** the web login limiter is not part of the `fluxiq` package, so it is not in Migration Notes.
- **`packages/fluxiq/package.json`:** `"version": "0.5.0"`.
- **Framework reference:** not regenerated, per the brief.

## Commands run and observed results

Every heavy command ran alone. No two ran at once.

### First pass (before the amendments)

1. **Route test (original two-bound version):** `Tests 4 passed (4)`, exit 0.
2. `… vitest run src/programs/identity-access/runtime/tests/service.test.ts --no-file-parallelism` → `Tests 22 passed (22)`: 20 existing and 2 new.
3. `… vitest run src/programs/_shared/tests/runtime-credential-changes.test.ts --no-file-parallelism --reporter=verbose` → `Tests 2 passed (2)`, 5485 ms and 5382 ms.
4. `… vitest run src/programs/tests/global-identity-access.test.ts src/programs/tests/global-secret-keys.test.ts --no-file-parallelism` → `Test Files 2 passed`, `Tests 11 passed (11)`.
5. **Mutations** with `node <scratchpad>/k0-5-mutations.mjs <ids>`. The script backs up the file, applies exact replacements that must each match once, runs the named test file alone, restores in `finally`, and compares byte for byte. Every mutation printed `restore byte-identical: true`.

   | Mutation | Run | Observed |
   | --- | --- | --- |
   | M1: port subscription removed | runtime test | `1 failed \| 1 passed`: the own-password case, `promise rejected "Error: Secret key could not be opened" instead of resolving` |
   | M2: adapter prepares on an administrator reset | runtime test | `1 failed \| 1 passed`: the administrator-reset case, `Error: Secret key credential change is invalid` |
   | M3: `upsertUser` refusal disabled | identity unit test | `1 failed \| 21 passed`: `promise resolved "{ id: 'user.one', …(7) }" instead of rejecting` |
   | M4 and M5 (original route code) | route test | red, then superseded by the amended route |

6. `pnpm --filter fluxiq check` → exit 0. 7. `pnpm --filter @fluxiq/web check` → exit 0. 8. `node scripts/validate-docs.mjs` → 122 files, exit 0.
9. **Structure audit:** exit 1, only `[working-docs]` failures on the plan document and `docs/working/README.md`; the one rerun gave the same. My files show advisory warnings only.
10. **After the mutations:** runtime and identity files → `Tests 24 passed (24)`; route → `Tests 4 passed (4)`.

### After the crash

11. **File integrity greps:** all edits present, no mutation text. Then, in sequence: vitest over runtime, identity unit, global-identity-access and global-secret-keys → `Tests 1 failed | 34 passed (35)`, the failure being `global-secret-keys.test.ts:40` (the TOTP reveal returned `{ ok: false }`); route test 4 passed; fluxiq check exit 0; web check exit 0; validate-docs exit 0; audit exit 1 on `docs/working/README.md` only.
12. **`global-secret-keys.test.ts` rerun alone:** `Tests 1 passed (1)`.
13. **After the Secret Key State doc edit:** validate-docs → 123 files, exit 0.

### Amendment 1 (limiter)

14. Route test → `Tests 8 passed (8)`, exit 0. Panel cases 1570 ms and 881 ms.
15. **Route mutations** with `node <scratchpad>/k0-5-route-mutations.mjs <ids>`, same procedure; every one printed `restore byte-identical: true`, and a grep for all five strings afterwards found nothing.

    | Mutation | Observed |
    | --- | --- |
    | M4: address key includes the username | `1 failed \| 7 passed`: trusted proxy, one address across usernames, `expected 401 to be 429` |
    | M5: prompt counted as a guess | `1 failed \| 7 passed`: the authenticator-prompt case, `expected 429 to be 401` |
    | M6a: no trusted proxy keys on the shared "direct" | `2 failed \| 6 passed`: the no-proxy spray case and the no-proxy panel case, which locked at 20 instead of 100 |
    | M6b: a proxied request with no forwarded address keys on "proxy-unknown" | `1 failed \| 7 passed`: the proxy-without-address spray case |
    | M7: panel bound raised to 1,000 | `2 failed \| 6 passed`: both panel cases, `expected 401 to be 429` |

16. **Then, in sequence:** route test 8 passed; `pnpm --filter @fluxiq/web check` exit 0; validate-docs 124 files, exit 0; audit exit 1 on the plan document and `docs/working/README.md`, with no line naming `auth/login`.

### Amendment 2 (credential-change port)

17. `… vitest run src/programs/identity-access/runtime/tests/run-credential-change.test.ts src/programs/identity-access/runtime/tests/service.test.ts --no-file-parallelism --reporter=verbose` → `Test Files 2 passed`, `Tests 27 passed (27)`: 22 service and 5 new.
18. **Mutation M8, rethrow the commit error.** A PowerShell runner copied the file to the scratchpad, confirmed the anchor `  return result;` matched once, inserted `if (commitErrors.length > 0) throw commitErrors[0];` before it, ran both identity test files, then restored from the backup in `finally` and compared hashes.
    - `Tests 4 failed | 23 passed (27)`. The four were every new case that reaches a commit: the three unit cases (`Error: dummy-secret-in-commit-error`, twice as `promise rejected … instead of resolving`) and the service-level case, `promise rejected "Error: dummy-secret-in-commit-error" instead of resolving`.
    - The prepare-refusal case stayed green, as it never reaches a commit.
    - `restore byte-identical: True`, and a grep for `throw commitErrors` afterwards found nothing.
19. **Then, in sequence:**
    - **Identity tests:** `Tests 27 passed (27)`, exit 0.
    - **`runtime-credential-changes.test.ts`:** `Tests 2 passed (2)`, exit 0, 5544 ms and 5891 ms.
    - **`pnpm --filter fluxiq check`:** **exit 2**, one error, in a file I do not own:
      `src/programs/automation-studio/runtime/service/recordings/tests/candidate-definitions.test.ts(269,129): error TS2304: Cannot find name 'AutomationStudioFlowArtifact'.`
      - The one permitted rerun gave exactly the same single error.
      - `git status` shows that file and its subject `candidate-definitions.ts` as untracked, beside modified `recordings/index.ts` and `proposal-candidates.ts`: another worker's change in progress.
      - No error names an identity-access, `_shared`, or `apps/web` file of mine, and this check passed at steps 6 and 11.
    - **`node scripts/validate-docs.mjs`:** 126 files, exit 0.
    - **Structure audit:** exit 1, `1 violation(s)`, only `docs/working/README.md is out of date`. My identity-access lines are advisory only (37 methods, 736 lines).

## Not verified

- **The type check does not currently pass**, because of another worker's uncommitted recordings file (step 19). My own files were type-checked clean at steps 6 and 11, and `apps/web` passes now, but no green `pnpm --filter fluxiq check` exists after amendment 2. The supervisor should rerun it once that worker's file compiles.
- **Secret Keys' write-ahead recovery is not landed or tested here.** Amendment 2 says the next unlock recovers from a pending seal; that is the K0.2 worker's change, and I did not edit or test Secret Keys files. What I verified is that the password change succeeds and the new password works when a subscriber's commit throws. Until the write-ahead lands, a Secret Keys commit failure would leave that user's keys under the old password while their password has changed.
- **The single `global-secret-keys` failure was not reproduced.** It passed at step 4, failed at step 11, and passed on its rerun. That test takes one TOTP code at setup and reuses it after about 3 s of production-cost derivations. It performs no password change. This rests on one failing and one passing observation.
- **Not rerun after amendment 2:** the route test and `apps/web` check (amendment 2 touched no web file), and the global test files.
- **Not run:** `pnpm test`, `pnpm build`, and a live web login (K0.6). No Automation Studio or other `apps/web` suites were run.
- **E2E suites.** I did not check whether Playwright runs against one fixture root reach 100 failed logins in ten minutes (the panel bound).
- **Not re-read in their reports:** the K0.4 and K0.1 facts in the docs and Migration Notes. They were written from CD2 and CD5.
- **UI copy** saying an administrator's reset cannot recover the account's keys (CD5) is not in my files and was not changed.
- **Generated framework reference:** not regenerated (brief).

## Open questions or contradictions found

1. **`console.warn` is the only such call in `packages/fluxiq/src` outside tests.** I grepped: no logging or audit sink exists there to use, so the default recorder writes one warning line, and `recordCommitFailure` is injectable for a host or a test. If Core would rather route this to an audit record, the seam is the fourth parameter of `runCredentialChange`.
2. **The panel bound is a shared bucket by design.** Anyone who can reach the login can lock every login out for a minute with 100 failures in ten minutes, and repeat. I implemented it as amendment 1 specifies.
3. **The route depends on a literal from a file I do not own.** `trustedClientAddress` treats `"proxy-unknown"`, returned by `loginClientAddress` in `lib/login-attempts.ts`, as "no address". If that placeholder changes, a proxied request with no forwarded address would share one bucket again; mutation M6b's test would catch it. A cleaner seam would be `loginClientAddress` returning `null`.
4. **A pre-existing race remains.** Concurrent requests all pass the lockout check before any failure is registered. This holds for every bound.
5. **`upsertUser` gaps outside the brief:** a new id with an existing account's username creates a duplicate username, and which account a login finds then depends on stored order; and an existing id can still change `roleId` or `enabled` without the final-administrator guard that `updateUser` has. Both need `identity.manage`. Neither was changed.
6. **K4d in 0.5.0.** The entry includes K4d's public type change (`FluxIQRuntimeCommandAttempt.result`). The supervisor should confirm K4d ships in 0.5.0.
7. **Route test values.** The route test mocks `fluxiq` rather than importing `packages/fluxiq/dist`, which could be stale. It hardcodes the route's bounds (5, 20, 100), because adding exports to a Next.js route file was avoided.
8. **`types.ts` still describes the port.** Its `IdentityCredentialChangeSubscriber` comment says prepare, write, commit, abort, and says nothing about rethrowing commit errors, so it is still accurate. I did not edit it, as I do not own it.
