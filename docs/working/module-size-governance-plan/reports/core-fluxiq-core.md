# Report: core-fluxiq-core

Phase 1 tests relocation for `packages/fluxiq/src/**` excluding
`src/programs/automation-studio/**`.

## Outcome

**Done.** 18 test files moved into `tests/` subfolders across 11
directories, imports repaired, both owned configs updated. Test-file and
test-case counts are identical before and after. One audit finding remains
that only the supervisor's baseline regeneration can clear (see
*Open questions*, item 2).

## What changed and why

### Files moved (18, all via `git mv`, filenames unchanged)

| Directory | Files |
| --- | --- |
| `src/client-gateway/` | `service.test.ts` |
| `src/engine/` | `index.test.ts` |
| `src/framework/` | `index.test.ts`, `storage-migration.test.ts` |
| `src/io/` | `index.test.ts` |
| `src/programs/` | `global-services.test.ts`, `index.test.ts`, `permission-matrix.test.ts` |
| `src/programs/_shared/` | `authorization.test.ts`, `performance-metrics.test.ts`, `runtime-llm-grants.test.ts`, `storage.test.ts` |
| `src/programs/background-tasks/` | `index.test.ts` |
| `src/programs/database-manager/` | `index.test.ts` |
| `src/programs/secret-keys/runtime/` | `service.test.ts` |
| `src/runtime/` | `client-gateway-transport.test.ts`, `service.test.ts` |
| `src/ui/` | `index.test.ts` |

Git records all 18 as renames (`R`). No fixture, factory, or mock was
moved; no subject module was edited.

### Import repair

Every relative specifier gained one level (`./x` to `../x`, `../x` to
`../../x`). Two non-import relative strings in
`src/programs/tests/global-services.test.ts` were deliberately left alone:
line 310 is an HTML `href` inside an assertion string, and line 437 is
`path.resolve(process.cwd(), "../..")`, which is relative to the package
directory, not to the file.

### Barrel imports in five files — required, not cosmetic

The shared context allowed "one extra `../` ... **or** import from the
directory barrel". The barrel form turned out to be mandatory in five
files. `scripts/structure-audit/rules/imports.mjs` exempts same-directory
imports (`if (targetDir === importerDir) continue;`). A test sitting beside
its subject and importing `./service.ts` is therefore exempt; once it moves
to `tests/` and the specifier becomes `../service.ts`, the target directory
is no longer the importer's own, and the import is counted as reaching past
that directory's barrel. The plain `../` repair alone introduced **5 new
`imports` failures that were not in the baseline**.

Switching those specifiers to the parent barrel removed all five. The
barrels already re-export everything the tests need
(`src/client-gateway/index.ts` re-exports `contracts.ts` and `service.ts`;
`src/runtime/index.ts` re-exports all four of its modules;
`src/framework/index.ts` re-exports `storage-layout.ts`):

- `src/client-gateway/tests/service.test.ts` — two specifiers merged into `../index.ts`
- `src/framework/tests/storage-migration.test.ts` — `../storage-layout.ts` merged into the existing `../index.ts` import
- `src/programs/_shared/tests/storage.test.ts` — `../../../framework/storage-layout.ts` to `../../../framework/index.ts`
- `src/runtime/tests/client-gateway-transport.test.ts` — `../client-gateway-transport.ts` to `../index.ts`
- `src/runtime/tests/service.test.ts` — three specifiers merged into `../index.ts`

`src/programs/_shared/` and `src/programs/database-manager/storage/` have
no `index.ts`, so imports reaching into them are not counted by the rule
and were left as plain `../` repairs.

### Configs

- `packages/fluxiq/tsconfig.build.json`: `exclude` changed from
  `["src/**/*.test.ts"]` to `["src/**/tests/**"]`.
- `packages/fluxiq/vitest.quality.config.ts`: the three explicit `include`
  paths updated to `src/programs/tests/index.test.ts`,
  `src/programs/tests/permission-matrix.test.ts`, and
  `src/programs/_shared/tests/storage.test.ts`.

## Commands run and observed results

### Test-file and test-case counts — identical

Measured with vitest's JSON reporter over exactly my 18 files by explicit
path, so the concurrent `automation-studio` worker could not perturb the
numbers.

| | Test files | Test cases | Suites (describe blocks) |
| --- | --- | --- | --- |
| Before the move | 18 | 128 | 37 |
| After the move | 18 | 128 | 37 |
| After the barrel-import fix | 18 | 128 | 37 |

Per-file case counts matched one-for-one in all three runs (10, 7, 12, 3,
6, 2, 3, 1, 3, 1, 8, 7, 30, 6, 2, 4, 9, 14). Nothing silently stopped being
collected.

`vitest.config.ts` sets no `include`, so the main suite uses vitest's
default glob, which is depth-independent and needed no change.

### One pre-existing failure, not caused by this work

`src/programs/_shared/tests/runtime-llm-grants.test.ts` fails one case:
`global runtime LLM execution-grant composition > issues a sanitized build
grant against the exact binding and rejects it after settings drift`.

It failed identically in the **before** run, prior to any edit. Confirmed
independently by restoring the pristine file from `HEAD` at its original
co-located path and running it alone:

```
× global runtime LLM execution-grant composition > issues a sanitized build grant ...
 Test Files  1 failed (1)
      Tests  1 failed (1)
```

The scratch copy was deleted afterwards. Counts therefore read 127 passed /
1 failed of 128 both before and after.

### Quality config

`npx vitest run --config vitest.quality.config.ts`

```
 ✓ src/programs/_shared/tests/storage.test.ts (3 tests)
 ✓ src/programs/tests/permission-matrix.test.ts (2 tests)
 ✓ src/programs/tests/index.test.ts (6 tests)
 Test Files  3 passed (3)
      Tests  11 passed (11)
```

CI invokes it through `pnpm quality:coverage`, which adds `--coverage`, so
that form was run too. Thresholds hold:

```
All files   |   70.03 |    73.68 |   61.76 |   70.03
```

against `statements 65, branches 70, functions 60, lines 65`.

### Typecheck and build

`npx tsc --noEmit` (the package `check` script) — exit 0.

`npx tsc -b tsconfig.build.json` — exit 0, then
`node ../../scripts/rewrite-declaration-imports.mjs dist` — exit 0.

```
dist tests dirs:  0
dist .test.js:    0
dist .test.d.ts:  0
dist .js total:   294
dist .d.ts total: 294
```

All package entrypoints present (`dist/index.js`, `dist/runtime/index.js`,
`dist/client-gateway/index.js`, `dist/programs/index.js`,
`dist/framework/index.js`, `dist/io/index.js`, `dist/engine/index.js`,
`dist/ui/index.js`).

Worth recording for whoever runs this next: the `exclude` change opens a
window. Between my config edit and the `automation-studio` worker landing,
`src/**/tests/**` matched none of that worker's 87 still-co-located tests,
which `src/**/*.test.ts` had been excluding — so an interim build emitted 87
stray `dist/**/*.test.js`, none of them from my subtree. I verified the new
`exclude` was nonetheless correct by temporarily adding
`src/programs/automation-studio/**/*.test.ts` to it and rebuilding, which
produced 0 `tests/` dirs and 0 `.test.js`; that temporary line was then
reverted. The other worker has since landed, and the figures above are from
the real, unmodified config. The window is closed, but the two edits are
only safe together.

### Structure audit

`node scripts/structure-audit.mjs --rule test-placement --json`

Immediately after my move (automation-studio not yet landed):

```json
{ "failures": [], "warnings": [], "suppressed": 9, "lowerable": [] }
```

The 9 suppressed entries were exactly the `automation-studio` directories.
All 11 of my directories disappeared from the findings entirely, which the
brief accepts alongside appearing in `lowerable`. Verified independently
with `git ls-files | grep -E '\.(test|spec)\.(ts|tsx)$' | grep -vE
'/(tests|e2e)/'`, which returned only those 9 directories.

Final run, after that worker landed:

```json
{ "failures": [], "warnings": [], "suppressed": 0, "lowerable": [] }
```

Zero co-located tests remain anywhere in the repository.

`pnpm structure:baseline` was **not** run, per the brief.

## Not verified

- **`pnpm --filter fluxiq test` as a whole suite.** Every run was scoped to
  my 18 files by explicit path. A whole-package run would have mixed in the
  concurrent worker's 87 in-flight files and made the before/after
  comparison meaningless. The package-wide run is the supervisor's to make
  once every worker has landed.
- **`pnpm check`, `pnpm test`, `pnpm build` at the repository root.** Not
  run; other workers were still editing. I ran the package-level
  equivalents (`tsc --noEmit`, `tsc -b tsconfig.build.json`, scoped
  vitest).
- **The `apps/web` half of `pnpm quality:coverage`.** Outside my scope.
- **The pre-existing `runtime-llm-grants` failure is not diagnosed.** I
  established only that it predates this work. Its cause is untouched.
- **Run-to-run stability of the whole set.** One early exploratory run
  reported 2 failed test files rather than 1, with a `Worker exited
  unexpectedly` tinypool error; the three measured runs above each reported
  1. There may be a flaky test or a worker-pool issue in this package,
  independent of the relocation.
- **`npx tsc -b` segfaulted twice (exit 139) against a stale
  `tsconfig.build.tsbuildinfo`** after a `--clean`. Deleting the tsbuildinfo
  cleared it and the build then succeeded. Incremental-state fragility
  rather than a code error, but it may recur after config edits.

## Open questions or contradictions found

1. **The brief's definition of done could not be met by my edits alone.**
   "`pnpm --filter fluxiq build` produces a `dist` with no `tests/` folder
   and no `.test.js`" depends on the `automation-studio` worker landing,
   because my `exclude` change and their move are two halves of one
   transition. It now holds, but the two changes must be committed
   together — committing the config edit without their move reintroduces 87
   stray `.test.js` in `dist`.

2. **One audit failure remains in my area and only the supervisor can clear
   it.** `file-lines` on
   `packages/fluxiq/src/programs/tests/global-services.test.ts`, 945 lines
   against a limit of 800. This is a pure baseline re-key, not growth: the
   baseline froze the identical 945 under the old key
   `packages/fluxiq/src/programs/global-services.test.ts`, and the ratchet
   keys on file path, so the rename reads as a new violation. The planned
   `pnpm structure:baseline` regeneration resolves it. Every moved test file
   across every worker has this property, which is presumably why the plan
   defers the regeneration — worth confirming the supervisor expects a
   non-empty `failures` list until that runs.

3. **The `imports` rule interacts with the tests-relocation decision in a
   way the plan may not have anticipated.** Relocating a test out of its
   subject's directory converts every previously-exempt sibling import into
   a barrel-skip finding. I absorbed this for my five files by using the
   barrels, but it will recur for any directory whose barrel does not
   re-export what its tests need, and there is no barrel-based escape in
   directories that have no `index.ts` at all (`src/programs/_shared/`,
   `src/programs/database-manager/storage/`). Phase 2 onward should expect
   this rather than discover it.

4. **Untracked artifact left by another worker.** `packages/fluxiq/.tmp/`
   contains `automation-studio-project-runtime-stream-store-test/`, a run
   artifact from the `automation-studio` suite. `.gitignore` line 18 lists
   `tmp`, which does not match `.tmp`, so it shows as untracked. Not mine,
   and I did not delete it in case that worker was still running; the
   supervisor should keep it out of the commit and may want the ignore
   pattern widened.
