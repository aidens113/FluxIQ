# Lane B: the act named on a read (wasted decision 0021-0022)

## Outcome
Done. Cause found and a two-part wording patch proposed. The patch was checked against scratch copies of the two source files, with nothing written in the tree. No source file was edited.

## Cause (file:line, t876 tree)
1. **Checklist (main cause).** `instructed-acts/instruction-acts.ts:151` reads "give|list|show|tell me what is in my <place>" as an act of kind `open`, meaning "open the place the instruction reads from" (`contracts.ts:47`). This is deliberate, and `tests/instruction-acts.test.ts:12,16,18` and `tests/check.test.ts:27` pin it. An `open` act is done by a kept step that changed something (`step-fault.ts:80-85`), meaning the press or navigation that brought the place up, never the read. The checklist (`checklist.ts:234-239`) shows only `id`, `verb: "give"` and the read-out's words ("give me what is in my cart ... as a table ..."). It never says the act is an opening. The prompt says "name an act only on a step whose does is that act". No press's `does` matches "give ... table", but the read's `does` ("item, quantity and price") does. So the model named a1 on the read, both on the `run_node add` at 0019 and on the amend at 0021, in both runs.
2. **The act sent with the read is dropped silently.** At 0019, `evidence-loop.ts:189` drops `act` on an added read (`effect !== "mutate"`) without telling the model. The checklist still showed a1 as `no_step_added`, so the model sent `{10, keep, act a1}` at 0021. `amendment/apply.ts:187-188` refused it as `act_on_a_read` and `applied: 0`, and that refusal counted toward the no-progress limit.
3. **The refusal's way out points the wrong way for an opening.** `llm/draft-amendment-feedback/fallback.ts:80-88` (`actOnRead`) looks only for a press after the read. For an `open` act the right step comes before the read: step 8, "Go to Cart". The model was told "No step after step 10 does an act yet: run the press that does it", which contradicts what it is trying to do. It completed instead.
4. **Why the run still passed.** Since t195 the checklist is information only, not a gate (`checklist.ts` header). A completion is refused only by `permission.ts`, and an `open` act carries no consequence. The judge passed both runs (0024).

Q2, the prompt (0021 request.txt line 62): "acts lists what the person asked to be done, in their words: say which act a step does with act ... name an act only on a step whose does is that act." Line 40 also says the Flow "is ready only when every act on that entry's acts checklist is done". That second sentence contradicts t195, and both runs completed with a1 still todo. The patch below does not change it.
Aside: in this instruction neither "make ... three packs" nor "add one ... sold by Brightaisle" (no "to my cart") was read as an act. That follows the one-sided bias the parser keeps by design, but it means the only act on the checklist was the read-out.

## Proposed patch (the files use CRLF; hunks shown with LF)
Part A, `packages/fluxiq/src/runtime/flow-authoring/bootstrap/instructed-acts/checklist.ts`:
```diff
@@ (type AutomationStudioInstructedActChecklistItem, ~208)
   drop?: number[];
   dropSaid?: string;
+  /**
+   * An act of opening that no step does yet: which step does it -- the one
+   * that brought the place up -- and that the read of it does none
+   * (`openSaid`). Information, never a todo.
+   */
+  openSaid?: string;
 } & AutomationStudioInstructedTodoDetail;
@@ (~238)
-      ...(once ? { drop: once.drop, dropSaid: once.said } : {})
+      ...(once ? { drop: once.drop, dropSaid: once.said } : {}),
+      ...(act.kind === "open" && !(stood && "done" in stood) ? { openSaid: openSaid(act.id) } : {})
     };
@@ (before `function shown`, ~251)
+// An act of opening is read from a read-out of a place (`./instruction-acts.ts`:
+// "give me what is in my ..."), and the checklist showed only that verb and the
+// read-out's words, so the model named it on the read, where `act_on_a_read`
+// cannot record it (lane B, `run-mw43nq03-285153fa` and `run-mw4415ke-8ac2857a`,
+// steps 0019-0022: one decision of twelve spent, and counted without progress).
+/** How an act of opening is done, for the model: by the step that brought the place up, never by the read of it. */
+function openSaid(id: string): string {
+  return `${id} asks only that the Flow open the place the person reads from: the step of the Flow that brought that page up -- the press or navigation that opened it -- does ${id}, and the read of it does no act. Name ${id} on that step, as you add it or with keep.`;
+}
+
 /** An act or choice as the checklist shows it: the step that does it, or why none does and the step judged. */
```
Part B, `packages/fluxiq/src/runtime/llm/draft-amendment-feedback/fallback.ts` (`actOnRead`):
```diff
   const lead = `Step ${n} only reads, so the act was not recorded on it; the rest of that change was made.`;
+  // An act of opening the place a read reads is done before it, by the step that brought its page up (`../../flow-authoring/bootstrap/instructed-acts/checklist.ts`, `openSaid`).
+  const opener = steps.filter((step) => step.position < n && step.disposition === "kept" && step.effect === "mutate" && step.effectApplied !== false).at(-1);
+  const opening = opener ? ` An act of opening the place step ${n} reads is done by the step that brought its page up: {"step": ${opener.position}, "change": "keep", "act": <the act>}, if step ${opener.position} opened it.` : "";
   const press = steps.find(...);
-  if (press) return `... if step ${press.position} is that act's press.`;
+  if (press) return `... if step ${press.position} is that act's press.${opening}`;
   ...
-    ? `${lead} No step after step ${n} does an act yet: run the press that does it as a new call with add true and its act.`
+    ? `${lead} No step after step ${n} does an act yet: run the press that does it as a new call with add true and its act.${opening}`
```
The refusal itself is unchanged, and an act is still never recorded on a read. Part A is the fix. Part B only stops the way out from contradicting it, and can be dropped if you want the smallest change.

## Tests to add
In `instructed-acts/tests/checklist.test.ts`, inside `describe("the acts checklist")` (the file already has `step` and `TABLES`):
```ts
  // Lane B, `run-mw43nq03-285153fa` and `run-mw4415ke-8ac2857a` (0019-0022): a read-out of a
  // place is an act of opening it; shown only its verb, the model named it on the read.
  it("tells an act of opening not done yet that the step which brought the place up does it, never the read", () => {
    const SHOW = "Show me what is in my basket, as a table with columns name and price.";
    const read = step(2, { actionId: "web.dom.extract_list", effect: "observe", proposes: true });
    const [todo] = automationStudioInstructedActsChecklist({ instructionText: SHOW, draftSteps: [step(1), read] })!;
    expect(todo).toMatchObject({ id: "a1", verb: "show", todo: "no_step_added" });
    expect(todo!.openSaid).toBe("a1 asks only that the Flow open the place the person reads from: the step of the Flow that brought that page up -- the press or navigation that opened it -- does a1, and the read of it does no act. Name a1 on that step, as you add it or with keep.");
    expect(automationStudioInstructedActsChecklist({ instructionText: SHOW, draftSteps: [step(1), { ...read, acts: ["a1"] }] })![0]).toMatchObject({ todo: "step_only_reads", openSaid: todo!.openSaid });
    const [done] = automationStudioInstructedActsChecklist({ instructionText: SHOW, draftSteps: [step(1, { acts: ["a1"] }), read] })!;
    expect(done).toMatchObject({ done: 1 });
    expect(done!.openSaid).toBeUndefined();
    expect(automationStudioInstructedActsChecklist({ instructionText: TABLES, draftSteps: [] })!.map((item) => item.openSaid !== undefined)).toEqual([false, true]);
  });
```
In `llm/decision-handlers/tests/refusal-way-out.test.ts`, inside the W2 `describe`, after "names the press after a read an act was put on":
```ts
  // Lane B (`run-mw43nq03-285153fa`, 0022): an act of opening named on the read of the page it opened.
  it("names the kept step before a read as the one an act of opening it is named on", () => {
    expect(told({ step: 2, reason: "act_on_a_read" }, undefined, steps.slice(0, 2))).toContain(`{"step": 1, "change": "keep", "act": <the act>}, if step 1 opened it.`);
    expect(told({ step: 2, reason: "act_on_a_read" })).toContain(`{"step": 3, "change": "keep", "act": <the act>}`);
    expect(told({ step: 1, reason: "act_on_a_read" })).not.toContain("An act of opening");
  });
```

## Narrow checks to run after applying
- `pnpm --filter fluxiq exec vitest run src/runtime/flow-authoring/bootstrap/instructed-acts/tests/checklist.test.ts src/runtime/llm/decision-handlers/tests/refusal-way-out.test.ts src/runtime/llm/tests/draft-amendment-feedback.test.ts src/runtime/llm/harness-options/tests/draft-acts.test.ts src/runtime/llm/evidence-progress/tests/stall-redirect.test.ts`
- `pnpm --filter fluxiq check` (typecheck) and the structure audit (checklist.ts goes from 362 to ~378 lines: under the 400 warning and the 800 limit).

## Commands run and observed results
- Read the run files: `run-mw43nq03`, 0019 and 0021 `decision.json` (act a1 on `dom-extract_list`; then `{10, keep, a1}`) and 0022 `result.json` (`act_on_a_read`, applied 0, `stepsWithoutProgress: 1`). `run-mw4415ke` shows the same sequence. The 0021 draft: step 3 "2 items in cart", step 8 "Go to Cart", step 9 a look, step 10 the read. Nothing in the 0021 request says the act sent at 0019 was dropped.
- `node --experimental-transform-types <scratchpad>/open-act-probe.mjs` (the real parser and checklist): SHOW gives `[{"id":"a1","kind":"open","verb":"show",...}]`. The checklist shows `todo: no_step_added`; `done: 1` when a1 is named on the press; `todo: step_only_reads` when named on the read.
- `node --experimental-transform-types <scratchpad>/open-act-patch.mjs` (the patch applied to scratch copies, imports pointing into the tree). Every edit anchor matched exactly once. Output: `openSaid` is present before a1 is done, survives `ChecklistValue`, is absent once done, and the TABLES save act has none (`[["a1",false],["a2",true]]`). The run's case now reads `...run the press that does it as a new call with add true and its act. An act of opening the place step 10 reads is done by the step that brought its page up: {"step": 8, "change": "keep", "act": <the act>}, if step 8 opened it.` The W2 fixture strings still contain the existing expected text, and step 1 gets no opening sentence.

## Not verified
- vitest, tsc and the structure audit were not run. The tree is read-only for this brief and the tests are not in it yet.
- Whether the model will now name a1 on the press that opens the place: that needs a live run.
- Lane A (t875) and lane C (t877) logs have no entry for this cause.

## Risks and open questions
- The model may still name the act on the read, because the checklist is information. If it does, Part B makes the next decision useful (`keep act` on the opener) rather than wasted. `openSaid` adds about 50 words to each decision while an `open` act is undone, and the build-test judge sees it too (`result-verification/build-test/summary.ts:291`).
- Part B picks the last kept press before the read. That may be a press made on the page, such as a quantity "+", rather than the one that opened it, which is why the sentence is hedged. An `open` act named there would show done (act-evidence does not judge `open` acts). This is information only and does not affect completion.
- Left alone: `evidence-loop.ts:189` still drops an act sent with an added read without a word to the model. Saying so in that call's result would close the gap fully but changes the loop, so it is not included here. The prompt sentence "ready only when every act ... is done" still contradicts t195.

```text
Outcome: Done
Changed: docs/working/answer-first-plan/reports/live/lane-b/act-on-read.md (report only; no source edited)
Validation: `node --experimental-transform-types open-act-patch.mjs` (patch on scratch copies) -> openSaid on undone open act only; run case names step 8; existing toContain strings intact. vitest/tsc not run (read-only brief)
Not verified: vitest, typecheck, structure audit, live model behaviour
Report: C:/Users/osrs_/FluxStuff/fxwork/t876/!FluxIQ/docs/working/answer-first-plan/reports/live/lane-b/act-on-read.md
Notes: Cause: "give me what is in my <place>" is an `open` act (instruction-acts.ts:151), but the checklist shows only verb "give" and the read-out's words, so the model names it on the read.
Fix: an `openSaid` line on undone open acts (checklist.ts) plus a backward way out in actOnRead (fallback.ts:80).
Not fixed: the silent drop at evidence-loop.ts:189.
```
