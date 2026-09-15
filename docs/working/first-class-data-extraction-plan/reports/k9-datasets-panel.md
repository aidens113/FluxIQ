# k9-datasets-panel: the Runtime Debug datasets panel and export

## Outcome

**Done.** `WEB/features/automation-studio/datasets/` holds the panel, the table,
the queries, the commands and the download link; the panel is mounted beside
Export Audit; `metadata.recordCount` shows in the action detail's data tab; and
`datasets` is registered in both the feature taxonomy (C10) and the CSS domains.

- The K9 acceptance suites pass: **7 files, 64 tests**, up from a 51-test
  baseline I took before editing.
- `pnpm --filter @fluxiq/web check` (`tsc --noEmit`) exits **0**.
- `pnpm structure:check` reports **2 violations, neither in a file I own or
  created** — both are shared working documents (below).
- **All three mutations from the report's K9 section went red and every file was
  restored**, verified byte for byte, with the suite green afterwards.

Three things need the supervisor's attention, each detailed under "Open
questions": the panel's command member had to be **optional** rather than
required, because a test file I do not own would otherwise fail to compile;
**two files outside my literal ownership list** had to change or a new style
domain cannot pass its own gate; and `domainId` is read at click time rather
than through a router hook, because the sanctioned hook would break unowned
tests.

## What changed and why

Paths are under `apps/web/src/features/automation-studio/` unless stated.

### `datasets/` (new, 7 source files + 3 tests)

- **`RunDatasetTable.tsx`** — one exported component. Columns come from
  `schema.fields[].label` **in schema order and never from row keys**: a row
  missing an optional field would otherwise drop a column, and two pages of the
  same dataset could disagree on their columns. Cells are read by `field.id`. A
  `url` value renders as text, never as an `href`, so rows extracted under
  automation are never one click from a live request. `json` values (and any
  object) render through `JsonToggle`, imported from the `../runtime` barrel.
  "Load more" appears only while a `nextCursor` remains.
- **`RunDatasetsPanel.tsx`** — one exported component, **props-only**: it holds
  no transport, so tests inject stubs instead of mocking the network. It lists
  the run's datasets from `runDetail.datasets` (K5), loads a page on selection,
  exports inline as a Blob exactly as `RunActionLogView.tsx:225-233` does,
  switches to the streaming link when the answer is `tooLarge`, and deletes
  behind a two-step confirmation (CD17). One exported component per file is a
  hard audit limit (`exportedComponents: 1`), so the `View`/`ViewContent` split
  used elsewhere in `runtime/` was not available; the commands prop replaces it.
- **`dataset-queries.ts`** — one function per endpoint, following
  `runtime/run-queries.ts:15-17`. `RUN_DATASET_PAGE_SIZE` is 50 (C11: the server
  clamps 1-200 and defaults to 50).
- **`dataset-commands.ts`** — the delete command and `RunDatasetCommands`, the
  command set `runtime-host.ts` binds and the panel is given.
- **`download-href.ts`** — URL-encodes the three ids and appends `domainId` as
  `program-api.ts:121-127` does. Verified against K8's landed route: it reads
  `format` and `domainId` from the query string and `decodeURIComponent`s the
  path segments this builder encodes.
- **`types.ts`** — the wire shapes the browser reads. See Open question 4: the
  run-dataset contract types are not reachable from `apps/web`, so they are
  mirrored here with a comment; the record *schema* types are imported from
  `fluxiq/automation-studio/nodes`, not copied, because the columns depend on them.

### Three `runtime/` files

- **`runtime-host.ts`** — `RuntimeDetailCommands` gains `datasets`, bound from
  the transport in `useRuntimeDetailCommands`, with `downloadHref` closing over
  the current domain.
- **`RunActionLogView.tsx`** — mounts `RunDatasetsPanel` beside Export Audit,
  passing `runDetail.datasets` and `props.commands.datasets`. The view imports no
  Program API, so it stays off direct API ownership (architecture contract).
- **`RunDetailPanels.tsx`** — the data tab shows `metadata.recordCount` inline
  when it is a finite number. **No exported component was added**; the file
  stays at its baselined 9.

### Gate registrations

- `tests/architecture-contract.test.ts`: `"datasets"` added to
  `approvedTopLevelDirectories` (C10).
- `styles/datasets/01-panel.css` (new) with `automation-datasets-*` selectors,
  plus the two registrations a new domain mechanically requires (Open question 2).

## Commands run and observed results

Each ran alone, from `F:\!FluxIQ`, in this order.

1. **Baseline before editing** —
   `pnpm --filter @fluxiq/web exec vitest run .../tests/architecture-contract.test.ts .../styles .../runtime/tests/runtime-views.test.tsx --no-file-parallelism`
   → `Test Files 4 passed (4)`, `Tests 51 passed (51)`.
2. **K9 acceptance** —
   `pnpm --filter @fluxiq/web exec vitest run src/features/automation-studio/datasets src/features/automation-studio/runtime/tests/runtime-views.test.tsx src/features/automation-studio/tests/architecture-contract.test.ts src/features/automation-studio/styles --no-file-parallelism`
   → `Test Files 7 passed (7)`, `Tests 64 passed (64)`. Re-run after the
   typecheck fixes: **7 passed / 64 passed** again.
3. **`pnpm --filter @fluxiq/web check`** → first run **failed with 2 errors**,
   both mine, both fixed (Open questions 1 and 3); the re-run printed no
   diagnostics and exited 0.
4. **`pnpm structure:check`** → `structure-audit: 2 violation(s) across 1
   rule(s)`. Both are `[working-docs]`:
   `docs/working/first-class-data-extraction-plan.md: 1178 lines exceeds the
   800-line compaction threshold` and `docs/working/README.md is out of date`.
   Neither is a file I own; K4b observed the second one too. A re-run grepped for
   `datasets|RunDataset|download-href` returned **no lines**, so the audit names
   none of my files. It also reports `1 baseline entries can be lowered`; I did
   not run `pnpm structure:baseline`, since `.structure-baseline.json` is a
   serial file already modified by other work in this tree.
5. **Mutations** — `scratchpad\k9-mutations.mjs`, which asserts each target is
   unique, backs up the bytes, runs
   `vitest run src/features/automation-studio/datasets --no-file-parallelism`,
   restores in `finally`, and verifies the restore.

   | # | Mutation | Result |
   | --- | --- | --- |
   | M1 | columns taken from row keys instead of the stored schema | **red** — `RunDatasetTable` column-order test and the panel's page test |
   | M2 | a URL cell rendered as a link | **red** — "renders a URL as text and never as a link" |
   | M3 | `domainId` dropped from the download link | **red** — "appends the domain scope, as every program request does" |

   All three restored `true`, and the post-restore run printed `green`.

### Reconciling with K8's landed envelopes

I wrote the queries against the plan, then re-read K8's handlers
(`AS/api/handlers/datasets.ts`) and corrected two of four:

| Endpoint | K8 returns | Mine before | Now |
| --- | --- | --- | --- |
| `list-run-datasets` | `{ datasets }` | `{ datasets }` | unchanged |
| `get-run-dataset-page` | `{ dataset }` (page or `null`) | `{ page }` | **fixed** |
| `export-run-dataset` | `{ export }` | `{ export }` | unchanged |
| `delete-run-datasets` | `{ deleted }` (`{ datasetCount, rowCount }`) | count fields | **fixed** |

All six endpoint name strings match `AUTOMATION_STUDIO_ENDPOINTS`. The panel
uses four of the six; `list-project-datasets` and `list-dataset-runs` are K12c's.

## Not verified

- **No live browser pass.** The brief withholds authorization to start the web
  panel, so nothing here was exercised in a real browser: the Blob download, the
  streaming link actually downloading, and the panel's layout are unproven
  against a running page. The Blob path is additionally skipped under the node
  test environment by its own `typeof window` guard, so only the message and the
  command call are asserted, not the download itself.
- **The streaming route end to end.** I read K8's route to confirm the link's
  shape but never issued a request to it, so the 401/403/400/404 ladder and the
  response headers are unverified from the client side.
- **Repository-wide `pnpm check`, `pnpm test`, `pnpm build`** were not run; my
  scope was the web package. K8 reports `AS/runtime/service.ts` is over its
  ratcheted baseline from K4c, which would fail a repository-wide `pnpm check`
  for reasons unrelated to K9.
- **`delete-run-datasets` against a real server.** The panel's delete is covered
  by a stub only; the audit row and the `flows.write` refusal path are untested
  from the web.
- The panel does not refresh the dataset list after a delete — it asks the user
  to reopen the run, because the list arrives inside `runDetail` and this brief
  does not own the run-detail reload.

## Open questions or contradictions found

1. **`RuntimeDetailCommands.datasets` had to be optional, not required.** The
   brief asks for `datasets` commands on that type. Declaring it required broke
   `tsc`: `runtime/tests/runtime.test.tsx:91` builds a type-checked
   `RuntimeDetailCommands` literal, and that file is **not** in my ownership
   list, so I could not add the member there. I made it optional and mounted the
   panel only when present; the host hook always binds it, and
   `runtime-views.test.tsx` asserts the mount. If the supervisor prefers it
   required, one line in `runtime.test.tsx` makes it so.
2. **Two files outside my literal ownership list had to change.** The brief
   grants "the `datasets` style files", but a new CSS domain cannot exist without
   (a) `app/programs/automation-studio/automation-studio.css`, whose manifest must
   import every stylesheet exactly once, and (b) `expectedDomains` in
   `styles/tests/styles-architecture.test.ts`, which asserts the domain set
   exactly. Each is a one-line addition and both gates fail without them. I judged
   them inseparable from "add the `datasets` style domain" and made them; they do
   not overlap K12c's `views/`, `live/`, `workspace/` or K12d's `parameters/`.
3. **`domainId` cannot be read the sanctioned way from this feature.** The
   architecture contract forbids `useSearchParams(` in every automation-studio
   source except `navigation.ts` and `live/hooks/useAutomationBrowserEntry.ts`.
   Routing the read through `useAutomationBrowserEntry` would have broken tests I
   do not own: `runtime/tests/diagnosis-authorization-interactions.test.tsx` and
   two `large-project-behavior.test.tsx` files mock `next/navigation` with
   `useSearchParams` only, and that hook also calls `usePathname()`. So
   `download-href.ts` reads `domainId` from the current URL **at click time**,
   guarded for SSR, with the reasoning in a comment. This is program scope, not
   view state, and it is the same parameter `program-api.ts` reads — but it is a
   deliberate choice worth a reviewer's eye.
4. **The run-dataset contract types are unreachable from `apps/web`.**
   `@fluxiq/contracts` is not a dependency of `apps/web` and resolves nowhere
   from it; browser code reaches contracts only through a `fluxiq` subpath, and
   `nodes/record-output.ts` lifts the record **schema** types only. No public
   subpath re-exports `AutomationStudioRunDatasetSummary`,
   `AutomationStudioRunDatasetPage` or the export answers. I mirrored those three
   in `datasets/types.ts` with a comment saying to delete them when a subpath
   exists, and imported the schema types properly. **K10 should add the
   re-export** the way K1 did for record output; until then the panel's dataset
   shapes are a second copy of a wire contract, which is exactly the drift the
   `contract-spread` rule exists to prevent elsewhere.
5. **K8's cursor error is untyped** (its own open question 4). The panel shows
   the raw error string when a stale cursor is refused, so a user paging a
   dataset that was replaced under them sees a generic message. Not worth fixing
   until someone can hit it.
