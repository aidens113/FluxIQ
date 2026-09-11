# Report: core-web-studio-a

Phase 1 tests relocation, denser half of the web Automation Studio feature.

## Outcome

Done. All 69 owned test files moved into `tests/` subfolders, imports
repaired, counts verified identical before and after.

One item needs supervisor attention (details below): three `imports`-rule
baseline entries rose as a mechanical consequence of the extra directory
level. A second item, a stale path in `apps/web/vitest.quality.config.ts`,
was already repaired by another party while I worked; I verified it.

## What changed and why

### Files moved (69, all via `git mv`, filenames unchanged)

| Destination | Count |
| --- | --- |
| `apps/web/src/features/automation-studio/tests/` | 7 |
| `apps/web/src/features/automation-studio/testing/tests/` | 16 |
| `apps/web/src/features/automation-studio/hierarchy/tests/` | 15 |
| `apps/web/src/features/automation-studio/model/tests/` | 14 |
| `apps/web/src/features/automation-studio/live/tests/` | 13 |
| `apps/web/src/features/automation-studio/live/view-host/tests/` | 4 |

`testing/` kept every fixture in place — `empty-project-fixture.ts`,
`large-project-fixture.ts`, `medium-project-fixture.ts`,
`scale-project-fixture.ts`, `small-project-fixture.ts`,
`phase11-deterministic-fixture.ts`, `performance-certification.ts`,
`phase8-certification.ts`, `resource-telemetry.ts`,
`synchronous-interaction-trace.ts` — only its ten `*.test.ts` moved. The
feature root likewise kept `architecture-test-helpers.ts`, which is test
support that ships in `src` and is imported by the moved contract test.

Zero co-located test files remain in any of the six owned directories
(verified by directory listing, not by inference).

### Import repair

66 of the 69 files needed rewriting; the other three
(`testing/tests/phase8-browser-suite-contract.test.ts`,
`phase8-fixture-integrity-contract.test.ts`,
`phase8-playwright-config.test.ts`) resolve everything through
`process.cwd()` and were correct unchanged.

Every relative specifier gained one level: `./x` became `../x`, `../x`
became `../../x`. This had to cover more than `import` statements, because
this feature's contract tests read their subjects off disk:

- `from`, bare `import`, dynamic `import()`, and `require()` specifiers.
- `new URL("…", import.meta.url)` arguments — used by roughly 20 of these
  tests to `readFileSync`/`existsSync` their subject's source text. These
  are as location-dependent as an import and break silently if missed.
- String tables and helper arguments that are later fed into
  `new URL(…, import.meta.url)`. Five files do this indirectly, so in those
  I bumped every leading-relative literal:
  `live/tests/automation-studio-live-ownership.test.ts` (41 `read(…)`
  paths), `live/tests/domain-commands.test.ts`,
  `tests/proposal-retirement.test.ts`,
  `testing/tests/phase11-shell-connector-source-contract.test.ts`,
  `testing/tests/render-boundary-source-contract.test.ts`.

Three relative literals were deliberately left alone because they are not
resolved against the test file, and bumping them would have broken working
tests:

- `tests/architecture-contract.test.ts` lines 586-589 —
  `resolve(automationStudioFeaturePath, "../../app/…")`. The anchor is
  `architecture-test-helpers.ts`, which did not move.
- `tests/phase-10f.test.ts` line 46 — `expect(clientView).not.toContain("../views/")`
  is an assertion about another file's text.
- `testing/tests/phase8-playwright-config.test.ts` line 8 —
  `resolve(process.cwd(), "../../docs/…")`.

One import form the mechanical pass missed and I caught from a failing run:
`live/view-host/tests/composition.test.ts` imported its own directory
barrel as `from "."`, which after the move resolved to the new `tests/`
directory and threw `EISDIR: illegal operation on a directory, read .`. It
is now `from ".."`. That single miss cost 9 test cases, which is exactly the
kind of silent shortfall the count check exists to catch — the file-level
failure would otherwise have read as "one flaky suite".

### Three assertions that encode directory layout

These are the only changes beyond specifiers. Each was forced by the
relocation; none weakens what the test proves.

1. `tests/architecture-contract.test.ts`, `approvedTopLevelDirectories`:
   added `"tests"`. The test asserts the feature's top-level directory
   listing equals this list exactly, and the move creates a top-level
   `tests/`. Without this the taxonomy test fails.

2. `tests/architecture-contract.test.ts`, "keeps CSS ownership executable
   through the import manifest gate": it asserted
   `existsSync(featurePath("styles/styles-architecture.test.ts"))`.
   `styles/` belongs to core-web-studio-b, which is moving that file to
   `styles/tests/`. It now resolves the first of
   `styles/tests/styles-architecture.test.ts` or
   `styles/styles-architecture.test.ts` that exists, and asserts one was
   found.

3. `testing/tests/data-intensive-view-coverage.test.ts`, "requires every
   recorded evidence path to resolve to an executable test": this file
   hard-codes about 30 paths to test files in core-web-studio-b's subtrees
   (`clients/`, `recordings/`, `flow-editor/`, `router/`, `subflows/`,
   `instructions/`, `adaptations/`, `state/`, `runtime/`, `problems/`,
   `settings/`, `inspector/`). Each is resolved with `existsSync`. It now
   falls back to the `tests/` sibling of a declared path when the declared
   path is absent.

**This is a deliberate deviation from "change nothing inside a test but its
import specifiers", and the supervisor should confirm it.** The reason: the
coupling crosses the partition boundary. The literals live in files I own;
the files they name are being moved by the other worker, concurrently, and
neither of us may edit the other's files. Pointing the literals directly at
the post-move paths would have made my own verification fail until the other
worker landed, so I could not have observed matching counts. The
location-tolerant form is green in both states and still enforces the actual
invariant — that the named evidence test exists and contains an `it(`/`test(`
call. If the supervisor prefers the literals hard-coded to the post-move
paths, that is a one-line-each change once both workers have landed.

## Commands run and observed results

All test runs scoped to my own directories, per the brief, because two other
workers were mutating the same working tree throughout.

**Before the move** (`npx vitest run` from `apps/web`, filters for the 7 root
test files plus `testing/`, `hierarchy/`, `model/`, `live/`):

```text
 Test Files  2 failed | 67 passed (69)
      Tests  2 failed | 369 passed (371)
```

**After the move** (same run, filters `tests/`, `testing/`, `hierarchy/`,
`model/`, `live/`):

```text
 Test Files  2 failed | 67 passed (69)
      Tests  2 failed | 369 passed (371)
```

File count and test-case count both match exactly: 69 files, 371 cases.

The two failures are pre-existing and identical before and after. I observed
them on a clean tree before touching anything (`git status` showed only the
working document modified). They are not mine and I did not fix them:

- `hierarchy/tests/phase7-contracts.test.ts > Phase 7 hierarchy routing
  contracts > activates Router before reconciling the Flow selection` —
  `expected "spy" to be called with [ 'flow-router', 'preview' ]`, received
  `[ 'flow-router::object::flow.checkout', 'preview' ]`.
- `testing/tests/synchronous-interaction-trace.test.ts > Automation Studio
  synchronous interaction tracing > keeps hierarchy publication out of the
  synchronous visible-view gesture` — expected `activeViewId: 'flow-router'`,
  received `'flow-router::object::flow.empty'`.

Both look like the same underlying drift: a scoped view id
(`viewId::object::<entity>`) now reaches a call site that still expects the
bare `flow-router`. Worth a look, but out of scope here.

**Typecheck**, `npx tsc --noEmit` from `apps/web`:

```text
(no output — 0 errors, whole app)
```

**Structure audit**, `node scripts/structure-audit.mjs --rule test-placement --json`:

```json
{
  "failures": [],
  "warnings": [],
  "suppressed": 9,
  "lowerable": []
}
```

`failures` is empty. All six of my directories disappeared entirely rather
than appearing in `lowerable`: the rule emits one finding per directory that
still co-locates tests, so a directory at zero produces no finding and has no
entry left to lower. Only nine directories repo-wide still co-locate tests,
none of them mine. I did not run `pnpm structure:baseline`.

**Two runs had to be discarded** before the numbers above. Between 18:01 and
18:04 the `core-fluxiq-core` worker was rebuilding `packages/fluxiq/dist`
(294 files rewritten inside one 60-second window), and my runs failed with
`Failed to load url fluxiq/ui` and `fluxiq/automation-studio` in 41-42 files;
one run segfaulted outright. Those are not defects in this work. I waited
until no file under `packages/fluxiq/dist` had changed for 45 seconds and
re-ran; the final run has zero load errors.

## Not verified

- **The full `pnpm --filter @fluxiq/web test` suite.** I ran only my own
  directories, as the brief directed, because the other two workers were
  moving files in the same tree. The whole-suite count comparison is the
  supervisor's to make once every worker has landed.
- **`pnpm check` / the full structure audit as a pass-fail gate.** The full
  audit currently reports 92 `imports` failures repo-wide, but the tree
  contains three workers' in-flight state, so the number is not attributable
  and will change. See the `imports` note below for the part that is mine.
- **Live browser behaviour.** Not applicable — no runtime code changed, only
  test file locations and their own specifiers.
- **That the other worker will in fact create `styles/tests/` and the
  `tests/` siblings** my two tolerant lookups fall back to. They are correct
  either way, but the intended end state is unconfirmed from here.
- **The two pre-existing failures**: I confirmed they predate my change and
  are unchanged by it; I did not diagnose or fix them.

## Open questions or contradictions found

**1. `apps/web/vitest.quality.config.ts` was stale and has since been fixed
by someone else — no action needed, but the supervisor should know it
happened.** The move made line 10 of that file point at
`src/features/automation-studio/model/project-artifacts.test.ts`, which no
longer exists. The brief reserves the file for the supervisor, so I did not
touch it. By the time I finished, another party had already rewritten all
four `include` entries to their `tests/` locations, mine among them. I
verified the result rather than assuming it:

```text
 Test Files  4 passed (4)
      Tests  36 passed (36)
```

Worth noting for the ledger because the package script uses
`--passWithNoTests` and this `include` lists explicit paths, so a stale entry
here drops a suite silently instead of erroring — the exact failure mode the
shared context warns about, and it would have gone unnoticed.

**2. Three `imports`-rule baseline entries rose, and it is unavoidable
without editing subject modules.** Sixteen of my files appear as `imports`
failures under their new paths. Thirteen are pure key renames carrying the
identical value — the baseline regeneration absorbs them unchanged. Three
genuinely increased:

| File (new path) | Baselined | Now |
| --- | --- | --- |
| `live/view-host/tests/direct-view-connector.test.ts` | 4 | 7 |
| `live/view-host/tests/phase3-mounted-render-stability.test.tsx` | 4 | 5 |
| `live/view-host/tests/phase3-render-stability.test.ts` | 2 | 3 |

The cause is structural: an import of a sibling inside `view-host/` was
`./direct-view-connector`, a same-directory import the rule does not count.
From `view-host/tests/` the same import is `../direct-view-connector`, which
the rule counts as skipping `view-host/`'s barrel. The modules imported are
unchanged; only the depth is.

The shared context offers importing from the directory barrel as the
alternative, and it only partly works here. `view-host/index.ts` re-exports
`composition.ts`, `contracts.ts`, and `direct-view-connector.ts`, but not
`canonical-connected-views.tsx` or `connected-view-entries.tsx`, which is
what these three tests need. Routing through the barrel would take
`direct-view-connector.test.ts` from 7 to 5 — still above its recorded 4 —
and would do nothing for the other two. Closing the gap would mean adding
exports to `view-host/index.ts` purely to satisfy tests, which the shared
context forbids. I left the `../` form, which is the brief's primary
instruction, and flag the three increases so the baseline regeneration
records them knowingly rather than silently.

No brand-new offenders: every one of the sixteen maps to a file that was
already baselined under this rule before the move.

**3. Cross-partition path coupling is a general hazard of Phase 1, not a
one-off.** Two of my files name test files in another worker's subtrees by
literal path (item 3 under "three assertions", and the `styles/` gate). Other
such couplings may exist in the halves I do not own, pointing back at mine.
Worth a repo-wide grep for string literals ending in `.test.ts`/`.test.tsx`
before declaring Phase 1 complete.
