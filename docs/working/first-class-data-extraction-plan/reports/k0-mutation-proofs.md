# Report: k0-mutation-proofs

Worker report for brief `k0-mutation-proofs` in
`docs/working/first-class-data-extraction-plan.md`. Verification only,
2026-09-15. `SCRATCH` means
`C:\Users\mrjoh\AppData\Local\Temp\claude\f---FluxIQWebExtension\3454178a-dd53-4d6d-917d-85b8f63d0d91\scratchpad\mutation-proofs`.

## Outcome

**Done.** The permission classifier had refused these guard mutations on real
source. Each was run on a throwaway copy:

- the unmodified copy passed;
- the mutated copy failed in the tests the reports predicted.

No file in either repository was edited except this report.

| Mutation | What was removed or weakened (copy only) | Unmodified copy | Mutated copy |
| --- | --- | --- | --- |
| K0.1 #10a | The allowlist `if` block in `deriveScryptKey` | 61 of 61 pass | **8 failed**, 53 passed |
| K0.1 #10b | The PHC allowlist early return in `verifyPasswordHash` | 61 of 61 pass | **7 failed**, 54 passed |
| K0.1 #10c | `isAcceptedV2ScryptParameters` returns `true` after its shape check | 61 of 61 pass | **26 failed**, 35 passed |
| K0.1 #14 | `SCRYPT_DERIVATION_CONCURRENCY` changed from `2` to `Number.MAX_SAFE_INTEGER` | 61 of 61 pass | **2 failed**, 59 passed |
| K0.4 | The `authorizeSensitiveStore` call and its `if (!authorization.ok)` line in `put-record` | 27 of 27 pass | **7 failed**, 20 passed |

Mutation 10 is split into 10a, 10b and 10c, following `reports/k0-1-password-kdf.md`
("Not verified"). That report refined `reports/k0-secret-keys-kdf.md` §7 #10
into the three separate guards that K0.1 actually built.

## What changed and why

The only file written in a repository is this report. Everything else is under
`SCRATCH`.

**How the copies were built.** There are five independent copies, one per
mutation: `m10a`, `m10b`, `m10c`, `m14` and `k04`. Each has the layout
`SCRATCH\<case>\` as follows:

- `tsconfig.base.json`: copied from `F:\!FluxIQ\tsconfig.base.json`, so the
  package tsconfig's `extends` still resolves.
- `packages\fluxiq\src\`: the whole working-tree `packages/fluxiq/src`, copied
  with `robocopy /E` (687 files). This includes the uncommitted K0.1-K0.4
  work.
- `packages\fluxiq\package.json` and `tsconfig.json`: copied unchanged.
- `packages\fluxiq\vitest.config.ts`: the package config with the same
  timeouts (15 s hook, 15 s test), plus `cacheDir: ".vite-cache"`. Vitest's
  results cache therefore stays inside the copy rather than reaching the
  repository through the link below.
- `packages\fluxiq\node_modules`: a directory junction to
  `F:\!FluxIQ\packages\fluxiq\node_modules`. This lets the copy resolve
  `vitest`, `sqlite3`, `@fluxiq/contracts` and the rest exactly as the package
  does.

**Why full copies.** The K0.4 test uses the real `IdentityAccessService` and
`DatabaseManagerService`, which pull in much of `src`. Copying all of `src`
avoids guessing which files are needed. A separate copy per mutation means each
mutated copy had its own unmodified baseline run first.

**When the copies were taken.** Between 15:37:06 and 15:37:09 local time. Six
target files were hashed (SHA-256, first 16 hex characters) in the repository
and in all five copies, and the hashes matched. At 15:42:17, after every run,
they were hashed again in the repository and were unchanged:

| File under `src/programs/` | Hash |
| --- | --- |
| `_shared/password-kdf/derive-scrypt-key.ts` | `6B4B10E7E3518FC3` |
| `_shared/password-kdf/verify-password-hash.ts` | `5403C7412A3A5CEA` |
| `_shared/password-kdf/scrypt-parameters.ts` | `44D41861A3B8CE2B` |
| `_shared/password-kdf/scrypt-derivation-limiter.ts` | `0CED6104A414543F` |
| `database-manager/api/handlers.ts` | `2775493F77D107C2` |
| `database-manager/api/tests/handlers.test.ts` | `80384508F3DDBFB4` |

**Clean-up.** After the last run, all five junctions were removed with a
non-recursive `cmd /c rmdir`. The copies and logs remain under `SCRATCH`, and
recursively deleting `SCRATCH` can no longer reach the repository.
`F:\!FluxIQ\packages\fluxiq\node_modules` still has its 9 entries, including
`vitest`.

The mutations were applied with the Edit tool to the copy files only, and none
was written back.

## Commands run and observed results

Every Vitest command ran alone, one at a time, from
`SCRATCH\<case>\packages\fluxiq`. Full output is in
`SCRATCH\logs\<case>-{baseline,mutated}.txt`. Vitest v2.1.9 and Vite 5.4.21 were
used (from `node_modules\.pnpm`).

Password-kdf command (cases `m10a`, `m10b`, `m10c`, `m14`):

```text
node_modules\.bin\vitest.cmd run src/programs/_shared/password-kdf/tests/derive-scrypt-key.test.ts src/programs/_shared/password-kdf/tests/scrypt-derivation-limiter.test.ts src/programs/_shared/password-kdf/tests/verify-password-hash.test.ts src/programs/_shared/password-kdf/tests/scrypt-parameters.test.ts --no-file-parallelism --reporter=verbose
```

Database Manager command (case `k04`), the same pair of files the K0.4 report
ran:

```text
node_modules\.bin\vitest.cmd run src/programs/database-manager/api/tests/handlers.test.ts src/programs/database-manager/tests/index.test.ts --no-file-parallelism --reporter=verbose
```

### Mutation 10a: allowlist guard removed from `deriveScryptKey`

**Diff.** `git diff --no-index --stat` over the `password-kdf` directory, from
the repository to the copy, printed
`derive-scrypt-key.ts | 3 ---, 1 file changed, 3 deletions(-)`. The removed
lines were:

```diff
-  if (!isAcceptedScryptParameters(parameters, options.testOnlyWeakParameters)) {
-    return Promise.reject(new RangeError("scrypt parameters are outside the accepted set; refusing to derive."));
-  }
```

**Unmodified copy.** Exit 0: `Test Files 4 passed (4)`, `Tests 61 passed (61)`,
`Duration 1.82s`.

**Mutated copy.** Exit 1: `Test Files 1 failed | 3 passed (4)`,
`Tests 8 failed | 53 passed (61)`. The failures, all in
`derive-scrypt-key.test.ts > deriveScryptKey`:

- `rejects N not a power of two before crypto.scrypt is called`
- `rejects N=2^30 ...`
- `rejects N=2^16 ...`
- `rejects r=16 ...`
- `rejects p=2 ...`
- `rejects keyLength=64 ...`
- `rejects weak N=2^10 without testOnlyWeakParameters ...`
- `accepts weak parameters only for the caller that passes them`

The message was
`AssertionError: expected [Function] to throw error matching /outside the accepted set/ but got 'crypto.scrypt must not be called'`
(test lines 65 and 74).

**Match with the prediction.** This matches the k0-1 report for 10a exactly: the
7 rejection cases plus the weak-parameters case.

### Mutation 10b: PHC allowlist early return removed from `verifyPasswordHash`

**Diff.** The directory stat printed
`verify-password-hash.ts | 3 ---, 1 file changed, 3 deletions(-)`. The removed
lines were:

```diff
-    if (parsed.form === "phc" && !isAcceptedV2ScryptParameters(parsed.parameters, options.testOnlyWeakParameters)) {
-      return REJECTED;
-    }
```

**Unmodified copy.** Exit 0: `4 passed (4)`, `61 passed (61)`, `Duration 1.69s`.

**Mutated copy.** Exit 1: `Test Files 1 failed | 3 passed (4)`,
`Tests 7 failed | 54 passed (61)`. The failures, all
`verify-password-hash.test.ts > verifyPasswordHash > returns ok: false for out-of-allowlist <case> without deriving`,
covered these cases:

- `ln=30`
- `ln=19`
- `r=16`
- `p=2`
- `ln=14 in PHC form`
- `ln=16`
- `ln=10 without weak parameters`

Messages included
`expected { ok: true, needsRehash: false } to deeply equal { ok: false, needsRehash: false }`
and `expected { ok: true, needsRehash: true } to deeply equal { ok: false, needsRehash: false }`
(test line 116).

**Match with the prediction.** This matches the k0-1 report for 10b: the 7
out-of-allowlist cases.

### Mutation 10c: v2 allowlist accepts any correctly shaped parameters

**Diff.** The directory stat printed
`scrypt-parameters.ts | 4 +---, 1 file changed, 1 insertion(+), 3 deletions(-)`.
The change was:

```diff
-  const candidate: ScryptParameters = value;
-  if (ACCEPTED_V2_SCRYPT_PARAMETERS.some((accepted) => sameScryptParameters(accepted, candidate))) return true;
-  return isValidTestOnlyWeakParameters(testOnlyWeakParameters) && sameScryptParameters(testOnlyWeakParameters, candidate);
+  return true;
```

**Unmodified copy.** Exit 0: `4 passed (4)`, `61 passed (61)`, `Duration 1.88s`.

**Mutated copy.** Exit 1: `Test Files 3 failed | 1 passed (4)`,
`Tests 26 failed | 35 passed (61)`. The failures:

- **`derive-scrypt-key.test.ts`:** the same 8 as in 10a.
- **`scrypt-parameters.test.ts`:** 11 failures.
  - The `rejects %s` cases for `N not a power of two`, `N=2^30`, `N=2^16`,
    `N=2^19`, `r=16`, `p=2`, `keyLength=64`, and
    `N=2^10 with no weak parameters`.
  - `does not accept legacy N=2^14 as a version 2 parameter set`.
  - `widens the allowlist by exactly the valid weak parameters a test passes`.
  - `ignores weak parameters that are not below the current cost or not r=8, p=1`.
  - The message was `expected true to be false`.
- **`verify-password-hash.test.ts`:** the same 7 as in 10b.

**Match with the prediction.** This matches the k0-1 report for 10c: the
`scrypt-parameters.test.ts` rejections plus the cases above.

### Mutation 14: limiter concurrency unbounded

**Diff.** The directory stat printed
`scrypt-derivation-limiter.ts | 2 +-, 1 file changed, 1 insertion(+), 1 deletion(-)`.
The change was:

```diff
-const SCRYPT_DERIVATION_CONCURRENCY = 2;
+const SCRYPT_DERIVATION_CONCURRENCY = Number.MAX_SAFE_INTEGER;
```

**Unmodified copy.** Exit 0: `4 passed (4)`, `61 passed (61)`, `Duration 2.23s`.

**Mutated copy.** Exit 1: `Test Files 2 failed | 2 passed (4)`,
`Tests 2 failed | 59 passed (61)`. The two failures:

- `scrypt-derivation-limiter.test.ts > scrypt derivation limiter > runs at most two process-wide tasks at once and drains the queue in order`,
  with `AssertionError: expected [ +0, 1, 2, 3, 4 ] to deeply equal [ +0, 1 ]`;
- `derive-scrypt-key.test.ts > deriveScryptKey > runs derivations through the process-wide limit of two`,
  with `AssertionError: expected [ [Function], [Function], [Function] ] to have a length of 2 but got 3`.

**Match with the prediction.** This matches both tests the k0-1 report
predicted.

### K0.4: credential recheck removed from `put-record`

**Diff.** `git diff --no-index --stat` over the `database-manager` directory
printed `api/handlers.ts | 2 --, 1 file changed, 2 deletions(-)`. The removed
lines were:

```diff
-      const authorization = await authorizeSensitiveStore(identityAccess, payload, scope, sensitiveGrants, request.actor?.userId);
-      if (!authorization.ok) return authorization;
```

**Unmodified copy.** Exit 0: `Test Files 2 passed (2)`, `Tests 27 passed (27)`,
`Duration 33.69s`.

**Mutated copy.** Exit 1: `Test Files 1 failed | 1 passed (2)`,
`Tests 7 failed | 20 passed (27)`, `Duration 32.58s`. All failures are in
`handlers.test.ts > database manager record writes`:

- `'put'-record on the sensitive 'identity.users' store`, all three refusal
  tests:
  - `is refused without credentials, in the same shape as a read`;
  - `is refused with a session but no password, in the same shape as a read`;
  - `is refused with a wrong password, in the same shape as a read`.
- `'put'-record on the sensitive 'secret.keys' store`, the same three refusal
  tests.
- `accepts a store grant for writes only on the store and scope it was issued for`.
  A `secret.keys` grant used for a put on `identity.users` now succeeds.
- The messages were `expected { ok: true, payload: { …(6) } } to deeply equal { ok: false, …(2) }`
  and `... to match object { ok: false, requiresRecheck: true }`.

**What stayed green, as expected:**

- every `delete-record` case, since that handler still has its gate;
- the two `is allowed with the session's correct credentials` put cases;
- the non-sensitive store case;
- the grant-renewal case;
- all 8 tests in `database-manager/tests/index.test.ts`.

**Match with the prediction.** This confirms what the K0.4 report could only
predict by reading: the "refused" put tests turn red.

### Supporting commands

- **Copy and hash** (PowerShell).
  - For each case, `robocopy` exited with 1 ("files copied") and the copy held
    687 files; `node_modules` showed `LinkType Junction`.
  - All six target hashes matched between the repository and each copy (table
    above).
- **Vite and Vitest versions.** Listing `F:\!FluxIQ\node_modules\.pnpm` showed
  `vite@5.4.21_@types+node@22.20.1` and `vitest@2.1.9_@types+node@22.20.1`.
  Vite 5 bundles the config into a temporary file beside the config itself, so
  inside the copy. After the runs, no `vitest.config.ts.timestamp-*` file was
  left in any copy.
- **Cache location.** After all runs, `.vite-cache\vitest\results.json` existed
  in each of the five copies.
- **Repository status.** `git status --short` on `password-kdf` and
  `database-manager` in `F:\!FluxIQ` printed ` M .../database-manager/api/handlers.ts`,
  `?? .../password-kdf/`, and `?? .../database-manager/api/tests/`. That is
  the uncommitted K0.1 and K0.4 work already present at start, and the hashes
  confirm those files were unchanged.
- **Junction removal.** The removal printed `junction removed: True` for all
  five. Afterwards, `repo node_modules vitest still present: True` and
  `repo node_modules entries: 9`.

## Not verified

- **Secret Keys and Identity Access tests under mutation 10 were not run.**
  §7 of `k0-secret-keys-kdf.md` also expects mutation 10 to turn Secret Keys
  cases 10 and 14 red. Those are now in `secret-keys/runtime/tests/`
  (`service.test.ts`, `value-sealer.test.ts`, `record-guard.test.ts`). The brief
  framed this as K0.1's mutation, and the k0-1 report scopes it to the
  password-kdf tests, so only those were run.
- **Other refused mutations were not attempted.** No mutation to
  `delete-record`'s gate and no §7 mutation other than 10 and 14 was run.
- **Type checking.** No type check ran on the mutated copies. Vitest strips
  types, so the mutated files (for example the now-unused
  `isAcceptedV2ScryptParameters` import in 10b) were not type-checked.
- **Copy equivalence rests on six hashes, not a whole-tree comparison.**
  - A whole-tree `git diff --no-index` was attempted, but its output was
    swamped by line-ending warnings.
  - Other workers edit the tree at the same time: the file count went from 686
    to 687 minutes before copying.
  - What was compared exactly: the six target and test files by hash, and the
    target directory of each copy by diff, which showed only the mutation.
  - What was not compared: the other `src` files each copy used, which reflect
    the working tree between 15:37:06 and 15:37:09. Every baseline passed.
- **Single observations on a machine with faulty RAM.** Each result was
  observed once. Every run matched its expected pattern exactly, with real
  assertion differences, and no crash-type failures appeared.
- **K0.4 run time.** The K0.4 runs took about 33 s, against the 9.14 s in the
  K0.4 report. Almost all of it was test time. This is not explained; other
  workers loading the machine is likely but was not checked.

## Open questions or contradictions found

- **No contradictions with the three reports.** Every mutation turned red
  exactly where `k0-1-password-kdf.md` and `k0-4-database-manager-recheck.md`
  predicted.
- **The two allowlist guards are tested independently.**
  - Under 10a, the `verifyPasswordHash` out-of-allowlist cases stayed green,
    because that function still has its own check.
  - Under 10b, real derivation was still refused by `deriveScryptKey`. The red
    came from the injected-derive half of each case, which saw the derive
    called.
  - §7's wording for mutation 10 lists the password-hash out-of-allowlist case
    as failing. It fails under 10b and 10c, not 10a, which matches the k0-1
    report's split.
- **Leftovers in scratch.** The copies and logs remain under `SCRATCH` for
  inspection. The junctions are gone, so deleting `SCRATCH` is safe.
