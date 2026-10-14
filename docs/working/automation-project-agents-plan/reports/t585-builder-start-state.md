# t585 builder-start-state: worker report

Branch `task/t585-builder-start-state` in both worktrees
(`fxwork/t585/!FluxIQ`, `fxwork/t585/!FluxIQWebExtension`). Nothing committed.

## Outcome

Done. All three parts are built and tested, and every check the brief names passes.

1. **A prepared entry counts as arrival.** When a dependent builder opens on its prepared entry, Core sends the
   opening look with `arrived: true`, but only when the opening tool declares an arrival. The web domain reads that
   key only on Core's own opening id `initial.<toolId>`, the same rule it uses for `held`. It removes the key, re-arms
   per-build memory like any fresh build, and then marks the build arrived. A builder that never arrived is still
   refused. The key on any other call is refused `invalid_input` and does not mark arrival.
2. **A reset brief gets its task from the first decision.** In a reset brief's harness, the person's build
   instruction is replaced by one Core instruction (`core.project_reset_task`). It says the brief is a reset and not a
   build, and lists every act of the build still in place. Each act carries its `did` (how it was done), the
   exploration call id when there is one, and the page it was made on. The page comes from a build-wide act-to-page
   map, filled when the read around a call places an act. The list is rebuilt from the ledger at every decision.
3. **The entry's start hook updates the ledger.** `automationStudioProjectBuildPrepareEntry` now returns
   `startReset: true` when the deployment's start hook ran. That covers both a prepared answer and an unprepared answer
   after the hook ran. The builder port then calls the build's trial reset `beforeTrial(signal, undefined,
   { startReset: true })` before it records the acts the preparation run landed. So every ledger marks its acts undone,
   and the opening entry note names them under `absorbedByStartReset`.

## What changed and why

Core (`packages/fluxiq/src/programs/automation-studio/runtime/`):

- `service/project-build/brief-ports.ts`
  - The header has three new paragraphs, one per fix.
  - `environment(...)` takes an optional `task` that replaces `instructions` on each harness call.
  - New `pages` map, filled by `placedAt(calls, pages)`, which wraps the placed ledger in both the builder port and
    the reset port.
  - New `RESET_TASK` and `resetTask(...)`, which build the reset's instruction. The wording is generic and names no
    site.
  - `told(...)` now takes `arrived` and marks the opening call `arrived: true`. The tool declarations are not changed,
    so `trial-view` and the person-needed fresh look never send the key.
  - Start-hook absorption runs before entry acts are recorded.
  - `entryNote(...)` takes the absorbed act ids.
- `service/project-build/entry-preparation.ts`: adds `startReset?: true` on prepared and unprepared answers when
  `automationStudioCandidateTrialStart` returned `reset`. The header says so.
- `project-agents/dispatch/reset-loop.ts`
  - The completion refusal's `actsToUndo` now keeps `stillThere` when it is present.
  - The refusal's instruction says "on the page your task names for it".
  - The header notes that the acts are now the task from the first decision.
- Tests:
  - `tests/project-build-brief-ports.test.ts`: the expected opening value is now `{look:true, arrived:true}`. A new
    case covers the start-hook ledger: a ledger asked with `startReset` between the entry run and the second builder's
    first decision goes from `["act-1"]` in place to `[]`, and the opening shows `absorbedByStartReset: ["act-1"]`.
  - `tests/project-build-reset.test.ts`: in the cart case, the reset agent's first request instructions contain
    "This brief is a reset, not a build", `act-1: `, and `made on the page https://shop.test/product/herb-tea`. They
    do not contain the person's instruction text.
  - `tests/project-build-entry-preparation.test.ts`: `startReset: true` is expected when there is a hook. A new case
    checks that no hook means no `startReset`.

Downstream (`domain/src/runtime/llm-evidence/node-run/`):

- `arrival.ts`: a header paragraph, plus `ARRIVED_KEY` and the exported `webNodePreparedEntry(request)`.
- `run.ts`
  - Strips the mark, which happens when `!continuing`.
  - After the opening re-arm lines it calls `run.arrivals.arrive(...)` when the request has a start location.
  - The file grew by 4 lines, from 778 to 782, under the 800 budget.
- `tests/arrival.test.ts`: the stub page has a search field, and there are 3 new tests.
  - A prepared opening admits `web.output.dom-type`: it returns `web.action.succeeded`, a `web.dom.type` command was
    sent, and no navigate was sent.
  - A builder that never arrived is still refused `not_at_start_location`, and no type is sent.
  - The mark on a non-opening call is refused `invalid_input`, and a later type is still refused.

## Commands run and observed results

- `node scripts/test-domain.mjs node-run/tests/arrival` (label t585): 17 tests, 17 passed. The first run had 3
  failures from my own test regex (JSON-escaped quotes), which I fixed.
- `node scripts/test-domain.mjs runtime/llm-evidence/node-run/`, which covers every test under the changed directory:
  `# tests 356 # pass 356 # fail 0`.
- Domain typecheck, run from `domain/`:
  - `npx tsc -p tsconfig.json --noEmit` exited 0.
  - `npx tsc -p tsconfig.test.json --noEmit` exited 0.
- Downstream `node scripts/structure-audit.mjs`: `structure-audit: passed (194 warning(s), 639 baselined)`. The only
  warning on a changed file is the existing advisory for `run.ts` (782 lines, over 400).
- Core typecheck: `npx tsc --noEmit --incremental ...` in `packages/fluxiq` exited 0 with no output. I ran it after
  the last edit.
- `npx vitest run .../service/project-build/ .../project-agents/`: 35 files, 235 tests passed.
  - The first run had 1 failure: the entry-preparation test now sees `startReset: true`, which is expected. I updated
    it.
  - After the last two cosmetic edits (a lost space, and the act-call wording) I reran `service/project-build/`: 11
    files, 37 tests passed.
- Core `node scripts/structure-audit.mjs`: `structure-audit: passed (356 warning(s), 1156 baselined)`. No warning
  names a changed file.
- Mutation check, with `brief-ports.ts` restored from a scratchpad copy each time:
  - With the reset `task` and the start-hook absorption disabled, both new Core tests failed: the instruction lacked
    the reset text, and the entry note lacked `absorbedByStartReset`.
  - With absorption alone disabled, the tightened ledger assertion failed: the slice had no "ledger put back".

## Not verified

- No live or browser run (forbidden by the brief), and no model provider was reached.
- The domain side is tested through its runtime with a stub gateway. The Core side is tested with Core's isolated
  stub domain. No single test runs Core's opening through the real web domain with `arrived`.
- I did not check what a real model does with the reset instruction.
- The page in the reset task exists only for exploration acts placed by a read. Trial acts, and acts from a domain
  with no `startState`, show "page not read".
- I did not check the start-hook absorption against a real scenario server.

## Open questions or contradictions found

- **Contradictory guidance (report cause A').** Core's `startLocationNote` (`llm/deepseek/request-body.ts:378`) still
  tells a builder that does not open on the arrival that its first call must be the node that goes there. A prepared
  builder now is arrived, so that sentence is false for it. `llm/**` is outside my brief and I did not touch it.
- **Repeat guard (cause B, `llm/repeat-guard/outcomes.ts`).** Not in scope. It is less likely to matter now, because
  a prepared builder is no longer refused `not_at_start_location`.
- **Scoped opening ids.** The domain reads `arrived` only on the exact id `initial.<toolId>`, as it does `held`. With
  host capacity above 1, the opening id becomes `initial.<toolId>.<scope>`, and both keys would then be refused as
  unexpected. The web domain declares capacity 1, so this does not apply today.
- **Not done from the social report.** `cannotUndo` on the reset completion schema, dropping `write` from the reset's
  run-node schema, and an `outsideBrief` note for resets were all left out (fixes 2b, 3 and 4).
- **The brief's tier choice.** The reset task lives in the instruction slot rather than in the opening evidence, so
  it reaches the first decision whether or not the domain has an opening tool. The opening evidence does not repeat
  the list.
