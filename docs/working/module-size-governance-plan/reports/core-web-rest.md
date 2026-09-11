# Report: core-web-rest

Phase 1 tests relocation outside the Automation Studio feature.

## Outcome

Done.

## What changed and why

38 test files moved into `tests/` subfolders of the directory that owns their
subject, filenames unchanged, via `git mv` (renames are detected as renames in
`git diff -M`). Every relative path specifier inside a moved test was pushed one
level deeper.

| Directory | Files moved |
| --- | --- |
| `apps/web/src/features/programs/tests/` | 14 |
| `apps/web/src/features/programs/live-views/tests/` | 8 |
| `apps/web/src/lib/tests/` | 6 |
| `apps/web/src/app/tests/` | 4 |
| `apps/web/src/app/api/framework/tests/` | 1 |
| `apps/web/src/app/api/auth/login/tests/` | 1 |
| `apps/web/src/app/api/programs/[programId]/[endpoint]/tests/` | 1 |
| `apps/web/src/app/programs/[programId]/tests/` | 1 |
| `apps/web/src/server/tests/` | 1 |
| `packages/client-gateway-websocket/src/tests/` | 1 |

No route directory was renamed or restructured; the two bracketed route segments
(`[programId]`, `[endpoint]`) kept their names and gained a `tests/` child. A
directory under `app/` only becomes a route when it holds `page.*` or `route.*`,
and `route.test.ts` does not match Next.js's `route.{js,jsx,ts,tsx}` convention,
so no new route is introduced.

**Import repair was not limited to `import`/`from`.** Most of these tests read
their subject off disk with `readFileSync(new URL("./subject.tsx",
import.meta.url))`, which resolves relative to the test file and breaks silently
on a move — the file would simply not be found and the test would throw. The
same one-level rule was applied to those URL specifiers, to the `vi.mock()`
specifier in the `[endpoint]` route test, and to the template specifiers
(`./${file}`, `./live-views/${view}.tsx`). 79 specifier rewrites across 38
files. Rule applied: a literal opening `./` becomes `../`, and a leading run of
`../` gains one more level.

Support files stayed put, per the brief:
`apps/web/src/features/programs/css-manifest-test-helper.ts` is not a test file
by the audit's own definition (`/\.(test|spec)\.[cm]?[jt]sx?$/`) and did not
move; the six tests that import it now reach it at `../css-manifest-test-helper`.

`packages/client-gateway-websocket/tsconfig.build.json` `exclude` changed from
`["src/**/*.test.ts"]` to `["src/**/tests/**"]`, so the build skips the folder
rather than a filename pattern.

No subject module was edited. `git diff -M --name-only` over the five owned
subtrees returns exactly 39 paths: the 38 test files and that one tsconfig.
80 insertions, 80 deletions — every changed line is a path specifier.

## Commands run and observed results

Counts were scoped to the owned directories, because two other workers were
editing the same vitest project concurrently.

Before the move:

```
$ pnpm exec vitest run "src/features/programs/" "src/lib/" "src/app/" "src/server/"
 Test Files  37 passed (37)
      Tests  136 passed (136)

$ pnpm --filter @fluxiq/client-gateway-websocket test
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

After the move — identical, and reproduced on three separate runs (exit 0 each):

```
$ pnpm exec vitest run "src/features/programs/" "src/lib/" "src/app/" "src/server/"
 Test Files  37 passed (37)
      Tests  136 passed (136)

$ pnpm --filter @fluxiq/client-gateway-websocket test
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Counts match. 37 + 1 = 38 files, equal to the 38 files moved, so nothing stopped
matching the vitest `include`. `apps/web/vitest.config.ts` uses the default
depth-agnostic include, and the package's own config sets only
`passWithNoTests`, so neither needed a change.

Specifier resolution, checked mechanically before running anything: all 75
static relative specifiers in the 38 moved files resolve to an existing file
(trying bare, `.ts`, `.tsx`, `/index.ts`, `/index.tsx`); 0 unresolved. The 4
template specifiers were checked by hand against their interpolated values —
`app/error.tsx`, `app/domains/[domainId]/error.tsx`,
`app/programs/[programId]/loading.tsx`, `api/framework/setup/route.ts`,
`api/framework/io/route.ts`, `api/framework/io/validate/route.ts`,
`live-views/docs.tsx` all exist.

Build, proving the new `exclude` works:

```
$ pnpm --filter @fluxiq/client-gateway-websocket build   -> exit 0
$ find packages/client-gateway-websocket/dist \( -path "*tests*" -o -name "*.test.*" \)
(no output)
```

`dist` holds only the five source modules and their `.d.ts`/`.map` outputs.
`rootDir: "src"` still resolves because `src/tests` is excluded.

```
$ pnpm --filter @fluxiq/client-gateway-websocket check    -> exit 0
```

Audit, the check the brief named:

```
$ node scripts/structure-audit.mjs --rule test-placement --json
"failures": [], "warnings": [], "suppressed": 9, "lowerable": []
$ node scripts/structure-audit.mjs --rule test-placement
structure-audit: passed (0 warning(s), 9 baselined).
```

My directories did not land in `lowerable`; they disappeared from the rule
entirely, which is the other outcome the brief allows — every one of them went
to zero co-located tests, so the rule emits no finding at all. Confirmed
directly: `find` over the five owned subtrees for `*.test.*`/`*.spec.*` outside
a `tests/` directory returns nothing. Before the move the rule had 70 baselined
directories; 9 remain repository-wide (other workers were landing concurrently,
so that figure is not mine alone).

Typecheck, `apps/web`: **0 errors in my owned paths.** The first run reported 68
errors, all traced to a concurrent worker's in-flight `fluxiq` rebuild — seven
subpath exports (`fluxiq/background-tasks`, `compute-control`,
`database-manager`, `deployment-sync`, `docs`, `identity-access`,
`production-runner`) were momentarily absent from `packages/fluxiq/dist` while
`tsc -b --clean` ran. They reappeared and a re-run dropped to 3 errors, none of
them mine. The errors were in untouched source `.tsx` files, and the specifiers
are bare package specifiers my rewrite never matches.

## Not verified

- **`pnpm check` does not currently pass, and one failure is mine to flag.** The
  `naming` rule reports
  `apps/web/src/features/programs/tests/shared-ui.test.tsx: "shared-ui" names
  nothing`. This is baseline-key churn, not a new defect: the old path
  `apps/web/src/features/programs/shared-ui.test.tsx` is already a baselined
  `naming` key, and the rule is keyed by path, so the rename presents as a new
  key. The file's name and contents are unchanged. **This means the supervisor's
  baseline regeneration is required before `pnpm check` can pass, not
  optional.** I did not run `pnpm structure:baseline`, as instructed.
- No `imports` failures in my scope (verified by key). Neither
  `features/programs/` nor `lib/` has a barrel, so the new `../subject`
  specifiers cannot be barrel-skipping. All 89 `imports` failures in the full
  audit are in other workers' paths.
- I did not run `pnpm check`, `pnpm test`, or `pnpm build` repository-wide, and
  did not run the full `@fluxiq/web` suite unscoped — the brief scoped counts to
  my directories precisely because two workers were mid-flight in the same
  vitest project.
- No browser validation. `apps/web/src/app/` is the App Router and I did not
  run `next build` or load a page to confirm the new `tests/` directories add no
  route. The reasoning above is from the Next.js file convention, not observed.
- The first scoped vitest run ended in a Tinypool `onUnexpectedExit` crash after
  printing a clean `37 passed / 136 passed` summary. Three subsequent runs of the
  same command exited 0 with no crash. I treated it as flaky worker teardown
  under concurrent load and did not chase it further.

## Open questions or contradictions found

- **`apps/web/vitest.quality.config.ts` still points at three of my old paths**
  and will not match them any more. The supervisor owns that file; I did not
  touch it. It needs:
  - `src/lib/login-attempts.test.ts` -> `src/lib/tests/login-attempts.test.ts`
  - `src/lib/program-route.test.ts` -> `src/lib/tests/program-route.test.ts`
  - `src/features/programs/shared-ui.test.tsx` ->
    `src/features/programs/tests/shared-ui.test.tsx`

  Its fourth entry, `src/features/automation-studio/model/project-artifacts.test.ts`,
  belongs to core-web-studio-a. This config uses an explicit `include` list with
  coverage thresholds, so a stale path here fails silently as "no tests matched"
  — exactly the failure mode the shared context warns about.
- **A defect in another worker's output, visible from my typecheck.**
  `apps/web/src/features/automation-studio/live/view-host/tests/composition.test.ts`
  line 16 imports `from "."`, which no longer resolves
  (`error TS2307: Cannot find module '.'`) and cascades into two TS7006 errors.
  It should be `".."` now that the file sits one level deeper. That subtree is
  core-web-studio-a's; I left it alone. These are the only 3 errors remaining in
  the `apps/web` typecheck.
