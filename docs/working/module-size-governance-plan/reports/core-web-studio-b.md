# Worker report — core-web-studio-b

- Brief: `### Brief: core-web-studio-b`, Phase 1 dispatch — 2026-09-10
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Date: 2026-09-10

## Outcome

**Done**, with one finding the supervisor must rule on before regenerating
the baseline (see *Open questions*).

## What changed and why

Phase 1 tests relocation for every `apps/web/src/features/automation-studio/`
subtree except `testing/`, `hierarchy/`, `model/`, `live/`, and the feature
root's own files.

**121 test files** moved via `git mv` into a `tests/` subfolder of their
owning directory, filenames unchanged, across **34 directories**. The brief's
per-directory tally (views 12, graph 9, workspace 9 + overlays 5 / cache 1 /
commands 1 / shell 1, flow-editor 7 + model 2 / commands 1, runtime 7,
problems 6, stores 6, sync 6, inspector 5, recordings 5 + commands 1, state 4
+ model 2 / commands 1, adaptations / instructions / project / settings /
subflows 3 each, bootstrap / cache / clients / development / router / styles 2
each, authoring / parameters / shared 1 each) sums to exactly 121, which is
what I found and moved. The brief's prose summary of "~62" undercounts; the
directory list is correct.

No fixtures, factories, mocks, or support files were moved. No subject module
was edited. Nothing outside my partition was touched:
`apps/web/vitest.quality.config.ts`, `.structure-baseline.json`, and the four
excluded subtrees are untouched by me.

### Import repair

Relative path repair was done by script and then verified line by line
against the original blobs. Of **206 changed hunks across the 121 files, 200
are pure relative-path depth adjustments** (one extra `../`) and **6 are
base-directory re-anchorings** in three files where the path is computed
rather than written as a literal:

- `styles/tests/style-retirement.test.ts` and
  `styles/tests/styles-architecture.test.ts` —
  `const stylesRoot = dirname(fileURLToPath(import.meta.url))` became
  `resolve(dirname(fileURLToPath(import.meta.url)), "..")`, so `stylesRoot`
  still points at `styles/`. The `resolve(stylesRoot, ...)` chains below it
  were deliberately left alone.
- `problems/tests/problems-architecture.test.ts` — it called
  `new URL(name, import.meta.url)` with bare filenames read from
  `readdirSync`, which after the move resolved into `tests/`. Introduced
  `const problemsDirectory = new URL("../.", import.meta.url)` and used it as
  the base in all three places, mirroring the pattern
  `workspace/overlays/overlay-architecture.test.ts` already used.

Four relative-path literals were deliberately **not** rewritten, because they
are assertions about *another file's* source text rather than paths the test
resolves:

- `shared/tests/phase-10f-ownership.test.ts:30` — `specifier?.startsWith("../")`
- `styles/tests/styles-architecture.test.ts:64` — asserts the studio layout
  contains a literal `import "./automation-studio.css"`
- `views/tests/GraphEditorViews.test.ts:308` and `:315` — assert the subject
  source contains literal `import("./FlowGraphCanvas")` /
  `import("../flow-editor/FlowGraphCanvas")` text

One literal in `workspace/overlays/tests/overlay-architecture.test.ts:43`
(`"../../../programs/overlay-environment.ts"`) is resolved against the
`overlayDirectory` constant rather than `import.meta.url`; it was bumped by
the first pass and then reverted, because its base did not move.

No test name, assertion, expectation, or control flow was changed anywhere.

## Commands run and observed results

Counts were scoped to my own directories by passing the 25 top-level
directory paths to vitest, so the other web worker's concurrent moves could
not corrupt the comparison.

**Before the move** (`npx vitest run --passWithNoTests --reporter=basic <my 25 dirs>`
in `apps/web`, against a clean working tree — `git status --porcelain` showed
only the working document modified):

```
 Test Files  3 failed | 118 passed (121)
      Tests  3 failed | 633 passed (636)
```

**After the move and import repair**, same command, same 25 paths:

```
 Test Files  3 failed | 118 passed (121)
      Tests  3 failed | 633 passed (636)
```

Test-file and test-case counts match exactly: **121 files, 636 cases**.

The same three tests fail before and after, for byte-identical reasons (the
`AssertionError` lines from both runs were extracted and compared, and are
equal):

- `graph/.../derivation-job.test.ts > keeps conversion and validation out of the graph runtime render path`
- `views/.../GraphEditorViews.test.ts > keeps active-tab changes behind the Flow editor render boundary`
- `workspace/cache/.../cache.test.ts > debounces workspace writes and stores the latest complete window and view state`

These three were already failing on a clean tree before I touched anything.
They are pre-existing and not caused by this work.

**Typecheck** — `npx tsc --noEmit` in `apps/web`: **exit 0, no output.** This
validates every rewritten specifier including type-only imports, which the
runtime suite does not exercise.

**Structure audit** — `node scripts/structure-audit.mjs --rule test-placement --json`:

```json
{ "failures": [], "warnings": [], "suppressed": 0, "lowerable": [] }
```

and in human form: `structure-audit: passed (0 warning(s), 0 baselined).`

All 34 of my directories **disappeared entirely** from the rule — they are
not "lowerable" because their count went to zero. I confirmed independently
that all 40 baselined `apps/web/src/features/automation-studio/*` keys now
have zero co-located tests, and that `git ls-files` finds **no** remaining
co-located test file anywhere under the feature.

Per the brief I did **not** run `pnpm structure:baseline`.

### Intermediate runs worth recording

- An intermediate run showed 55 files failing to collect with
  `Failed to load url fluxiq/ui` / `fluxiq/automation-studio/nodes`. This was
  **not** my change: another worker was rebuilding `packages/fluxiq/dist` at
  that moment. `packages/fluxiq/dist/ui/index.js` was present again
  afterwards and the re-run was clean. Worth knowing if the supervisor sees
  the same signature.
- An earlier run showed 5 failed files / 6 failed cases; the two extra
  failures were the `problems-architecture` and `overlay-architecture`
  path-base problems described above, both since fixed.

## Not verified

- **`pnpm --filter @fluxiq/web test` in full was not run.** The brief's
  definition of done names it, but the brief also instructs scoping counts to
  my own directories because a second worker is mutating the same vitest
  project concurrently. A full-project run would have mixed their in-flight
  state into my before/after comparison and proved nothing. The supervisor
  should run the full suite once, after every Phase 1 worker has landed.
- The full `scripts/structure-audit.mjs --json` run (all rules) **segfaulted**
  once, exit 139, with other workers writing concurrently. Per-rule runs
  succeeded. I did not chase it; it may not reproduce on a quiet tree, but
  the supervisor should confirm before regenerating baselines.
- No browser or e2e validation. This change is test-file relocation only and
  touches no runtime code.
- `apps/web/vitest.quality.config.ts` references
  `src/features/automation-studio/model/project-artifacts.test.ts`, which is
  the *other* web worker's file. Not mine to update; flagging so it is not
  missed.

## Open questions or contradictions found

**The relocation creates new `imports`-rule violations, and this affects
every Phase 1 worker, not just me.**

The `imports` rule counts imports that reach into another directory's file
rather than its barrel. A test that used to sit beside its subject imported
`./adaptation-model` — same directory, no violation. After moving into
`tests/` it imports `../adaptation-model`, which the rule counts as reaching
into another directory, even though the target is the directory that owns the
test.

Measured in my partition after the move:

- **70 of my 121 files now fail the `imports` rule.**
- **58 of those had no baseline entry at all before** — they were clean.
- **5 had a baseline entry whose count grew** (for example
  `flow-editor/canonical-view-functionality.test.ts`, baselined at 10, now 11).
- 171 barrel-skipping imports are now counted in those files, against 31
  baselined across the subset that previously had an entry.

The shared context offers two repair options — "one extra `../` to reach the
subject, **or** import from the directory barrel." I took the first, because
it is purely mechanical and provably preserves behaviour. The second would
avoid these violations but is a real semantic change: many of these tests
deliberately import internals the barrel does not re-export, so it cannot be
applied blindly, and to be coherent it would have to be applied the same way
across all four Phase 1 partitions.

This is a supervisor decision. Either:

1. regenerate the baseline and let it absorb the new `imports` entries,
   accepting that Phase 1 trades `test-placement` violations for a larger
   `imports` count; or
2. mandate barrel imports for relocated tests, which is a follow-up task
   spanning all four partitions and needs its own validation.

I did not act on either, since the brief scopes my done-condition to
`test-placement` and unchanged counts, and `pnpm structure:baseline` is
explicitly the supervisor's to run.

**Minor:** the brief's prose says "~62 test files" for this partition; the
actual count from its own directory list is 121. The directory list was
correct and is what I used.
