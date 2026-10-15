# t625 report: a repair's opening withholds the domain's denied keys

Branch `task/t625-repair-context-withholds-denied-keys`, Core worktree `C:/Users/osrs_/FluxStuff/fxwork/t625/!FluxIQ`. Nothing committed.

## Outcome

Done. A repair's `repairOf.yourSubflow` now shows each resolved step's `parameters`, and any `plan` its builder sent, with the bound domain's denied keys withheld. Where something was removed, it carries `withheld: AUTOMATION_STUDIO_LLM_DRAFT_WITHHELD_NOTE`. The opening packs through the real context packet without being refused.

The proposal Core keeps is not touched. The packet's refusal (`llm.request.evidence_denied_key`) stays as the guard for everything else. A new test shows that the same opening, unscreened, is still refused there.

## What changed and why

Paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

- **`llm/harness/draft-screen.ts`.** The key-removing walk is split out into an exported `automationStudioLlmValueWithoutDeniedKeys(value, deniedKeys): { value, withheld }`.
  - It returns the value it was given, untouched, when it removes nothing or the domain denies nothing.
  - The draft entry function now calls it, so there is one walk.
  - `context-packet.ts` needed no change: it still calls the draft entry function.
- **`llm/harness/index.ts`.** The barrel exports the new helper (one line). This was needed so the dispatcher can import it. The brief did not list the file; see Open questions.
- **`project-agents/dispatch/types.ts`.** `AutomationStudioProjectBuilderPorts` gains a required `deniedEvidenceKeys: readonly string[]`.
  - It is required, as the binding's own field is, so no ports reach the dispatcher without the declaration.
  - The brief named `port.ts`, but the builder ports type is in `types.ts`. `port.ts` is the supervisor-facing dispatch port and is unchanged; see Open questions.
- **`project-agents/dispatch/run-brief.ts`.**
  - `run()` passes `ports.deniedEvidenceKeys` to `repairOf()`, and `repairOf()` passes it on to `yourSubflow()`.
  - `yourSubflow()` maps each node's parameters, and `plan`, through the helper on a `structuredClone`, then adds `withheld` when anything was removed.
  - The header gains a t625 paragraph.
- **`service/project-build/brief-ports.ts`.** The builder ports return `deniedEvidenceKeys: binding.deniedEvidenceKeys` (one line plus a comment).
- **Tests.**
  - `project-agents/dispatch/tests/repair-opening.test.ts`: `scripted()` takes the ports' keys, and a new describe block "a repair brief's opening, shown the subflow it repairs (t625)" has 3 cases:
    - The precondition: with the ports declaring `[]`, `yourSubflow.steps` carry `selector`, the fixture's `.filter`, and `screen(...).deniedKey === true`.
    - With the web list declared, `screenAutomationStudioLlmEvidence(opening.repairOf, ["selector"]).deniedKey === false`, `withheld` is the note, and the script and node ids are kept.
    - The opening's evidence goes through the real `packAutomationStudioLlmContext` with the web denied list and is not refused, and the packed `yourSubflow` carries `withheld`. The unscreened opening (ports `[]`) is refused there with `llm.request.evidence_denied_key`, the same failure the live runs hit.
  - `llm/harness/tests/draft-screen.test.ts`: 2 helper cases. One covers removal at any depth with case-normalized key matching, the count, and the input left untouched. The other covers getting the same reference back when nothing was removed or the denied list is empty.
  - `deniedEvidenceKeys: []` added to the builder-port literals in `dispatch/tests/{brief-ending,brief-loops,brief-thrown-after-yes}.test.ts`, `dispatch/tests/dispatch-fixture.ts` and `service/project-build/tests/project-build-call-shares.test.ts`. This was required by the new field.

## Commands run and observed results

All were run from `packages/fluxiq` unless noted. `R` is the runtime directory.

- **`npx vitest run $R/project-agents/dispatch/tests/repair-opening.test.ts`:** 10 passed.
- **Regression check.** I temporarily changed `run-brief.ts` to pass `[]` to the helper, then restored it from a scratch copy, and the diff was confirmed back.
  - Result: 2 failed, 8 passed.
  - The failures were "withholds the domain's denied keys..." and "is packed through the real context packet without refusal...".
  - So the new tests catch the regression.
- **`npx vitest run $R/project-agents $R/llm/harness $R/service/project-build`:** Test Files 97 passed (97), Tests 710 passed (710), 94 s.
- **`npx tsc --noEmit -p .`:** exit 0, no output. Before I added the field to `repair-opening.test.ts`, the only error was TS2741 there, which confirms the required field reaches every builder-port literal.
- **`node scripts/structure-audit.mjs`** (repository root): "structure-audit: passed (365 warning(s), 1156 baselined)". The only touched file it flags is an advisory `brief-ports.ts: 446 lines`, which was 445 lines and already past the 400-line threshold before this change.

## Other evidence items assembled outside the screened draft entry (the brief's question)

I walked each item a builder, repair, reset or the supervisor is shown that Core assembles beside a tool result. Every item below already goes through the packet's whole-item refusal; the question was whether any carries the Flow's resolved parameters the way `yourSubflow` did.

| Item | Where | Carries resolved parameters? | Action |
| --- | --- | --- | --- |
| `repairOf.yourSubflow.steps`, `.plan` | `dispatch/run-brief.ts` | Yes (the defect) | Screened (this task) |
| `repairOf` failedStep / said / interruptions | `contracts/subflow-brief.ts` `failingTrial()`, from trial feedback | No. It is the trial's own step record (label, node id, control, failure code), the same feedback the builder's own test tool answer carries. Both live runs show no denied key there. | Left refused-whole: it is run output, not authored parameters |
| `phaseStart` | `service/project-build/phase-start-told.ts` | No: act ids, `did` text, location, predecessor keys | None |
| `entry`, `outsideBrief` notes | `brief-ports.ts` `entryNote()`, `told()` | No: Core's words, subflow keys, consequence names | None |
| Reset task instruction | `brief-ports.ts` `resetTask()` | It embeds `JSON.stringify(act.call)`, the model's own call input, as instruction text, not as an evidence key | None. It is not evidence and is the model's own input. See Open questions |
| Supervisor `project.assemble` answer | `supervisor/assemble-tool.ts` | `refusal: submitted.check.feedback`, the submission check's feedback, the same shape the builder's submit tool answers with; no node parameters assembled in | None (outside my ownership in any case) |
| Rerun retained-path metadata | `llm/evidence-loop/rerun-request.ts` | Already screened by `automationStudioRerunScreenedPaths` | None |

## Not verified

- No live run (per the brief). I did not check that a live repair now gets past its first turn.
- I did not read all of `project-agents/supervisor/**`; the supervisor rows rest on a grep for `parameters` / `.nodes` and on reading `assemble-tool.ts` lines 30-70.
- I did not run full suites (`pnpm check`, `pnpm test`) or the web domain's tests. Downstream ports built outside Core would now need `deniedEvidenceKeys`; `tsc` covers Core only.

## Open questions or contradictions found

1. **The brief named `project-agents/dispatch/port.ts`; the builder ports type is in `types.ts`.** I added the field to `types.ts`, the only place it can go, and left `port.ts` unchanged. I also touched `llm/harness/index.ts` (one barrel export) and five test files that build builder-port literals. None of these is on the "Must not touch" list.
2. **The withheld note's last clause reads slightly off for `yourSubflow`.** The note ends "a step kept as it is keeps them". That is literal for the draft. A repair, though, resubmits a whole script, and its steps resolve their locators from the handles in that script. Core's accepted proposal does keep its locators, so the sentence is true of the proposal, but a repair that keeps a step must still re-find its handle (`YOUR_SUBFLOW_NOTE` already says so). The brief asked for the existing note; a `yourSubflow`-specific wording may read better.
3. **`resetTask()` puts the model's own call JSON into instruction text, which no key screen sees.** It is model-authored and not page payload, so I left it.
