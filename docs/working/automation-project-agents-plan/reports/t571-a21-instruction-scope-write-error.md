# t571 A21: an instruction's scope write error

## Outcome

Done. Saving an instruction no longer hides a failed SQL write. A node-scoped
instruction now shows up in both the project SQL listing and the summary index.
An instruction whose scope names a node, Subflow or Router that its Flow does
not have is refused with a clear message, and nothing is written for it.

## Why the write failed

`instruction_scopes.node_id` has a trigger guard against `graph_nodes.node_id`
(`storage/project/schema/relation-indexes.ts:106`, built by `foreignKeyGuards`).
`saveFlowInstruction` then dropped the error with `.catch(() => undefined)`.
A probe against a temporary store showed the guard turning away **every** node
scope, even one naming a real node of a Subflow graph that had just been saved:

- `SQLITE_CONSTRAINT: instruction_scopes.node_id references missing graph_nodes.node_id`, for a real node in the Subflow graph, with or without `subflowId`, a missing node, and `on_error` with a `nodeId`.
- The same probe hit the Router guard (`routers.router_id`) and the Subflow guard (`subflows.subflow_id`) when it named owners that do not exist.

There are two reasons the node guard cannot work:

1. A Flow's graph is copied into `graph_nodes` lazily, on the first viewport
   read or graph patch (`service.ts` `getFlowGraphViewport`,
   `flows/graph-patch.ts`). A `saveFlow` on a Flow with no graph revisions
   leaves the document as the only copy of the graph.
2. `graph_nodes` is keyed by `node_id` alone, but node ids belong to one Flow:
   every Subflow graph has its own `start`. `upsertNode` replaces a row with
   the same id. So an id-only guard cannot mean "a node of this Flow".

## Choice: both refusing and not depending on the node row, and why

The docs under `docs/architecture/automation-studio/` say nothing about how
instruction scopes behave. The binding contract is the accepted-state
validator (`storage/project/accepted-state/validation.ts:139-147`). It rejects
an instruction whose node is not in its Flow's document nodes
(`instruction_node_missing`), and one whose Router or Subflow is missing or
belongs to another Flow (`instruction_owner_missing`). So:

- **Refuse at save.** A scope naming no owner of its Flow is invalid under
  the contract, so `saveFlowInstruction` refuses it before writing to any
  store.
- **Store the node scope without a node row.** The contract checks nodes
  against the Flow's documents, not `graph_nodes`. Item 1 above means a valid
  node scope would still be refused if the guard stayed. Refusing alone would
  not have made parity hold for a valid node-scoped instruction. A new
  migration drops only the node guard. The Flow, Router and Subflow guards
  stay, because those SQL rows are written when their owners are created.

What counts as "a node of the Flow": a node in the Flow's own document, or in
the named Subflow's graph. When the scope names no Subflow, a node in any of
the Flow's Subflow graphs counts. A Flow's steps live in its Subflow graphs,
and the instruction harness (`llm/harness/instruction.ts:136`) matches a node
scope with no Subflow against any `subflowId`.

## What changed

- `runtime/service/flows/instruction-scope-owners.ts` (new, exported from the
  `flows/index.ts` barrel): `assertInstructionScopeOwners(scope, lookup)`
  - The Flow must exist; this is the old `getFlow` check.
  - A `router` scope must name the Flow's Router.
  - Any `subflowId` must name a Subflow of the Flow.
  - Any `nodeId` (`node`, or `on_error` with a node) must name a node of the
    Flow, as defined above.
  - Each refusal is an `Error` that names the missing owner and the Flow.
- `runtime/service.ts` `saveFlowInstruction`, edited in place with the line
  count unchanged at 4318:
  - The single `getFlow` line now calls `assertInstructionScopeOwners`.
  - `writeSqlFlowInstruction` runs first, straight after
    `ensureProjectStructure`, and its error is no longer caught. If the SQL
    write fails, nothing has been written to the detail file, the JSON index
    or the summary store.
  - The import was added to the existing import line 193.
- `storage/project/schema/instruction-node-scope.ts` (new)
  - Migration `0026_relaxed_instruction_node_guard` drops
    `fk_instruction_scopes_node_id_insert` and `_update`.
  - Its id sorts after `0026_recording_description`, the previous last
    administration migration, and before `0026_staged_project_snapshots_v1`,
    the first id the stores append. The runner's checks and the existing
    `storage/project/tests/administration.test.ts` order test both pass.
  - Exported from `schema/index.ts` and added to the end of
    `AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS` in
    `storage/project/administration.ts`.
- Tests
  - `storage/project/schema/tests/instruction-node-scope.test.ts` (new). On a
    database migrated without the new migration, a node scope with no graph
    row is refused. After migrating, it is stored, the existing rows are
    kept, the Flow guard still refuses a missing Flow, and no node-id trigger
    is left.
  - `runtime/service/summaries/tests/instruction-scope-parity.test.ts`
    extended with a `nodeScoped` seed. Both Subflow graphs hold a `start`.
    Four instructions are saved: node with a Subflow, node without one, node
    `start` in Flow b, and `on_error` with a node.
    - The first new test checks that SQL and the index agree on kind and
      order under every earlier filter, plus the node and `on_error` filters.
    - The second new test refuses five scopes: a missing node, another
      Flow's node, `on_error` naming a missing node, another Flow's Subflow,
      and a missing Router. It then checks that none of the five appears on
      either path.

## Commands run and observed results

Each test command was run from `packages/fluxiq` with `npx vitest run <paths>`.

| What ran | Observed result |
| --- | --- |
| Probe before the fix (scratch test, since deleted) | Every node scope failed with `instruction_scopes.node_id references missing graph_nodes.node_id`. The Router and Subflow probes failed on their own guards, as listed above. |
| `instruction-node-scope.test.ts` | 1 passed |
| `instruction-scope-parity.test.ts` | 4 passed, both before and after the typing fix |
| The parity test, `-t "node-scoped"`, with the new migration temporarily taken out of the list (then restored) | 2 failed, 2 skipped. The test does catch the defect. |
| Directories I changed, plus every test that saves an instruction scoped to a node, Router, Subflow or `on_error` (list below) | `Test Files 79 passed (79)`, `Tests 494 passed (494)` |
| `api/handlers/tests/instruction-scope.test.ts` | 6 passed |
| `npx tsc --noEmit -p .` in `packages/fluxiq` | First run: one TS2379 in my new parity test (filter literal type). Fixed by typing the array as `Filter[]`. Rerun: exit 0, no output. |
| `pnpm structure:check` at the Core root | `structure-audit: passed (351 warning(s), 1156 baselined)`. It also printed: `1 baseline entries can be lowered`. |

The 79-file run covered:

- `runtime/service/instruction-led/tests/service.test.ts`
- `runtime/service/summaries/tests`
- `runtime/service/flows/tests`
- `storage/project/schema/tests`
- `storage/project/tests`
- the `runtime/tests/refuted-result` reauthor-service and repair-replay-chain tests
- `runtime/tests/service-adaptation` caller-paid-reauthor-check, context-history-reads and judged-reauthor
- `runtime/tests/service-bootstrap/tests`
- `runtime/tests/service-flows/tests/scale-pages.test.ts`

No provider was reached, and nothing ran live.

## Not verified

- The rest of the `runtime/tests` tree; I ran only the callers that save
  scoped instructions. The full suite was not run, per the twice-a-day rule.
- Existing project databases that already hold instructions refused by
  earlier saves. Those instructions have JSON detail and an index entry but no
  SQL row. Nothing backfills them: a later save of the same instruction writes
  the row, but nothing re-saves them on its own.
- Downstream (the extension) was not built or tested against this change.
- Which structure baseline entry can be lowered. I did not run
  `pnpm structure:baseline`, because `.structure-baseline.json` is not mine
  to change. `service.ts` is still 4318 lines, so the entry is probably not
  from this change.

## Open questions or contradictions found

- `graph_nodes.node_id` is the table's primary key, but node ids belong to
  one Flow, and `upsertNode` replaces a row with the same id (the
  `0024_scoped_flow_keys` problem, still open for graph nodes). Once two
  Subflow graphs that each have a `start` are imported into SQL, the second
  overwrites the first. That is a graph-store defect outside this brief; it
  probably deserves its own unit.
- The on_error mapping in `sqlInstructionScopeFromInstruction` sets
  `errorCode` to the scope's `nodeId`, or `"flow_error"` when there is none.
  The accepted-state validator wants `errorCode` to name one of the Flow's
  `errors`, so an `on_error` instruction would fail
  `instruction_error_missing` at cutover. I did not change this.
- Refusals are plain `Error`s with descriptive messages, like the other
  service lookups (`Unknown Automation Studio subflow`). They are not
  `AutomationInstructionError`, which has fixed messages per code. If the API
  should map them to a typed refusal code, `instruction-led/error.ts` would
  need a new code.
