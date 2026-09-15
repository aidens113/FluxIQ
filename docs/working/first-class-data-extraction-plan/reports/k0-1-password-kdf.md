# Report: k0-1-password-kdf

Worker report for brief `k0-1-password-kdf` (step K0.1, CD2). Repository: FluxIQ Core (`F:\!FluxIQ`).

Revision 2, after the supervisor's three decisions: the rehash rule, PHC salt bytes, and the limiter comment.

## Outcome

**Partial.** Everything in my scope is done; one check is red, and the failure is in a file I don't own.

- **Supervisor decisions, all applied:**
  - Rewrite only legacy hashes or hashes below the write cost.
  - New PHC hashes derive from the decoded salt bytes, and the salt helpers are exported for the version 2 seals.
  - The limiter comment now says about 256 MiB.
- **Tests:** 7 files, 99 tests pass.
- **Type check** of the new files passes.
- **Structure audit fails** (exit 1) on one violation outside my files: `[working-docs] docs/working/README.md is out of date with the documents' header blocks. Run "pnpm structure:baseline" to regenerate it.` No audit line names `password-kdf`. That README is a shared document, and regenerating it is the supervisor's job. At revision 1 the audit passed on this same directory.
- **Mutation 3** was observed red at revision 1 and reverted. Its target line is unchanged, but it was not re-run on this revision.
- **Mutations 10 and 14** were handed to the supervisor, as instructed, and not attempted.

## What changed and why

### Placement, confirmed against `docs/architecture/code-structure.md`

- **Location:** `packages/fluxiq/src/programs/_shared/password-kdf/`, owned by `_shared` because it has two real consumers, Secret Keys (K0.2) and Identity Access (K0.3).
- **Depth:** 7 path segments, within the limit of 8.
- **File-name prefixes:** `scrypt-` is shared by 2 files. The new salt file is named `kdf-salt.ts` rather than `scrypt-salt.ts`, because a third `scrypt-` file would trip the audit's shared-prefix rule.
- **Barrels:** `password-kdf/` has an `index.ts`. `programs/_shared/` has no parent barrel, so none was created or edited.
- **Tests:** in `password-kdf/tests/`, one file per subject.

### Files (all new in this work; no file outside `password-kdf/` touched)

| File | Exports and behaviour |
| --- | --- |
| `types.ts` | Types: `ScryptParameters` (`{ N, r, p, keyLength: 32 }`), `ScryptDerivationOptions`, `DeriveScryptKeyFn`, and `PasswordKdfOptions` (`{ derive?, testOnlyWeakParameters? }`). |
| `scrypt-parameters.ts` | Constants:<br>- `CURRENT_SCRYPT_PARAMETERS` (2^17, 8, 1, 32)<br>- `LEGACY_V1_SCRYPT_PARAMETERS` (2^14)<br>- `ACCEPTED_V2_SCRYPT_PARAMETERS` (exactly 2^17 and 2^18)<br><br>Functions:<br>- `isAcceptedScryptParameters`: the derivation allowlist<br>- `isAcceptedV2ScryptParameters`: the v2 record allowlist<br>- **`isBelowScryptWriteCost(recorded, write)`** (new): returns `recorded.N < write.N`<br>- `scryptWriteParameters`<br><br>`sameScryptParameters` is no longer exported. |
| `kdf-salt.ts` (new) | **`createKdfSalt(): Buffer`** returns 16 random bytes.<br>**`decodeKdfSalt(text): Buffer \| null`** returns bytes only for canonical unpadded base64url of 16 to 64 bytes, and null otherwise. |
| `scrypt-derivation-limiter.ts` | `createScryptDerivationLimiter(concurrency)` and the process-wide `scryptDerivationLimiter` (concurrency 2). The header comment now reads: about 128·N·r per derivation (128 MiB at N=2^17), about 256 MiB for two. |
| `derive-scrypt-key.ts` | `deriveScryptKey(secret, salt, parameters, options?)`. Checks the allowlist first, then runs async `crypto.scrypt` with `maxmem: 256 * N * r` through the limiter. Salts are `BinaryLike`, passed through unchanged. |
| `password-hash-format.ts` | `formatScryptPasswordHash(parameters, saltBytes, hash)` and `parseScryptPasswordHash`. A parsed PHC hash's `salt` is decoded bytes; a parsed legacy hash's `salt` is the text as written. Internal; not in the barrel. |
| `hash-password.ts` | `hashPassword`: derives from `createKdfSalt()` bytes and writes `$scrypt$ln=17,r=8,p=1$<base64url(salt bytes)>$<hash>`. |
| `verify-password-hash.ts` | `verifyPasswordHash` returns `{ ok, needsRehash }` and never throws. The PHC form derives from decoded salt bytes; the legacy form from the salt text. `needsRehash = legacy form \|\| isBelowScryptWriteCost(recorded, write)`. |
| `index.ts` | Barrel over everything above except the format and limiter modules. Its header comment documents the salt rule for seals. |

Test files and counts:

| Test file | Tests |
| --- | --- |
| `tests/scrypt-parameters.test.ts` | 23 |
| `tests/scrypt-derivation-limiter.test.ts` | 4 |
| `tests/derive-scrypt-key.test.ts` | 11 |
| `tests/password-hash-format.test.ts` | 21 |
| `tests/hash-password.test.ts` | 7 |
| `tests/verify-password-hash.test.ts` | 23 |
| `tests/kdf-salt.test.ts` (new) | 10 |

### Decision 1: the rehash rule

`needsRehash` is true only in two cases:
- the hash is the legacy `scrypt:<salt>:<hash>` form;
- the recorded N is smaller than the write N.

A hash at an equal or stronger cost is never rewritten, so a rollback cannot downgrade it.

Tests for the required cases:

| Case | Expected | Where tested |
| --- | --- | --- |
| Legacy form | `needsRehash: true` | `verify-password-hash.test.ts`: `rehash rule > legacy form...`, plus a real `scryptSync` legacy hash, also under a weak-parameter instance |
| ln=17 at a write of ln=17 | `false` | `verify-password-hash.test.ts` and `scrypt-parameters.test.ts > rewrite rule` |
| ln=18 at a write of ln=17 | `false` | `verify-password-hash.test.ts` and `scrypt-parameters.test.ts` |
| ln=17 at a write of ln=18 | `true` | `scrypt-parameters.test.ts > rewrite rule` only |
| ln=17 read by an instance writing weak ln=10 (added) | `false` | `verify-password-hash.test.ts` |

The ln=17-at-ln=18 case is tested only through `isBelowScryptWriteCost`. `verifyPasswordHash` can't be given a write cost above the current ln=17, because weak parameters must be below it.

### Decision 2: salt bytes

- **New PHC hashes** derive from `createKdfSalt()` bytes and store `bytes.toString("base64url")`.
- **Verifying a PHC hash** decodes the salt with `decodeKdfSalt`. A non-canonical salt, or one outside 16-64 bytes, makes the string malformed, so `ok: false`.
- **The legacy form** keeps using the salt text as written.
- **Instructions for version 2 seals (K0.2 and K0.3):**
  - to seal, store `createKdfSalt().toString("base64url")` and derive from the bytes;
  - to open, derive from `decodeKdfSalt(record.salt)` and fail closed when it returns null;
  - version 1 envelopes keep deriving from `record.salt` text.

Tests:
- `hash-password.test.ts > stores base64url of the salt bytes scrypt actually derived from` recomputes with real `scryptSync` at N=2^10. It asserts the hash field equals scrypt over the decoded salt bytes, and differs from scrypt over the salt text.
- `hash-password.test.ts > hands an injected derive the salt bytes the stored salt field decodes to` checks that derive received a 16-byte Buffer and that the salt field decodes to it.
- `verify-password-hash.test.ts > verifies a real PHC hash from its decoded salt bytes, not from the salt text` checks that a hash computed from the salt text does not verify.
- `kdf-salt.test.ts` covers creation, the round trip, and rejection of 15 or 65 bytes, padding, standard-base64 characters, a non-canonical final character, whitespace, and non-strings.

### Decision 3

The limiter comment is corrected. See the table above.

### Unchanged from revision 1

- **Exact allowlists:** exactly the keys N, r, p, keyLength, all numbers. Derivation accepts v1, v2, or valid weak parameters. A v2 record accepts 2^17, 2^18, or valid weak parameters. The allowlist is checked before any derive, injected or real.
- **Weak parameters** are valid only with r=8, p=1, keyLength 32, and N a power of two below 2^17. `scryptWriteParameters` throws for invalid weak parameters.
- **Limiter:** first in, first out; no timers; only `deriveScryptKey` enters it.
- **Key hygiene:** derived buffers are zeroed after use.
- **Testability:** `crypto.scrypt` is called through the default import, so tests can spy on it.
- **Test data:** only dummy passwords and fake keys.

## Commands run and observed results (revision 2)

All commands ran alone, one at a time.

1. **Tests.** From `F:\!FluxIQ\packages\fluxiq`: `npx vitest run <the 7 password-kdf test files> --no-file-parallelism`
   - Vitest v2.1.9: `Test Files 7 passed (7)`, `Tests 99 passed (99)`, `Duration 3.01s`.
   - `derives 32 bytes at N=2^17 with maxmem 256·N·r` took 336 ms.
   - `writes the current parameters as a PHC string that verifies without a rehash` took 642 ms.
   - Both timings are single observations on this faulty-RAM machine.
2. **Type check.** `npx tsc -p <scratchpad>/k0-1-password-kdf.tsconfig.json`
   - The config extends `packages/fluxiq/tsconfig.json` and includes only `password-kdf/**/*.ts`.
   - `--listFilesOnly` matched 16 `password-kdf` files. The check exited 0 with no output.
3. **Structure audit.** From `F:\!FluxIQ`: `node scripts/structure-audit.mjs`, output saved to `<scratchpad>/k0-1-audit.txt`
   - Exit 1: `structure-audit: 1 violation(s) across 1 rule(s).`
   - The only `FAIL` line: `[working-docs] docs/working/README.md is out of date with the documents' header blocks. Run "pnpm structure:baseline" to regenerate it.`
   - `grep -c "password-kdf"` on the output: `0`.

Revision 1 results, kept for the record:
- 6 files and 80 tests passed; tsc exit 0 over 14 files; the audit passed (`123 warning(s), 256 baselined`).
- Mutation 3 (`maxmem` 128·N·r) gave `Tests 5 failed | 12 passed (17)` and was reverted.
- The mutation 10 edit and one clean test rerun were denied by the auto-mode permission classifier (`[Security Weaken]`). This round's test rerun was allowed.

## Not verified

- **Mutations 10 and 14 were not attempted**; the supervisor handles them. The edits and the tests expected to turn red:
  - **10a.** Delete the allowlist `if` block in `derive-scrypt-key.ts`. Expected red: the 7 `rejects ... before crypto.scrypt is called` cases, and `accepts weak parameters only...`.
  - **10b.** Delete the `parsed.form === "phc" && !isAcceptedV2ScryptParameters(...)` early return in `verify-password-hash.ts`. Expected red: the 7 `returns ok: false for out-of-allowlist ... without deriving` cases.
  - **10c.** Make `isAcceptedV2ScryptParameters` return true after its shape check. Expected red: the `scrypt-parameters.test.ts` rejections, plus the cases above.
  - **14.** Change `SCRYPT_DERIVATION_CONCURRENCY = 2` to `Number.MAX_SAFE_INTEGER`. Expected red: `scrypt-derivation-limiter.test.ts > runs at most two process-wide tasks...`, and `derive-scrypt-key.test.ts > runs derivations through the process-wide limit of two`.
- **Mutation 3 was not re-run on this revision.** The `maxmem` line is unchanged.
- **The audit is red** on `docs/working/README.md`, which is not mine. Whether my files pass every rule is inferred from zero `password-kdf` lines and a clean pass at revision 1, not from a green run.
- **ln=17 at a write of ln=18** is covered only at the comparator, not through `verifyPasswordHash`.
- **No real N=2^18 derivation** was run; acceptance is tested with an injected derive.
- **No consumer wiring, full suite, `pnpm check`, `test`, or `build`**, per the brief. Only Node v22.11.0 was exercised.

## Open questions or contradictions found

1. **Conflict with the k0 report §4.5 (K0.2 and K0.3).** The planned re-seal condition is `version === 1 || kdfParams ≠ this instance's write parameters`. Under decision 1 it becomes `version === 1 || isBelowScryptWriteCost(record.kdfParams, writeParameters)`.
   - Still consistent: §6 Secret Keys case 11 (a v2 record at the write parameters is not rewritten), Secret Keys cases 3 and 5 and Identity Access cases 2 and 6 (version 1 records and legacy hashes are always rewritten), and §7 mutation 4.
   - Changed behaviour: a weak-parameter test instance no longer rewrites a v2 record written at 2^17. §6 lists no case that expects it to, but the §4.5 text should be amended.
2. **Conflict with the k0 report §4.3 and §4.5 (K0.2 and K0.3).** §4.3 says the salt "stays 16 random bytes as a base64url string, as today", and §4.5 re-seals "with a new salt". Storage is unchanged, but the derivation input changes:
   - v2 envelopes must derive from `decodeKdfSalt(record.salt)` and seal with `createKdfSalt()` bytes;
   - v1 envelopes keep deriving from the salt text.

   Both services must adopt this from their first v2 write. A v2 seal derived from the salt text would not open under this rule. The inner `passwordHash` and `pinHash` inherit the rule automatically through `hashPassword` and `verifyPasswordHash`.
3. **Audit red on `docs/working/README.md`.** The working-document index is out of date against a document header block, which needs `pnpm structure:baseline`. I did not cause or touch it. Core's git status at session start already showed `docs/working/first-class-data-extraction-plan.md` modified.
4. **Worker permissions block security mutations.** Earlier in this session the permission classifier refused a worker edit that removed a security guard. K0.6's mutation proofs (k0 report §7) will likely need the supervisor, or granted permission.
