# w6: saved read lost its price column on attempt 2 (run-mw49972k-cebf67e5)

## Outcome

Blocked, cause established and reproduced. The column is not dropped in the saved-read binding or in
`plan-resolution/extraction/**`. The saved read resolves to title and price on every domain path I tried.
It is dropped later by two things outside my grant working together: Core's Flow assembly declares a
record-output schema from the instruction's column list, and that list stops at "title". The domain's
dispatch then cuts the read down to that schema. Per the brief, I edited nothing and report the files and lines.

## The cause, step by step

Instruction (judge step 0022): "...with columns title and price exactly as the shop shows them."

1. **Core's instruction-column parser returns `["title"]`.**
   `!FluxIQ/packages/fluxiq/src/runtime/flow-authoring/bootstrap/answerability/instruction-columns.ts`
   lines 34 and 46-63. The list after "columns" splits into "title", " and ", "price exactly as the shop shows them".
   The second part is 7 words, more than `MAX_COLUMN_WORDS` (3). Line 60 then `break`s, so "price" is not kept
   and is not reported as unmatched either.
   Observed: `node --experimental-strip-types <scratch>/w6-columns.mjs`, which imports that exact file and runs it
   on the task's words, printed `["title"]`.
2. **Core's assembly declares that as the read's schema.**
   `!FluxIQ/.../bootstrap/authoring/assembled-record-output.ts` lines 56-72:
   `asked = authoringInstructionRecordColumns({named:["title"], fieldKeys:["title","price"]})`, which gives columns
   `[title]`, unmatched `[]`. The record output is normalised with `columns: asked.columns`, so the schema is `[title]`.
   Because unmatched is empty, no `record_output.named_column_unmatched` warning is raised (lines 74-82).
   The saved Flow runs through this assembly (`answer-first/flow-run/assemble.ts`, which calls
   `checkAutomationStudioFlowBootstrapCompletion` with `instructionText`, which calls `assemble-draft.ts:173-174`).
   Attempt 1's live read (step 0018) and attempt 2's re-read after the amendment (step 0028) were plain
   `core.run_node` calls, which never go through assembly. So both of those kept price.
3. **The domain's dispatch cuts the read to that schema, with no error.**
   `!FluxIQWebExtension/domain/src/output-nodes/extract-list/declared-columns.ts` lines 96-120 and 128-140.
   A schema whose ids are all keys of the field map counts as declared columns. Every other read-as-column field
   is treated as a "helper" and removed from the request (lines 102-107) unless an ordering names it.
   This is applied in `dispatch.ts` lines 142-146 and 156-158. The page never reads price and nothing reports it.
   The rows carry no price key. Core's answer-first rows take columns from row keys
   (`answer-first/rows/carried-columns.ts`), so the judge saw `columns: [title]`.

Why title survives: it is the one name the parser kept, and it is a key of the field map.

## Evidence that the saved-read binding is not the cause

I wrote a scratch domain test, since deleted. It ran detect, then a read by handle with
`{title: "a_css-1yqh7nh", price: "span_currency_amount"}` on a structure written from the fixture's markup
(`apps/scenario-lab/.../pages/seller.ts:14`: `<li><a class=link>title</a> · <span>£..</span></li>`), then:

- `ranWith` held `extractionBinding` with all three detected columns (`a_css-1yqh7nh`, `a_css-1yqh7nh_url`, `span_currency_amount`).
- `resolvePlanNodeParameters(ranWith)` resolved to `fields: {title, price}`, both in the same process and in a fresh one.
- `webAutomationExtractListDispatch` of those resolved parameters sent `fields: {title, price}`.
- The same parameters plus `recordOutput: {datasetId, writeMode: "append", schema: {fields: [{id: "title"}]}}`
  dispatched `ok: true` with `extractList.fields: {title}` only, and a stored schema of `[title]`. That is the run's symptom exactly.

The flow id (`flow.b6bb36d5...`) and project were the same in both attempts. So the handle store and the saved
binding agreed anyway.

## Item 3 of the brief (fail, never fewer columns)

The resolver already fails a saved column it cannot find. `columns.ts` `unknownColumn` refuses with
`web.handle.unknown_field` and issues that name the field. `slot.ts` passes that on as a refusal, so a replay
whose binding lacks a written column fails and never returns a shorter row. One caveat: pass two of
`keptWebExtractionColumns` may substitute the nearest remaining column, which is recorded as an assumption.

The silent drop in this run is not a failure to resolve. It is a deliberate narrowing in `declared-columns.ts`,
fed by a truncated parse in Core. Making it an error belongs in those files, not mine. Refusing every narrowing
inside `plan-resolution/extraction/stored-columns.ts` (`webPlanUndispatchable`) would break the case
declared-columns exists for: run 12, where it drops filter-only helpers.

## Suggested fixes (the lead's call; all outside my grant)

- Core, `instruction-columns.ts:60`: a part that opens with a name and goes on as a clause
  ("price exactly as the shop shows them") should yield "price", or end the list as unparsed so nothing is declared.
  It should never be dropped while earlier names stay.
- Core, `assembled-record-output.ts:57-65`: declare no schema when the parse may be incomplete, or keep every read field.
- Domain, `declared-columns.ts:102-104`: treat as helpers only the fields a `where`, sort or dedupe uses, which is what
  run 12's plus and ad were. A field the read keeps for no other role should stay. Short of that, a narrowed column
  should be reported by name, for example in the dispatch's result. Today nothing says it.
- Regression test (not written, outside my paths): the domain dispatch of `{title, price}` with schema `[title]` and no
  condition on price should still read price, or fail with a code naming price. Plus a Core test that this
  instruction's columns are `["title","price"]` or `[]`, never `["title"]`.

## What changed and why

Nothing. A scratch probe test (`plan-resolution/extraction/tests/w6-probe.test.ts`) and its build directory
`domain/.test-build-scratch/t877-w6` were created and deleted. `git status --short` afterwards shows only the
lead's untracked debug note.

## Commands run and observed results

- `DOMAIN_TEST_BUILD_LABEL=t877-w6 node scripts/test-domain.mjs extraction/tests/w6-probe` (in domain/) -> `# pass 1`.
  It printed the resolved and dispatched requests quoted above, with title and price without a schema and title only with schema `[title]`.
  A first variant without datasetId and writeMode dispatched `record_output.invalid`, which was my input error, then fixed.
- `node --experimental-strip-types <scratchpad>/w6-columns.mjs` -> `["title"]`.
- `git status --short` -> `?? docs/working/language-driven-flow-loop-plan/debugs/run-mw49972k-cebf67e5.md` (not mine).
- `pnpm --filter @fluxiq-web-extension/domain check` and `node scripts/structure-audit.mjs` were not run: no file changed.

## Not verified

- The saved Flow's actual assembled node was not seen. The Lab kept no saved-flow or task-memory file for this run.
  Step 2 is inferred from Core's code and the parser's real output, and it matches every observation:
  8 rows, title only, no failure, both live reads kept price.
- The real page's detected selectors. I modelled them from the fixture markup. The cause does not depend on selectors.
- No browser or fixture-page replay. A domain test cannot load the extension's page reader. A real-page replay
  needs the content harness under `apps/extension/e2e`, which I was told not to touch.

## Open questions or contradictions

- The debug note says the cause is "in the saved-read binding (`plan-resolution/extraction/**`)". The evidence says otherwise.
- Item 4 of the brief, a replay on the real fixture page, is not possible in my folders. It belongs to the content harness.
