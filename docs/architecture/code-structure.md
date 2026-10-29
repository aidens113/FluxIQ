# Code Structure

How source files are placed, named, sized, and divided in this repository.
`AGENTS.md` carries the binding summary; this document is the full
methodology. Size and density budgets are enforced by
`scripts/structure-audit.mjs` as the first step of `pnpm check`, and before
every push: `.githooks/pre-push` runs the audit and refuses a push it fails
(t682), because a commit made straight on `dev` -- a ledger entry, a working
document -- has no merge step to run it. `pnpm install` points git at
`.githooks` (the root `prepare` script; a no-op outside a git checkout).

## The Gap This Closes

[Global program layout](./program-layout.md) defines the layers inside a
program — `api/`, `model/`, `runtime/`, `storage/`, `ui/` — and nothing below
them. That works while each layer fits in a handful of files. Automation
Studio outgrew it: `storage/` reached 72 files and `runtime/` 66, with a
12,482-line `service.ts` beside them. Both symptoms have one cause. Code
extracted from a large file had no deterministic destination, so it was
dropped next to the file it came from.

The rules below add the two levels program-layout leaves undefined — feature
and kind — and make placement a procedure rather than a judgement.

## Placement Is A Decision Procedure

Every source file answers four questions, in order. The answers are its path.

```text
<ownership> / <layer> / <feature> / <kind> / <file>
```

### 1. Ownership — which tree

| The code is | It lives in |
| --- | --- |
| Domain-neutral framework capability any program or importer may use: primitives, IO, flows, engine, runtime kernel, UI theme, domain and component registries, client gateway, API contracts | `packages/fluxiq/src/<area>/` — the areas listed in [architecture README](./README.md) |
| Program-flavoured code used by two or more global programs: program API helpers, authorization, catalog, shared storage helpers | `packages/fluxiq/src/programs/_shared/` |
| Code for exactly one global program | `packages/fluxiq/src/programs/<program-id>/` |
| Web UI for one feature of the panel | `apps/web/src/features/<feature>/` |
| Next.js routes, API route handlers, the global shell that composes routes (`AuthShell`, `ProgramLauncher`, `ProgramWorkspace`, `GlobalClientGatewayPairing`, `RouteErrorSurface`), and global stylesheets | `apps/web/src/app/` — nothing feature-specific; feature logic lives under `features/`. A `tests/` folder here is safe: Next.js routes only folders containing a `page` or `route` file. |
| Domain-specific behaviour | Not in this repository. See Repository Boundary in `AGENTS.md`. |

The test for ownership: *if this program were deleted, would the file still
have a consumer?* If yes, it is not program-owned. Promote a file to
`_shared` or a global area only when a second consumer actually exists. Do
not generalize ahead of a real second use.

### 2. Layer — which responsibility inside a program

| Layer | Owns | Must not own |
| --- | --- | --- |
| `api/` | Endpoint names, request/response contracts, handler registration | Business logic, persistence |
| `model/` | Document types, validation, fixtures, pure transforms over documents | IO, side effects |
| `runtime/` | Services, executors, orchestration, adapters, providers | Storage formats, UI state |
| `storage/` | Repositories, stores, schema, migrations, indexes | Orchestration, UI |
| `ui/` | View-state DTOs and navigation metadata | React components — those are `apps/web` |

A program may add a capability area beside the layers when it is a genuinely
separate capability with its own public subpath or contract. Automation
Studio's `nodes/`, `dsl/`, and `fingerprinting/` are examples. Add one only
with real ownership, never as a place for files that fit nowhere else.

### 3. Feature — the noun inside a layer

**A shared filename prefix is a directory.** When three or more files in one
directory share a leading `noun-` prefix, create `noun/` and strip the prefix
from their names. The file that carried the bare prefix keeps its full name
inside the new directory.

```text
storage/project-hierarchy-feed.ts           storage/project/hierarchy/feed.ts
storage/project-hierarchy-mutations.ts   →  storage/project/hierarchy/mutations.ts
storage/project-hierarchy-repository.ts     storage/project/hierarchy/repository.ts
storage/project-schema.ts                   storage/project/schema.ts
```

Apply the rule to the most common prefix first, then repeat inside the new
directory. `project-*` (26 files) becomes `project/`; inside it,
`hierarchy-*` (3 files) becomes `project/hierarchy/`.

Two files with a shared prefix stay flat. Three is the threshold because it
is the point at which a directory pays for its own barrel.

The rule is safe because it invents nothing. The prefixes are groupings the
authors already chose and wrote into filenames because no folder existed to
hold them. The rule promotes intent already expressed.

### 4. Kind — only when a feature is still crowded

If a directory still exceeds 25 files after the feature split, group by kind.
Feature first, kind second; never kind alone.

- **Framework packages:** a shared suffix declares kind. `*-store` →
  `stores/`, `*-repository` → `repositories/`, `*-migration` →
  `migrations/`.
- **Web features:** the filename case already declares kind.
  `PascalCase.tsx` → `components/`; `useX.ts` → `hooks/`; and the existing
  `commands/`, `stores/`, `model/`, `views/`, `overlays/`, `shell/` for what
  they name.

A `components/` folder holding forty components is the original problem
re-created one level down. If a kind folder exceeds the cap, the feature it
sits in needs splitting, not the kind folder.

### Depth

Ownership, program, layer, feature, kind, file:
`packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/repository.ts`
is seven path segments. Cap source files at eight segments from the
repository root. A ninth means a layer or feature was assigned wrongly. A
test sits one segment deeper than its subject and is not counted. The one
exemption is `apps/web/src/app/`, where the Next.js file-system router
dictates depth; it is listed in the audit's `depthExemptPrefixes`.

## Tests

Every directory that contains source files owns a `tests/` subdirectory, and
the tests for those files live there. Tests are never loose beside the
source, and there is no separate mirrored tree.

```text
storage/project/hierarchy/
  index.ts  feed.ts  mutations.ts  repository.ts
  tests/
    feed.test.ts  mutations.test.ts  repository.test.ts
```

- The test for `<dir>/<name>.ts` is `<dir>/tests/<name>.test.ts`. Same
  name, one directory down. A test is always one step from its subject.
- A test with more than one subject lives in the `tests/` folder of the
  nearest directory that contains all of them. A test spanning `storage/`
  and `runtime/` lives in `automation-studio/tests/`.
- Test-only helpers — fixtures, builders, fakes — live in the `tests/`
  folder of the nearest directory that contains everything they serve, as
  non-`.test` files. The `.test.ts` suffix is what marks a test; the folder
  may hold support alongside.
- **Test support that ships is source, not a test.** Anything exported from a
  public subpath or imported by non-test code stays in `src/<area>/testing/`.
  `programs/automation-studio/testing/` and `client-gateway/testing/` are
  this kind: both are re-exported from public barrels.
- A `tests/` folder is a directory, so it does not count toward its parent's
  25-file cap. It carries the cap itself, and that holds automatically: a
  directory with at most 25 source files has at most 25 one-to-one tests.
- A `tests/` folder has no barrel and is never imported by source.

Configuration this requires:

| Package | Change |
| --- | --- |
| `packages/fluxiq`, `packages/client-gateway-websocket` | `tsconfig.build.json` `exclude` becomes `["src/**/tests/**"]` in place of `["src/**/*.test.ts"]`, so support files inside `tests/` folders are not compiled into `dist`. No `tsconfig.json` change: tests remain under `src/**`, which `pnpm check` already includes. |
| `apps/web` | None. It is not a published package. |
| All | Vitest's default include already matches `**/*.test.ts` at any depth. `vitest.quality.config.ts` files list explicit test paths and must be updated when those files move. |

### Test groups

`packages/fluxiq` runs its tests in two groups, one after the other. A test
file that opens a real SQLite database has this line in its leading comment
block:

```ts
// @fluxiq-test-group real-sql
```

Every such file runs in the `real-sql` group, after the rest, with two workers.
Every other file runs in the `parallel` group at full concurrency. A real-SQLite
test spends its time in hundreds of sequential driver round trips; beside
fourteen hundred files collecting the framework at full concurrency it ran 8 to
15 times slower than alone, and every daily sweep in October 2026 timed out a
different handful of them at 15 s. Isolating them is the fix; never raise their
timeout.

- The marker in the file is the only membership rule; there is no list.
  `packages/fluxiq/tests/test-groups.ts` finds the marked files and gives each
  group its vitest options.
- The setup file `packages/fluxiq/tests/real-sql-guard.ts` runs before every
  test file and fails a file that opened a real database (any
  `new sqlite3.Database(...)`, `:memory:` included) without the marker, naming
  the line to add. It does not see databases opened in another process.
- `pnpm test` runs the package script
  `node ../../scripts/vitest-groups.mjs --groups=parallel,real-sql`, which runs
  `vitest run` once per group with `FLUXIQ_TEST_GROUP` set, forwards any further
  arguments (`pnpm test -- <path>`), always runs both groups, and fails if either
  failed.
- A plain `pnpm exec vitest run <path>` sets no group and runs whatever it
  names, marked or not. Running the whole package that way puts both groups
  side by side again and brings the starvation back; use `pnpm test`.

## Files

- **One exported thing per file:** one class, one component, one hook, or one
  cohesive function group. Types used only by that thing live beside it;
  types shared across a directory live in its `types.ts`.
- **The filename is the thing's name.** `kebab-case.ts` for modules,
  `PascalCase.tsx` for components, `useName.ts` for hooks. A file named
  `utils`, `helpers`, `misc`, `common`, or `shared-ui` has no name; give it
  one or split it.
- **Every directory has an `index.ts` barrel** re-exporting its public
  surface. Imports target the directory, not a file inside it. This is what
  makes moving a file invisible to its consumers, and it is why the feature
  rule can be applied mechanically.
- **The public surface is the layer barrel.** `automation-studio/index.ts`
  re-exports `./storage/index.ts`, `./runtime/index.ts`, and so on
  wholesale, and those layers are not public subpaths. Reorganizing inside a
  layer changes nothing for consumers as long as the layer's `index.ts`
  keeps exporting the same names. Check that invariant, not the file tree.
- **800 lines per file, 25 files per directory, 40 methods per class.** The
  first two fail `pnpm check`; the third warns. Existing violations are frozen
  in `.structure-baseline.json` and may only shrink. A line holds one
  statement, so the line budget cannot be met by packing (see
  [Anti-Patterns](#anti-patterns)).

## Dividing A File That Has Outgrown Its Place

Diagnose why it grew before cutting. Each cause has a different correct cut.

| Cause | Symptom | Cut |
| --- | --- | --- |
| God class | One class, very many methods | Facade over collaborators grouped by method-name prefix; public surface unchanged |
| Giant function bodies | Few exports, many lines | Extract named steps into sibling modules; the export becomes a sequence of named calls |
| Declaration dump | Very many `type` or `const` exports | Split by domain noun into a directory with a barrel; zero consumer change |
| Multi-component module | Many components in one file | One component per file under `components/`, plus a barrel |
| Monolithic stylesheet | Thousands of lines of CSS | Split by section into a numbered directory, as `features/automation-studio/styles/` already does |
| Oversized test file | Mirrors an oversized subject | Do nothing to it directly; it shrinks when its subject is split |

The detailed procedure for each, with the current offenders, is in the
[module size governance plan](../working/module-size-governance-plan.md).

## Anti-Patterns

- **Extract-and-drop.** Pulling code out of a large file and placing the new
  file beside it. Every extraction lands where the placement procedure puts
  it. This single habit produced a 66-file `runtime/` next to a 12,482-line
  `service.ts`.
- **Catch-all names.** `utils.ts`, `helpers.ts`, `misc/`, `common/`,
  `shared-ui.tsx`. If it cannot be named, it is not one thing.
- **Pre-emptive sharing.** Moving code to `_shared` or a global area with one
  consumer, on the theory that a second will appear.
- **Barrel-skipping imports.** `from "../storage/project/hierarchy/feed.ts"`
  couples the importer to a file location. Import from `../storage`.
- **Test files loose in a source directory.** They double its file count and
  mix two kinds of file; `storage/` was 37 source files and 35 tests in one
  folder. Tests go in the directory's `tests/` subfolder.
- **Raising a baseline entry.** The baseline is a ratchet. If a baselined
  file must grow, split it instead. The one way an entry is added is
  `pnpm structure:baseline --adopt <rule>`, which records a new rule's
  existing violations once, and is refused for a rule that already has
  entries.
- **Spreading properties into a contract value.** `{ selector, ...(label ? {
  label } : {}) }` compiles clean forever: TypeScript's excess-property check
  runs on the keys a literal writes out, never on the keys a spread brings in,
  so a renamed or deleted contract field silently stops arriving. Write every
  field by name. Spreading a *named* value of the same type
  (`{ ...snapshot, one: change }`) is copy-with-override and stays checked;
  spreading a conditional, a call, or an inline literal is not. The
  `contract-spread` rule enforces this in the paths a repository lists under
  `contractSpreadPaths`, which is how a rule this local stays off the 1,400
  ordinary spreads elsewhere.
- **Turning a caught failure into an empty answer.** `.catch(() => [])` or
  `catch { return null; }` hands the caller an answer that looks exactly like
  a real one: "there are no sessions" and "the session index could not be
  read" both become `[]`, and the caller acts on the wrong one -- a second
  run admitted beside an active one, a Flow listing that comes back empty.
  Let the error propagate, fail closed with an error that says what could
  not be read, or name the one failure that really means absent and rethrow
  the rest: `catch (error) { if (isMissingFile(error)) return []; throw error; }`.
  The `failure-as-empty` rule enforces this in all non-test source, with
  existing instances baselined per file.
- **Silently dropping a failure.**
  `await cache.purge(id).catch(() => undefined)` and an empty `catch {}`
  turn a failed write or side effect into apparent success: nothing fails,
  nothing is logged, and the next reader acts on state that was never
  written. Report the error
  (`.catch((error) => log.warn("cache purge failed", error))`), name the one
  expected failure and rethrow the rest, or let it propagate. Waiting for a
  held promise that someone else awaits
  (`await previous.catch(() => undefined)`) drops nothing. Where losing the
  failure really is acceptable, say why inside the handler or the catch
  block with `/* best-effort: <reason> */`; the reason needs three words or
  more, and the same comment anywhere else does not count. The `swallowed-failure`
  rule enforces this in all non-test source, with existing instances
  baselined per file.
- **Casting `as never`.** `never` is assignable to every type, so
  `stub as never` compiles wherever it is written and switches off the one
  check that would notice the stub no longer fits. In October 2026 seven
  re-author tests stayed broken for a day because their build stubs were cast
  `as never` and a change to the proposal shape compiled clean. Write a typed
  stub (`const port: Port = { ... }`), check a literal with `satisfies T`, or
  use a helper that returns the real type
  (`stubPort(overrides: Partial<Port> = {}): Port`). A `never` annotation or
  return type is checked and stays fine. The `as-never` rule enforces this in
  source and tests alike, reading the syntax tree so a comment or string does
  not count, with existing casts baselined per file.
- **A regex escape a string swallows.** ``new RegExp(`\b${word}\b`)`` hands the
  regex a backspace, not a word boundary, and `\d`, `\s`, `\w`, `\.` reach it
  as plain characters; in October 2026 two Core tests never ran their check
  this way. Double the backslash (`\\b`) or use `String.raw`. The
  `regexp-template-escapes` rule fails such an escape in a `RegExp(...)`
  pattern literal, in source and tests alike, with no baseline.
- **Packing statements onto one line.** The line budget counts lines, so
  `let a: X | undefined; if (cond) doThing({ a });` or two imports on one line
  keep a file under it without making the file any smaller. On 2026-10-09
  this kept both Core's baselined `runtime/service.ts` and a downstream test
  runner inside their budgets. Write one statement per line; if that takes
  the file past its budget, split the file by the reason it grew. The
  `statement-packing` rule enforces this in source and tests alike: it reads
  the syntax tree and fails a line on which one statement ends and the next
  in the same statement list begins. A `for (;;)` header, a `;` inside a
  string, template, regular expression or comment, type-literal and
  interface members, and a one-line body holding a single statement
  (`() => { run(); }`) do not count. Existing packed lines are baselined per
  file and may only shrink.
- **An import cycle.** Two modules that reach each other at load time, even
  through barrels, can hand each other `undefined` depending on which loads
  first: in October 2026 a re-export through a barrel broke six tests in four
  files, and a handle check could have accepted any handle in one load order.
  Import a value from the module that defines it, not from a barrel that leads
  back to you. The `import-cycles` rule counts imports that survive
  compilation (not `import type`, `export type` or dynamic `import()`),
  baselines today's cycles per module, and fails a module that joins a cycle,
  a new import that leads back, or two cycles merging, printing the shortest
  loop. The barrel rule does not insist on a barrel whose own imports lead
  back to the importer.
- **Reaching Node from a module a browser loads.** A `node:crypto` import
  type-checks; what fails is loading it in the browser, so no type check
  sees it. On 2026-09-30 a `runtime/parking/` module imported `node:crypto`,
  the web extension's bundle reached it through `automation-studio/nodes`,
  and only a live Lab run noticed. The `browser-imports` rule walks the
  value-import graph from `browserBundles.entries` (where downstream browser
  bundles enter this repository) and fails on any Node built-in, any
  third-party package not declared in `browserBundles.browserPackages`, and
  any import it cannot follow. It is never baselined. The web extension's
  `pnpm check` fails when its bundle enters Core through a module missing
  from those entries, so the list follows the real bundle.

- **Naming a capability outside the files allowed to hold it.** Some
  references are a capability, not a style: a model provider's host, its SDK,
  the environment variable holding its key. Written anywhere, they type-check
  and build clean, and only a live run finds them. The `restricted-references`
  rule reads every module specifier, string and template piece, and property
  name read (`process.env.KEY`, `env["KEY"]`, a destructured key) in every
  script file, tests included, plus every dependency key of every
  package.json, and fails any that matches an entry under
  `restrictedReferences` outside that entry's `allow` list. It is never
  baselined. The list is empty in Core, which owns provider calls; the web
  extension lists provider hosts, SDKs and key names and allows only its Lab's
  key-handling files.
- **Loading a package past its exports.** A package's `exports` is its public
  surface; a load of anything else depends on its private layout, and the
  first sign of a moved file is a run that fails to load it. In October 2026
  the web extension's test runner loaded half a dozen Core modules by
  addresses built beside Core's entry, and no check saw it. The
  `package-exports` rule holds, counted per file and ratcheted: any load of a
  package linked from outside the repository by a path its exports do not
  name; a module address computed beside a linked package's entry
  (`new URL(<path>, import.meta.resolve("<package>"))`); a load of another
  workspace package's build output (`dist/` or any directory its build
  writes); a `<package>/<subpath>` its exports do not name; and a load of a
  sibling workspace package's `src/` that tsc does not check. A static
  `import`/`export ... from` of a sibling workspace package's TypeScript
  source, from a file a tsconfig takes in, is not held: tsc checks it. Only
  import and load expressions are read, so tooling that names a build path
  without loading it passes. The remedy is the package's: export what
  consumers need, then import it by name.
- **Letting model guidance reach recorded traces.** A recorded trace holds
  what one site showed during one build; once it can flow into the text a
  model reads, guidance can start describing a test site and a Lab pass stops
  meaning the product generalises. An `importBoundaries` entry bans only
  direct imports. The `module-reach` rule reads each repository's
  `reachBoundaries` (`{ name, from, to, reason, remedy }`, path prefixes) and
  follows every chain of value imports from each non-test script under
  `from`, binding by binding through barrels; one that reaches a module under
  `to` fails with the shortest chain, never baselined. A `from` entry naming
  no audited script fails too, so a renamed directory cannot empty the list.
  Both repositories configure "trace-free model guidance": the prompt, tool,
  catalogue and script-format modules may not reach the trace, trace-matcher,
  gateway-trace and offline-trial modules (downstream: the offline-reads,
  snapshot-page and offline-trial-experiment modules).

## Worked Example — `automation-studio/storage/`

Before: 72 files flat (37 source, 35 tests).

After the tests move and the feature rule, with no kind split needed:

```text
storage/                      13 source files + project/
  index.ts  contracts.ts  ids.ts  paging.ts  query-plan.ts
  catalog.ts  catalog-index-migration.ts  file-store.ts
  memory-repository.ts  object-store.ts  sqlite-repository.ts
  state-index.ts  schema-migrations.ts  recording-index-store.ts
  project/                    23 source files + hierarchy/
    index.ts  schema.ts  database.ts  unit-of-work.ts  administration.ts
    adaptation-store.ts  compiled-plan-store.ts  graph-store.ts ...
    hierarchy/
      index.ts  feed.ts  mutations.ts  repository.ts
      tests/
  (storage/ and project/ each own a tests/ folder for their own files)
```

`storage/index.ts` exports exactly what it exported before. No importer
changes.

## Worked Example — `features/automation-studio/live/`

Before: 49 files flat (43 source, 17 tests). Of the source, 19 are `use*`
hooks, 7 are PascalCase components, 4 end in `-commands`.

After the tests move and the kind rule:

```text
live/                         6 source files + four directories
  active-workspace-selection.ts  command-scope.ts  flow-editor-view-recovery.ts
  session-project-view.ts  view-state-references.ts  workspace-view-registration.ts
  components/                 7
  hooks/                      20   (including use-gateway-recording-bridge, renamed useGatewayRecordingBridge)
  commands/                   4    domain-commands, recording-domain-commands, ...
  view-host/                  existing
  tests/                      tests for the six loose files; each subfolder owns its own tests/
```

## `pnpm check` never reads a stale library build

`tsconfig.base.json` `paths` map only some `fluxiq` subpaths to source; the
rest (`fluxiq/identity-access`, `fluxiq/auth`, ...) resolve through
`package.json` `exports` to `dist`. So `pnpm check` runs the three library
build steps (`contracts:build fluxiq:build client-gateway-websocket:build`)
through the build cache before the package checks. Unchanged sources reuse the
stamped `dist` (seconds); a changed library source rebuilds it, and the web
check's fingerprint includes that `dist`, so it re-runs against the new types.
`scripts/build-cache/tests/registry.test.mjs` fails when the root check drops
or reorders those builds.
