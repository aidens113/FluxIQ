# Code Structure

How source files are placed, named, sized, and divided in this repository.
`AGENTS.md` carries the binding summary; this document is the full
methodology. Size and density budgets are enforced by
`scripts/structure-audit.mjs` as the first step of `pnpm check`.

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
test sits one segment deeper than its subject and is not counted.

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
  in `.structure-baseline.json` and may only shrink.

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
- **Barrel-skipping imports.** `from "../storage/project-hierarchy-feed.ts"`
  couples the importer to a file location. Import from `../storage`.
- **Test files loose in a source directory.** They double its file count and
  mix two kinds of file; `storage/` was 37 source files and 35 tests in one
  folder. Tests go in the directory's `tests/` subfolder.
- **Raising a baseline entry.** The baseline is a ratchet. If a baselined
  file must grow, split it instead.

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
