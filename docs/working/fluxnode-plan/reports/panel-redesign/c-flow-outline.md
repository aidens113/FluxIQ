# P9-C: Flow outline (worker report)

## Outcome

Partial. `outlineFlow` and `outlineEdit` are in place under
`packages/fluxiq/src/flows/executable/outline/`. Their tests pass and the fluxiq typecheck is clean.
The structure audit still fails on one import, and fixing it needs a one-line change to a file this
brief does not own (see Open questions 1). I did not add the export line to
`flows/executable/index.ts`. Adding it broke an existing invariant test (Open questions 2).

## What changed and why

Only new files under `packages/fluxiq/src/flows/executable/outline/`:

- `outline-flow.ts`: `outlineFlow(graph, options?) -> FlowOutline { interface, steps, issues }`.
  - `graph` is `ExecutableGraph` nodes and edges, plus an optional `interface`.
  - `options` holds `interface`, `describeOutput(outputId, params)`, `describeFlow(link) -> { name, lastingClasses? }` and `router` (the stored `AutomationStudioFlowRouter` rules and fallback).
- `outline-edit.ts`: `outlineEdit(outline, graph, edit) -> { ok: true, operations: GraphPatchOperation[], message } | { ok: false, reason }`.
  - Edits refer to steps by their numbers: `set-value`, `bind-input`, `set-words` (`set_node_label`), `move` up/down, `delete`, `add-call` and `add-data`.
- `types/`: one type per file. `OutlineStep` is `{ number, nodeIds, kind, words, lasting, children?, arms?, link?, jumpTo? }`, where `arms` are `{ words, port?, steps }`.
- `graph/` covers:
  - the path graph: an edge carries the path when its source port is a route port, or when a portless edge lands on no named input or on "in". Every other edge only carries a value.
  - where branching paths meet again: their nearest common post-dominator, worked out inside the current block.
  - node roles, read off the definition id. The calling node ids are `builtin.control.call-subflow`, `builtin.control.call-flow` (`PIPELINE_NODE_TYPES.callFlow`), `builtin.flow.call` and composite nodes carrying `fluxiq.callFlow`.
  - call links (flow, subflow, part or fluxnode, by id) and binding paths.
- `walk/` builds the outline:
  - `sequence.ts`: the block walker. Each node is visited once.
    - Start, merge and noop nodes go into the next step's nodeIds; a merge that closes a split goes into the split's step.
    - An end is a hidden part of the last step, or "Give back X", "Stop here: it did not work" or "Finish here".
    - A branch's true path is the step's `children`; other ways out become `arms`.
    - A loop body becomes `children`, ending back at the loop; `done` carries on.
    - A failure route becomes an "If that does not work:" arm.
    - A node already placed, or the end of an enclosing block, becomes a `jump` step.
  - The other files cover entries, nodes that only give a value (attached to the step that reads them), the handler section, the router step, numbering, and jump words ("Go back to step N", "Go to step N", "Finish here", each with the issue "This part is clearer in the graph").
  - Steps the start does not reach go under "These steps do not run from the start:" with an issue. Handlers come last, under "If something goes wrong:".
- `words/`: plain-English sentences.
  - Act steps reuse `projectPartStepOf` (`framework/.../project-parts/step-words.ts`) and `partStepsOf` (through its barrel alias `automationStudioPartSteps`).
  - The `describeOutput` answer is folded through `automationStudioFlowDraftStepWordsOf` (`runtime/flow-authoring/draft/step-words.ts`).
  - Data steps have fixed sentences for `builtin.data.*` and pipeline steps, for example "Keep rows where price is at most 20" and "Sort by price, lowest first".
  - Words never contain node type ids; a property test checks this.
- `edit/`, the edit refusals and what each edit emits:
  - **Move** swaps two plain neighbouring steps. It is refused when they do not directly follow each other, when either step holds other steps, or when the later step uses a value from the earlier one ("Step 3 uses “result”, which step 2 gives, so it cannot go before it."). A value counts as used through a value edge, a `$node.<id or key>` binding, or a saved value set by `set-variable`.
  - **Delete** emits `delete_node` (the store removes the node's edges), deletes any value-only node that served only that step, and adds one bridging edge. It is refused when the step is an output's only source (an output's `metadata.binding` reads it), when another step uses its value, or when it holds other steps.
  - **Add** splices into the step's success edge, or into a loop's `done` edge.
  - **Records** are in the graph store's shape (nodeId, edgeId, x and y, and so on), with fresh ids.
- `tests/`:
  - fixtures for linear, branch, switch, for-each (with a nested branch), handler, call (four kinds), router, pipeline (no start), an unstructured jump back with an unreached step, and a forward jump out of a loop;
  - a property test over 600 seeded random graphs;
  - edit round trips that apply the patch with `tests/apply-operations.ts`, which mirrors the store's rules.

Decisions:

- **`kind` of an added data step.** It is `builtin.data.pipeline-step` with the declaration in `{ step }`. That is the only form that can express sort, limit and dedupe, but there is no registered node definition for it outside compiled pipelines (Open questions 3).
- **Added Call Flow node.** It is `builtin.control.call-flow` with `parameterValues.target = { flowId }`, following the fluxnode `flowCallTargetSchema` and pipeline map convention.
- **Binding to an input.** The new value is `{ $state: { path: <inputId>, fallback: <previous literal> } }`.

## Commands run and observed results

- `cd packages/fluxiq && npx vitest run src/flows/executable/outline`
  -> `Test Files 3 passed (3)`, `Tests 23 passed (23)`.
- A temporary 8000-seed version of the property test passed. I deleted that file afterwards.
- `cd packages/fluxiq && npx vitest run src/flows/executable`
  - With the barrel line: `1 failed | 44 passed`. The failure was `dsl/tests/source-closure.test.ts`, "the complete declarative compiler graph is independent of Studio": `client-gateway/service/command-ledger/dispatch.ts: expected '@fluxiq/contracts/automation' not to contain ...`.
  - After removing the line: `Test Files 7 passed (7)`, `Tests 45 passed (45)`.
- fluxiq typecheck under the lock, after free memory reached 3363 MB (`node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit --incremental ...`):
  - first run: three TS2379 errors in my test file (an optional hook type);
  - after the fix: `exit 0`, no output.
- `node scripts/structure-audit.mjs` -> `structure-audit: 1 violation(s) across 1 rule(s).` The violation is: `FAIL [imports] packages/fluxiq/src/flows/executable/outline/words/part-step.ts: 1 import(s) reach into another directory's files instead of its barrel, e.g. "../../../../framework/automation-service/service/project-parts/step-words.ts" at line 8.` There are no other findings or warnings on outline files, and no import-cycle findings.

## Not verified

- **Real stored Flows.** Fixtures are hand-built; no live data or stored Flow was outlined.
- **The real graph store.** Patches were applied by the test helper, not by the store, so `add_node` and `add_edge` against the real store and the new `set_node_label` handler (another worker's) are unexercised.
- **Words.** Domain `describeOutput` wording comes from a test stub. The web domain hook does not exist yet.
- **apps/web typecheck.** Not run, because nothing there imports the outline yet.

## Open questions or contradictions found

1. **Audit fix needs a non-owned file.** `projectPartStepOf` is not exported from `framework/automation-service/service/project-parts/index.ts`, so the reuse the brief asks for must reach into `step-words.ts`, and the imports rule fails on it.
   - Fix: add `export { projectPartStepOf, type ProjectPartStepCallee } from "./step-words.ts";` to that barrel, then change `outline/words/part-step.ts` line 8 to import from `../../../../framework/automation-service/service/project-parts/index.ts`.
   - Since nothing imports the outline module except its tests, that barrel import cannot close a cycle. Re-run the audit after the change.
2. **No `flows/executable/index.ts` export line.** Adding it makes the declarative-compiler closure test (`dsl/tests/source-closure.test.ts`) fail. That test forbids anything reachable from `flows/executable`, type imports included, from reaching `@fluxiq/contracts/automation`. The reused helpers and `api-contracts/automation` reach it. Consumers should import `flows/executable/outline/index.ts` directly.
   - **Browser bundles.** The outline loads `runtime/flow-authoring/draft`, `runtime/project-parts/card` and framework modules, so it belongs on the server side of the editor (for example behind an endpoint), not in a browser bundle.
3. **Data steps.** `builtin.data.pipeline-step` is not a registered node definition, so an added data step outlines and patches correctly but would not run in an ordinary Flow until P7 registers it or a node type is chosen.
   - Likewise, `builtin.control.call-flow` runs only once P6 lands it.
4. **Placement.** The brief called for a Core module, but `outline/` depends on framework and runtime helpers. A layer split may be wanted later; the design report names this location.
