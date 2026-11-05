# The Library lane: a searchable, runnable, nested subflow library (t866)

Worktrees `fxwork/t866/!FluxIQ` and `fxwork/t866/!FluxIQWebExtension`, branch `task/t866-subflow-library`. Provider-free: no model, Lab or paid call ran. Worker reports are in `subflow-library/`: `w1` to `w11`. The design as built is in `docs/architecture/automation-studio/subflow-library.md`.

## Outcome

**Done, all seven steps, within the 2026-11-10 MVP date.** A model can mark a part as it writes a draft, and a person can say "save this". The project can search its library, run a part with inputs at no model call behind a guard, and call a site part and its action sub-part from two Flows by pinned version, with a list row crossing the call. A repair of a shared part moves only the caller whose judged run used it.

**The one thing not proven: a real model.** `core.run_part`, the shortlist and the marking guidance have never met a real model. The plan's paid two-task lane is what gives the first real hit-rate number, and it was out of this lane's rules.

## Step by step

| Step | Result | Proof |
|---|---|---|
| 1. Replaced-part probe | **The bug was real:** a part replaced by a repair returned `{"answer":null}` as a success. Fixed at the cause: a replaced node keeps its key, a step may carry one, a replacement that strands an output is refused, and a frame fails on a lost binding | `part-output-binding.test.ts`, `call-subflow.test.ts` |
| 2. Marks, cards at save | Generic guidance line, store with versions and `part_calls`, cards in one transaction, trust derived through `confidence.ts`, `stability` no longer read or written by new Subflows. The bootstrap, `flows/store.ts`, `service.ts:3156` and the web settings view still touch the optional field | Test with distinctive page strings holds card, search index and facets free of page text |
| 3. Search API | `list-project-parts`, `get-project-part`, `save-project-part`, relay, paired list. FTS5 plus exact filters, no embeddings | Handler, relay and route tests |
| 4. Run a part | One runner for `run-project-part` and `core.run_part`, no model, guard, stop point before every step | Headed spec, below |
| 5. Shortlist | Up to 5 cards in the free look, site first then text. Tool offered only when the shortlist is not empty, tool bytes identical otherwise. Exact-hash dedupe. A lasting part holding a request literal is refused | Tests; no paid run |
| 6. Pinned calls, nesting | `{ part, version }` through one execution path, depth 8, static cycle check, callers known, row across a call, in the script grammar too | Headed spec, below |
| 7. Repair isolation | Next version on a judged yes only; only the steps that ran it move; others byte-identical and told; newer first at no model call | Real service with fakes, no browser |

## The lead's two added fixes

1. **A lasting step bound to a row** is re-checked before every press: the row is found again from the step that read it, by identity, its control must be visible in that row, a row gone is reported gone with no press, and the rows after it are not tried, matching the engine's own gone path. Proven on three rows, reversed rows and a removed row.
2. **A part run while another run drives the project** is refused, reusing the host lease and the admission gate. A build's own call is the same run. For a build a refusal is a tool answer. **A plain Flow run is now refused at its start** while another run holds the page, in the same words, and that was proven by running it: no session written, no command sent, the fixture's state identical, and the same run succeeding once the part ended.

## What the Extension lane's library screens can call

`LIBRARY_LANDED` is gone: `extensionLibraryPort` always returns the port, and `library-port.ts` uses the real constants. The panel's readers are held against real Core answers in the pinned spec (`readListing`, `readDetail`, `readOutcome`). A reply is the `PanelRelayResponse` envelope with Core's payload unchanged, and `projectId` is the relay's.

| Message | Sends | Answers |
|---|---|---|
| `listParts` | `query?, site?, inputName?, outputName?, lasting?, trust?, usedByFlowId?, sourceFlowId?, limit?, cursor?` | `{ parts: Card[], nextCursor, hasMore }` |
| `getPart` | `partId, version?` | `{ card, steps: [{ label, lastingClasses }], calls: tree, versions: [{ version, createdAtMs, trust }], callers }` |
| `runPart` | `partId, version?, inputs?, permittedConsequences?, acknowledgedRepeat?, newRunId?` | `{ runId, status, outputs, rows?, stoppedAt?, acts, modelCalls: 0 }` |
| `savePart` | `flowId, subflowId, name?, purpose?` | `{ saved: true, partId, version, status }` or `{ saved: false, code, message }` |

A refusal is an ordinary successful payload, `{ refused: true, code, message, classes? }`: `parts.unavailable`, `parts.not_found`, `parts.run_id_refused`, `part.not_found`, `part.wrong_site`, `part.not_at_start`, `part.input_missing`, `part.input_unknown`, `part.act_not_allowed`, `part.confirm_repeat`, `part.calls_not_available`, `part.call_cycle`, `part.call_too_deep`, `part.repeat_refused`, `part.run_in_progress`.

**What the screens do not yet use:**
- `caller.newer` (a newer version passed) and a caller's `flowId`, which is now the parent Flow a person opens. `readCallers` keeps only `{ kind: "flow" }`, so a person sees a count and no names or "newer" note. A small change in `panel/library/read/detail.ts`, in the Extension lane's files.
- `savePart`: the port has list, read and run only. "Save this" has a relay and no button or chat command yet.
- `part.confirm_repeat` carries `classes`, for the "this will do it again" question.

## Decisions I took

- **A library failure never undoes a saved Flow or hurts an attempt.** It shows on the build trace by the error's name, and is written again at the next save.
- **The act record is asked at the door a lasting step passes**, not in the gate, because the gate reads saved parameters with bindings unresolved. The gate holds the stop.
- **A plain list read is a source a row can be re-found from**, through its trusted `observe` floor. This widens the t786 reader for every stale-target re-find, which the user's rule asks for.
- **A press called from a repeat without the row stops unpressed** (`row_not_handed`), and the model is told to write `row: $row`. A plan port named `row` is refused, and I changed the test that listed `row` as allowed.
- **A version's last verdict decides whether it is offered**, not one failure ever. A version that passed serves a second step in the same run. An unreachable judge is not a failure.
- **Trust from a judged run reaches a pinned version with no graph revision.** Without it a lasting part from the answer-first path could never leave `unproven`, so it could never be offered.
- **A nested fix cascades:** each caller up to the Flow's step gets its next version, because that chain is what was judged.
- **Extra edits in others' paths, each listed for the lead as it landed:** the IAM catalog (generated), `panel/copy/error-copy.ts` (it turned the refusal into "Something went wrong"), `trial-ports/`, `project-agents/supervisor/plan-input.ts`.

## Defects found on the way, each fixed

1. A part replaced in a run never ran fixed through the real service, owned parts included: the old graph ran again (`call-subflow.ts` set the graph, the owner ran the artifact). **A live bug on today's paths.**
2. Real parts saved with no start check, so none could run, because real controls sit under `selector` and `element`.
3. `exists` passed on look-alike rows, and four clicks were sent; only the domain's resolver stopped them. The checks ask `visible`.
4. A typed search declaring `consequences: none` was claimed as a lasting act, which could have stopped a part at the search.
5. A kept part with no site answered `part.wrong_site` on every run.
6. An output bound to a step's key was never shown to the repair model, so it could not have kept it.

## Limits

- A row cannot be handed two levels down through the grammar: `$input.row` is refused and `$row` is outside a loop there. A Flow looping rows that calls a site part that calls an action works only when the site part reads its own list. The graph form runs; only the script cannot write it.
- A commit step that declared nothing at all still claims an act (D6's disclosed limit), so a first real run may skip it.
- The fixed-value check reads a target's string leaves without knowing what they are. A leaf that is a whole word of the request, such as "button", refuses a lasting part: it fails closed.
- Two deliberate runs over the same row flip a toggle, as a person's would. `ensureState` on the press would make that safe. The spec resets the board between Flows for this reason.
- A rollback leaves a version in the library. It did pass a judged run.
- `incident-repair` now shares `automationStudioPinnedCallStoppedSafely` with the recovery's early refusal, so the two cannot drift.

## Commands run and observed results

Run by me on the final tree, in order. No full suite, per the twice-a-day rule.

```text
packages/fluxiq: pnpm.cmd exec vitest run <the lane's parts, project-parts, handlers, run-part, frames, target-reacquire, live-patch, page-held, early-refusal, row-across-call, flow-script-format, plan-input> --minWorkers 1 --maxWorkers 2
  -> Test Files 42 passed (42); Tests 456 passed (456)
Core root: pnpm.cmd --filter fluxiq check -> exit 0
Core root: node scripts/structure-audit.mjs -> structure-audit: passed (511 warning(s), 1097 baselined).
wc -l service.ts -> 4304
Core root: the four-package build -> exit 0
apps/web: vitest run program-route.test.ts and route.test.ts -> Test Files 2 passed (2); Tests 83 passed (83)
Extension: pnpm.cmd --filter @fluxiq-web-extension/extension check -> exit 0
Extension: node scripts/structure-audit.mjs -> structure-audit: passed (242 warning(s), 552 baselined).
apps/extension: node scripts/test-extension.mjs background/automation-relay/tests panel/library panel/copy/tests -> # pass 40, # fail 0
apps/extension: pnpm.cmd run test:content part-run-job-board.spec.ts pinned-calls-job-board.spec.ts --headed --workers=1
  ok 1 a saved part runs at zero model calls behind its guard: right rows, refused on the wrong page with no site change, and stopped before its lasting step when the page moves
  ok 2 a part presses on each row it read: each intended row exactly once, by identity when rows move, a removed row reported gone with no press, and a second part refused while one runs
  ok 3 a site part and its action part pinned from two Flows: the row crosses the call, each intended job saved exactly once, at zero model calls
  ok 4 a site part and action part written in the script format: the row crosses the call, each intended job saved once, at zero model calls; a candidate trial runs the pin
  4 passed (12.6m)
```

## Not verified

- **A real model:** the shortlist, `core.run_part` in a real evidence loop, and the marking guidance. The end-to-end draft test builds its draft step by hand from the tool's real answer, with the domain, the judge and the shortlist stubbed.
- **The first real run after an attempt, in a browser.** Proven with the real record and a provider-free test, not on a page.
- **Step 7 in a browser.** Real service, real stores, fake host and repair model. A permission gate at dispatch inside a tried version and a newer-version trial inside a repeat were not exercised.
- **The panel's Library tab with real data.** The readers are held against real answers in the spec, and the port is on, but no spec opens the tab over a real library.
- **Firefox and the other nine scenarios.** All browser proof is job-board in Chromium.
- **A Flow's run with a row gone mid-run, in a browser:** engine tests with fakes only. A part's run is proven there.
- **Full suites.**

## Open questions

None block merging.

1. The paid two-task lane on one site is the next thing the library needs. It is what says whether offers save money and whether they pull a model into near-matches. A wrong-meaning case should be in it.
2. Detection during exploration stays out, as the brief said, until precision is measured.

## Budget

11 reporting workers against "about 7", all at the agreed tiers: `worker` for w1, w2, w3, w6, w9, w11, and `worker-heavy` for w4, w5, w7, w8, w10, plus one step 7 worker stopped by the session restart. No escalations. The growth came from the lead's added fixes and the two gaps that step 6 closed.
