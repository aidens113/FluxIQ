# k6b-variable-markers-and-bindings: rows keep their identity through variables, and bindings read the live map

## Outcome

**Done.** Both defects K6 surfaced are closed, each reproduced red first.

1. **The leak.** `set-variable` deep-copied its input through `jsonValue`, so a
   For Each over extracted records that remembered each row wrote the row's own
   **text** into the saved trace: a copy is no longer the captured row, and CD14's
   markers are found by identity. The variable path now keeps references.
2. **The stale seed.** Parameter bindings resolved variables from
   `options.variables`, the run's seed, so a variable written during the run was
   invisible to a later node's binding. They now resolve against the live run map.

Checks: the K6 acceptance command is **206 passed** (193 before this work);
`pnpm --filter fluxiq check` is clean (no diagnostics); the structure audit's only
two failures are working documents this brief does not own; all five mutations
were observed red on real source and every file restored.

## What changed and why

`AS/` is `packages/fluxiq/src/programs/automation-studio/`.

### `AS/nodes/data/shared.ts`

- **New `keptJsonValue(value)`**: a value as JSON, with identity kept wherever
  nothing needs changing. An array or object already made of JSON comes back as
  the very array or object the node was given; only a part JSON cannot carry is
  copied, and then only the containers above it. `undefined` becomes `null` and a
  function becomes its string, as `jsonValue` does.
  - Why identity: the saved trace stands a captured row in for a `$datasetRow`
    marker **by identity** (`record-summary.ts`, CD14). A deep copy is a different
    object, so the trace kept the row's text where a marker belongs — including a
    column the user excluded from the dataset, which is the leak D12 and CD14
    exist to prevent.
  - What copying defended against — a later node writing into a stored value — no
    built-in node does: each builds its result rather than mutating its input, as
    Filter List already does with the rows it keeps.
- **New `setKeptPathValue(source, path, value)`**: `setPathValue`'s walk, copying
  the objects along the path but keeping the assigned value by reference. The
  framework helper deep-copies what it assigns, which is what a captured row
  cannot survive.

### `AS/nodes/data/set-variable.ts`
- `jsonValue(context.inputs.value)` → `keptJsonValue(context.inputs.value)`. All
  three write modes then keep references: `replace` stores the row or the list
  itself, `append-list` appends the row to a new array whose elements are the
  rows, and `merge-object` merges field values without copying them.

### `AS/nodes/data/map-object.ts`
- `rename` mode uses `setKeptPathValue`, so a renamed row keeps its identity.
  `merge` and `pick` already passed values through by reference (`{ ...source }`
  is shallow and `getPathValue` returns what it found); the new tests pin that.

### `AS/runtime/executor/node-execution.ts`
- The state a node's bindings resolve against takes **`Object.fromEntries(runState.variables)`**
  in place of `options.variables`, in the same position in the spread.
  `runState.variables` is seeded from `options.variables`, so a run that writes no
  variable resolves exactly as before; a run that does now answers with what it
  wrote.

### `AS/runtime/executor/run-state.ts`
- Unchanged. The live map it already owned was all the binding fix needed.

### Tests

- **New `nodes/data/tests/set-variable.test.ts` (6 cases):** the value stored as
  the same object; a whole list stored as the same array; `append-list` appending
  by reference and keeping the rows already in the list; `merge-object` keeping
  each field's value; a value JSON cannot carry normalized without touching what
  the node was given; no value writing `null`.
- **New `nodes/data/tests/map-object.test.ts` (4 cases):** `merge`, `pick`, and
  `rename` each keeping a carried value by reference, and a renamed value JSON
  cannot carry still normalized.
- **`runtime/executor/tests/graph-run.test.ts` (+3 cases),** all on a Flow whose
  For Each body remembers each extracted row in a variable:
  - Get Variable reads the rows back, they are the captured rows by identity, the
    saved trace holds row markers, and the bundle-wide scan finds neither the
    planted row text nor the excluded note;
  - a whole captured list stored in a variable keeps the array's identity, so the
    saved trace holds **one `$dataset` marker** rather than a list of row markers;
  - **the brief's required test:** the body writes the variable, a later node's
    `$state` binding reads it (the seed holds no such variable, so success proves
    the live map answered), the rows it read are markers, and the scan finds no
    planted row value anywhere in the saved trace.

## Commands run and observed results

All commands ran alone, one at a time, from `F:\!FluxIQ` or `packages/fluxiq`.
No suite and no build (this machine's RAM).

1. **Baseline, before any edit** — the K6 acceptance command
   (`pnpm --filter fluxiq exec vitest run src/programs/automation-studio/nodes src/programs/automation-studio/runtime/executor/tests src/programs/automation-studio/runtime/tests/composite-executor.test.ts --no-file-parallelism`):
   `Test Files 17 passed (17)`, `Tests 193 passed (193)` — the brief's stated baseline.

2. **The defects reproduced, before any fix.** The new tests alone:
   `Test Files 3 failed (3)`, `Tests 6 failed | 21 passed (27)`.

   | Failing test | Observed |
   | --- | --- |
   | set-variable · writes the value it was given, the same object | `AssertionError: expected { Object (name, price) } to be { Object (name, price) } // Object.is equality`, `Compared values have no visual difference.` |
   | set-variable · appends the value to a list by reference | same `Object.is` failure |
   | set-variable · merges object fields keeping each field's value | same `Object.is` failure |
   | map-object · keeps a renamed value by reference | same `Object.is` failure |
   | graph-run · keeps each remembered row the same object | `AssertionError: expected { …(2) } to be { …(2) } // Object.is equality` |
   | graph-run · resolves a later node's binding from what the body wrote | `AssertionError: expected 'failed' to be 'succeeded'` — the run failed outright, because the binding found nothing in the seed |

   The first five are the leak: the trace's markers are found by identity, and the
   copies fail that. The sixth is the stale seed.

3. **The acceptance command after the change:** `Test Files 19 passed (19)`,
   `Tests 206 passed (206)`, 12.42 s.

4. **`pnpm --filter fluxiq check`** (`tsc --noEmit`), first run: **9 errors**, of
   which **8 were mine** — `TS18048 'result.outputs' is possibly 'undefined'` (7,
   in the two new node test files) and `TS2375` on my `runCarrying` helper under
   `exactOptionalPropertyTypes`. I fixed all eight in my own files. The ninth,
   `runtime/service/recordings/tests/candidate-definitions.test.ts(402,55): error TS2339`,
   is another worker's file (`k7b`'s area). **Rerun later, as the brief asks:**
   clean — no diagnostics at all, so that worker's error was gone by then too.

5. **`pnpm structure:check`**, before and after the change: `exit=1`,
   `structure-audit: 2 violation(s) across 1 rule(s)`. Both `FAIL`s are
   working documents, neither of them mine and both present **before** I changed
   anything: `docs/working/README.md is out of date`, and
   `docs/working/first-class-data-extraction-plan.md: 1075 lines exceeds the 800-line compaction threshold`
   (1135 lines on the later run, as other workers wrote to it). No `FAIL` names a
   source file. Advisory warnings on my paths: `executor/: 17 source files`
   (pre-existing; I added no file there) and, new from my additions,
   `executor/tests/graph-run.test.ts: 514 lines is past the 400-line advisory threshold`
   — advisory only; the failing threshold is 800.

6. **Mutations, run on real source.** Runner:
   `scratchpad/k6b-mutations.mjs` (session scratchpad, outside the repository).
   For each mutation it asserts the target text occurs exactly once, writes the
   mutation, runs the acceptance command, restores the original bytes in `finally`
   and verifies them.

   | Run | Mutation | Result |
   | --- | --- | --- |
   | Baseline before | none | `206 passed (206)` |
   | M1 | `set-variable` deep-copies its value again | `8 failed \| 198 passed` |
   | M2 | `keptJsonValue` always copies an array | `2 failed \| 204 passed` |
   | M3 | `keptJsonValue` always copies an object | `8 failed \| 193 passed (201)` |
   | M4 | `map-object` deep-copies a renamed value again | `2 failed \| 204 passed` |
   | M5 | bindings read the seed again, not the live map | `1 failed \| 205 passed` |
   | Baseline after | none | `206 passed (206)` |

   **M2 exposed a gap in my own tests.** On the first pass it left all 204 tests
   passing: every identity assertion I had written was about a **row object**, and
   copying the array around the rows does not disturb those. A Flow that stores a
   whole captured list in a variable would therefore have lost its `$dataset`
   marker with no test objecting. I added the two array-identity tests named above,
   after which M2 is red (`2 failed`). The mutation set is the reason that gap was
   found rather than shipped.

7. **Restoration checked afterwards.** A repository-wide search for the mutation
   texts finds none in any file I own: the only `JSON.parse(JSON.stringify` under
   `automation-studio/` is the pre-existing one in
   `storage/project/ui-cache-store.ts:561`, and the only `options.variables ?? {}`
   left are `graph-run.ts:93` (the pre-run binding seed, not my file) and
   `run-state.ts:27` (seeding the live map, which is correct). The
   baseline-after run at 206 passed confirms it independently.

8. **Must-not-touch files.** I issued edits to six paths only: `nodes/data/shared.ts`,
   `nodes/data/set-variable.ts`, `nodes/data/map-object.ts`,
   `runtime/executor/node-execution.ts`, `runtime/executor/tests/graph-run.test.ts`,
   and the two new files under `nodes/data/tests/`. `nodes/contracts.ts`,
   `importer-sdk.ts`, `recordings/**`, `service.ts`, `service/datasets/**`,
   `api/**`, and `executor/graph-run.ts` all appear modified in `git status`, but
   every one of them was **already modified in the working tree before I began**
   (they are in the session's opening `git status` snapshot); they are other
   workers' uncommitted K6/K7/K8/K12d work. The same is true of
   `nodes/data/index.ts` and `nodes/parameter-bindings.ts`, which I own but did
   not need to change. Nothing was committed or pushed.

## Not verified

- **`pnpm check` at the repository root, `pnpm test`, `pnpm build`, and the web
  package's check.** Only the `fluxiq` package's `check` was run (this machine's RAM).
- **Other suites that run Flows through the executor** —
  `runtime/tests/service.test.ts`, `io-policy.test.ts`, `recordings/tests/*`,
  `live-patch.test.ts`. Bindings resolving against the live map is a real
  behaviour change for any Flow that writes a variable and then binds to it; a
  Flow that writes none is unaffected, since the live map starts as the seed.
  Those files were not run here.
- **Real persistence.** Rows reached only a fake `onRecordBatch`; K2's store, a
  real `schemaDigest`, and replacement by `batchKey` were not exercised.
- **The web editor** for these nodes, and any UI consequence of a variable now
  holding a row by reference.
- **Whether withholding's new reach is acceptable in practice** (see below): I
  verified the trace holds no planted row text, not what an operator now sees
  blanked in a large real trace.
- **`pnpm docs:check`** and the generated framework reference (K6 already left it
  stale; nothing here adds a public export).
- No live browser or panel testing (not applicable).

## Open questions or contradictions found

1. **The root cause sits in a file this brief does not own.** `jsonValue` and
   `setPathValue` in `AS/nodes/shared/definition.ts` are what deep-copy; I could
   only add `keptJsonValue` and `setKeptPathValue` beside the data nodes, so
   `setKeptPathValue` duplicates `setPathValue`'s walk. Any other node that copies
   through `jsonValue` has the same defect latent. A brief owning
   `nodes/shared/` should make `jsonValue` identity-preserving and delete the two
   local helpers; that is the real fix and it is one file wide.
2. **Identity cannot protect a row that is taken apart.** Map Object in `pick` or
   `merge` mode that lifts a *field* out of a row — `name`, say — puts that
   string into a new object, and no marker can stand in for it, so the text
   reaches the saved trace. This brief protects a row or list passed through
   whole, which is the accumulate-with-For-Each pattern K6 made likely. Extracting
   a field remains outside CD14's mechanism and may deserve a decision beside it.
3. **Bindings now widen withholding, as K6 predicted.** A binding that resolves to
   a variable holding rows records those rows' scalars as resolution-supplied, so
   they are withheld substring-wide from the saved trace. That is fail-closed and
   consistent with `trace-withholding.ts`'s stated stance ("unknown is withheld"),
   and markers are skipped by identity so they survive it — but it can blank
   unrelated text that merely equals a row value. The K6 report called this "a
   larger decision"; the brief directed the change, so I made it, and flag it here.
4. **`keptJsonValue` has no depth bound,** exactly as `jsonValue` has none: a
   cyclic value would overflow the stack in either. Parity, not a new risk, but
   the executor's other walks (`record-summary`, `trace-withholding`) do bound
   themselves at 64.
5. **M3's run reported 201 tests rather than 206** (`8 failed | 193 passed`), so
   five tests did not run in that mutated state. The mutation was red as required
   and the file was restored and reverified, so I did not chase the shortfall.
6. **`graph-run.test.ts` is now 514 lines,** past the 400-line advisory. It is well
   under the 800-line failure threshold, and the methodology says an oversized test
   file shrinks when its subject is split rather than being cut directly.
