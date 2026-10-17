# t691 extra rows need a reason: worker report

## Outcome

**Partial.** Fix 1 is done and verified inside the files I own. Fix 2 is written and unit-tested in the files I own, but the second call does not ask it yet. `verify.ts` builds that call, and it is not in my ownership list. The brief put the converse ask in `agreement/ask-again.ts`, but that file only decides *whether* to ask again; `verify.ts` makes the call with the same request. Line words for the new rows also need one branch in `verdict/unquoted-line.ts`, which I don't own either.

I wrote both edits as a patch (Appendix A), plus the two existing tests whose expectations change because of them. I did not apply it to the worktree. In an isolated sandbox copy of `packages/fluxiq` (my changes plus the patch), `tsc` and the three named vitest directories pass. `git apply --check` against the worktree passes.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/`.

### Fix 1: rows another read stored are no longer "also in the result"

- `request-rows/summary-reads.ts`
  - Adds `automationStudioRequestRowsStoredOf(set)`. This is the old private `storedRows`, now exported.
  - Adds `automationStudioRequestRowsStoredBy(recordSets)`. Given a read's node id and a label it left out, it returns the other reads that stored that label. It returns nothing when:
    - the same read stored a copy, or
    - the label is not stored, or
    - a set holding the label names no collector (no `processing.passes`).
  - A record set's collectors are the read nodes its `processing.passes[].node` names.
  - A run's read now carries `storedElsewhere: [{ label, by }]`. `inResult` is unchanged, so `checked-rows.ts` and `left-out-naming-the-item.ts` read exactly as before.
  - Why the unknown-collector rule: every existing fixture has record sets without `processing`. Treating those as "same read" keeps t624's behaviour where Core cannot tell.
- `request-rows/types.ts`
  - Adds `AutomationStudioRequestRowsRead.storedElsewhere`.
  - Adds `AutomationStudioRequestRowsUnquoted.stored` (the reads that stored the rows).
  - Adds `AutomationStudioRequestRowsStoredMark = { storedThoughLeftOut?, storedAnyway? }`. These are fields on the judge's copy of a condition. I defined them here because `read-condition.ts` is not mine; see Open questions.
- `request-rows/summary-with-also-in-result.ts`
  - A left-out row is marked `leftOutAlsoInResult` only when its stored copy came from the same read's own record set, or from a set with no named collector.
  - When only other reads stored it, it is listed in `storedThoughLeftOut`, with `storedAnyway`. That sentence says: "In this read, condition N (...) left the rows in storedThoughLeftOut out of what the Flow acted on, and read <node> stored them ... A yes names each of them in a sentence that names read <node> by its nodeId and quotes ... the request's own words that ask for that row in the answer. Where the request does not ask for a row in its answer, the result should not hold it, and the answer is no."
- `request-rows/summary-with-row-ids.ts`: such rows get Core's `[row XXXXXX]` id even when they are settled, because a yes must name them.
- `request-rows/unquoted-rows.ts`
  - The `inResult` exemption now excludes rows another read stored. Those rows are held to the left-out rules like any other left-out row: an exclusion quote, or for settled rows the one quote of the bound.
  - They must also each be named in an accounting sentence that names a read that stored them and quotes the request. The quote may be in that sentence, or lent from a neighbouring sentence that names no row, as before.
  - The quote test is the kept-row one: any of the request's words that carry something.
  - A yes that does not do this gets an entry `{ ..., rows, stored: [<nodes>] }`. `verdict/` already holds a yes over any unquoted entry (`exclusion_evidence_missing`, `yesUnconfirmed`), and the exclusion-evidence recheck already asks for exactly this when "a line names rows the result keeps". So with no verdict change, the yes is not taken.
  - Internals: `accountingSentences` now returns `{ text, beside }`, where `beside` is the sentence plus the neighbours that lent it a quote. `carryingQuote(wording)` is shared with the kept-row check.
- `request-rows/row-naming.ts`: adds `automationStudioRequestTextNamesRead(text, nodeId)`. A reply names a read by its whole node id, or by its last dot-separated part as a whole token, ignoring case (`s14` names `...confirm_requests.s14`; `s140` does not).
- `request-rows/stored-line.ts` (new): `AUTOMATION_STUDIO_REQUEST_ROWS_STORED_LINE_OPENING` and `automationStudioRequestRowsStoredLine(entry)`, Core's line for such rows: "The check answered yes without saying why the result keeps these N rows, which condition N (...) left out of what the Flow acted on (Read X) and read Y stored -- rows. Name each in a sentence that names read Y and quotes ... the request's own words asking for each row in the answer. A row the request does not ask for in its answer is one the result should not keep." It never says "the condition", which `checked-rows-named.ts` would parse.
- `request-rows/index.ts`: exports `stored-line.ts`; header updated.
- `agreement/said.ts`: a yes held with a stored line in `exclusionEvidenceMissing`, or refused with one in `repair.checked` and no reading of its own, now reads "that it does what was asked, without saying, beside the read that stored each, why the result keeps the rows a condition left out of what the Flow acted on".
  - The brief said `said.ts` enforces the rule "as for `leftOutNamingTheItem`". It doesn't: `said.ts` only words a verdict. The enforcement is `unquoted-rows.ts` read by `verdict/result-verdict.ts`, as it is for `leftOutNamingTheItem`.

### Fix 2: the confirming call asks the converse

- `agreement/ask-again.ts`: adds `automationStudioResultVerificationConfirmingAsk(first, summary, { confirmAnswer })`.
  - It applies when `confirmAnswer` is set, the model's first answer was yes (taken or held, via `first-ask/model-said.ts`), and a second call is due.
  - It returns the converse question. The question lists each record set's stored rows by label ("<datasetId>, stored by read <node>, N rows[, K not shown here]: a | b | ...") and asks, for each row, whether the request asks for it in its answer, quoting the words that do. A yes is allowed only if every stored row is asked for and nothing is missing.
  - Record sets only a subflow trial's entry collected are left out, as `summary-reads.ts` leaves them out. A result with no stored rows is asked the same about its acts.
  - It returns nothing for every other second call. `automationStudioResultVerificationAskAgain` is unchanged.
- `agreement/index.ts`: header paragraph for t691. The barrel already exports `ask-again.ts`.
- `first-ask/confirmed.ts`: the trail gains `secondAsked?: "converse" | "same"`, and `"same"` withholds `firstAskConfirmed`. Absent is read as before t691, so the tree stays green until `verify.ts` passes it. With the patch, `verify.ts` always passes it.
- `first-ask/index.ts`: says how t677's meaning holds under the new ask.
  - The flag still means the first ask's yes, confirmed by the second check, with nothing re-asked of a different verdict. That is now actually true, because the second check is independent.
  - The converse is the second check itself, not a re-ask, so it adds nothing to `reasks`. A held yes's in-check recheck clears nothing, as before.
  - The one new condition: a second check that repeated the same question confirms nothing, so the flag is withheld.
- What the patch adds (Appendix A): `verify.ts` puts the converse on the second call's copy (`summary.recheck`). It screens the converse with `screenAutomationStudioLlmEvidence` against `deniedEvidenceKeys`, as the exclusion-evidence recheck is screened. If screening fails, or no keys are given, the call is a repeat and `secondAsked: "same"`, so the yes is never called first-ask confirmed. The patch also passes `secondAsked` to `automationStudioResultFirstAskConfirmed`. `verdict/unquoted-line.ts` returns `automationStudioRequestRowsStoredLine(entry)` for an entry with `stored`.

### Tests (all new tests use the library site; no scenario words)

- `request-rows/tests/renewals-fixture.ts` (new): the trial's judge input paraphrased to a library.
  - The request: renew every loan at least 5 days overdue; then table every loan the list now shows as renewed.
  - Read `...s8` has `daysOverdue atLeast 5` and four settled left-out rows. Read `...s14` has no condition and stores all eight. Each record set's `processing.passes` names its read.
  - Judge 0032's yes is paraphrased, and an "explained" yes is provided for a variant request that asks for every loan.
- `request-rows/tests/stored-though-left-out.test.ts` (new, 11 tests): `StoredBy` (other read; same read, unstored and no-collector cases give none); the judge's copy (`storedThoughLeftOut` and `storedAnyway`, never also-in-result; same-read copy still also-in-result; ids given to settled rows); `unquoted-rows` (0032's reply held with `stored`; explained yes taken; a quote without naming the read held; the bound quote still owed); the line words; read naming.
- `request-rows/tests/renewals-replay.test.ts` (new, 3 tests): 0032's yes through `automationStudioResultVerdict` is now `unsure / model_unconfirmed / exclusion_evidence_missing / yesUnconfirmed`, not `answers`; the copy never calls the four "another copy"; the explained yes over the every-loan request is `answers`.
- `agreement/tests/ask-again.test.ts` (new, 7 tests): the converse lists rows by set and storing read; counts unshown rows; leaves out entry-only sets; asks about acts when nothing is stored; is asked of a held yes; is not asked of a no, an unsure, an unavailable call or a runtime check; `AskAgain` is unchanged.
- `agreement/tests/said.test.ts` (new, 3 tests): the held and refused words; unchanged words otherwise.
- `first-ask/tests/first-ask.test.ts`: two new cases (`"same"` gives false; absent gives the legacy true).

### Existing tests whose expectation changes

- `first-ask/tests/first-ask.test.ts`: the default `trail()` now carries `secondAsked: "converse"`, so the "confirmed" case models the new ask. No existing assertion changed its result.
- With the patch only:
  - `build-test/tests/judge.test.ts` ("yes, yes is yes ..."): it asserted `seen[1].context` equals `seen[0].context`. Now the two are equal except for `resultSummary.recheck`, which carries the converse question, because the confirming call no longer repeats the request.
  - `build-test/tests/request-size.test.ts` (its helper): the same change, for the same reason.
- No other existing test in `result-verification`, `service/candidate-trial` or `service/subflow-trial` changed. All pass with and without the patch.

## Commands run and observed results

Run from `C:/Users/osrs_/FluxStuff/fxwork/t691/!FluxIQ`:

- **Baseline before edits:** `npx vitest run src/programs/automation-studio/runtime/result-verification` (in `packages/fluxiq`) printed `Test Files 124 passed (124)`, `Tests 1030 passed (1030)`.
- **Typecheck:** `npx tsc --noEmit -p tsconfig.json` (in `packages/fluxiq`) exited 0 with no output.
- **Named suites:** `npx vitest run src/programs/automation-studio/runtime/result-verification src/programs/automation-studio/runtime/service/candidate-trial src/programs/automation-studio/runtime/service/subflow-trial` (in `packages/fluxiq`) exited 0 and printed `Test Files 158 passed (158)`, `Tests 1262 passed (1262)`.
- **Structure audit:** `node scripts/structure-audit.mjs` printed `structure-audit: passed (396 warning(s), 1155 baselined).`
  - An earlier layout failed it. First, `request-rows/` had 30 files against the 25-file limit. Then a `request-rows/stored/` directory exceeded the 9-segment depth limit.
  - The final layout adds one file to `request-rows/` (now 24 files) and folds the helpers into `summary-reads.ts`, `row-naming.ts` and `ask-again.ts`.
- **Fix-off run:** I put the HEAD versions of `summary-with-also-in-result.ts`, `summary-with-row-ids.ts`, `unquoted-rows.ts`, `said.ts`, `ask-again.ts` and `first-ask/confirmed.ts` in place, ran the five new or changed test files, then restored my files. `cmp` confirmed all six were byte-identical afterwards.
  - Result: `Test Files 5 failed (5)`, `Tests 16 failed | 14 passed (30)`.
  - Each fix test failed: storedThoughLeftOut listing, ids, 0032's reply held, quote-without-read held, bound still owed, both said cases, both replay "not taken" cases, all seven ask-again cases, and first-ask `"same"`.
  - The 14 that pass both ways are guards that hold before and after: `StoredBy` none-cases, same-read also-in-result, the explained yes taken, line words and read naming (new helpers), the legacy first-ask case and the unchanged ones.
- **Patch check:** `git apply --check --ignore-whitespace <scratch>/t691-integration.patch` printed `APPLY_CHECK_OK`.
- **Patch validation in a sandbox:** a scratch copy of `packages/fluxiq/src` (my final tree), with junctions to the worktree's `node_modules`, and the patch applied.
  - `npx tsc --noEmit -p tsconfig.json` exited 0.
  - The same three vitest directories printed `Test Files 158 passed (158)`, `Tests 1262 passed (1262)`.
  - Re-run after tidying a comment: `build-test/tests/judge.test.ts` and `request-size.test.ts` printed `Test Files 2 passed`, `Tests 40 passed`.
  - The worktree itself was never patched.
- **Generality scan:** `git diff HEAD -- packages` plus the new files and the patch, grepped for scenario words (friend, mutual, social, accepted and the run's names), found none.

## Not verified

- The patch applied in the real worktree; it passed only in the sandbox copy. Once applied, the verdict's held-yes lines read as `stored-line.ts` words, and `said.ts`'s held branch fires on real verifications. Before that, held lines use the generic exclusion wording, but the yes is still not taken.
- No live or model run. Whether a real judge answers the converse, or the `storedAnyway` sentence, differently is untested. A correct Flow could get a wrong no from the converse if the judge over-reads "asks for it in its answer"; only a cost-round rerun will show that.
- The full package suite and `pnpm check` were not run, per the brief.
- Fix 1 relies on `processing.passes`. A record set that names no collector is treated as the same read (old behaviour), so on such summaries the new rule never fires. The real run's summary carries passes; I did not check every run-summary producer.

## Open questions or contradictions found

1. **Brief versus code.** The brief put the converse ask in `ask-again.ts`, but only `verify.ts` builds the second call, and the stored-row line words live in `verdict/unquoted-line.ts`. Neither file is in my ownership list. Appendix A is the integration patch and adds two expectation changes in `build-test/tests/`. After applying it, the narrow re-check is `tsc` plus vitest on `result-verification` (the two `build-test` tests are inside it).
2. **Types.** `storedThoughLeftOut` and `storedAnyway` are typed in `request-rows/types.ts` (`AutomationStudioRequestRowsStoredMark`) and attached by intersection. The sibling `leftOutAlsoInResult` and `alsoInResult` live in `read-condition.ts`. Moving the new pair there is a type-only cleanup for whoever owns `read-condition.ts`.
3. **Judge prompt.** `llm/diagnosis-instructions.ts` (another worker's) still says "none [of leftOutAlsoInResult] needs a quote or a name in a yes". That stays true, since the field now holds only same-read copies. It says nothing of `storedThoughLeftOut`, which carries its own `storedAnyway` sentence. One sentence there naming the field would make the duty firmer.
4. **Held-yes reason.** `verdict/held-yes-reason.ts` still says the yes "did not supply the required row-local exclusion evidence" even when only stored rows held it. The line words are right once the patch is in; the reason words are generic. Unowned.
5. **Unaccounted overlap.** `verdict/without-unaccounted.ts` drops an unquoted entry's rows that the named-rows check already reported for the same condition. It is not `bound`-aware for `stored` entries. If a row were both `leftOutNamingTheItem` and stored by another read, its stored entry could be dropped. The refusal for the unaccounted row still stands, so no yes is taken. Unowned.

## Appendix A: integration patch (unowned files)

A copy is at `C:/Users/osrs_/AppData/Local/Temp/claude/c--Users-osrs--FluxStuff--FluxIQWebExtension/9c325cfc-204a-4aa6-9dde-eb255829a57f/scratchpad/t691-integration.patch`. Apply from the Core worktree root with `git apply --ignore-whitespace`.

```diff
--- a/packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verify.ts
+++ b/packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verify.ts
@@ -59,6 +59,17 @@
 // Such a yes reached by its two checks with nothing re-asked of a different
 // verdict says so (`firstAskConfirmed`, `./first-ask/`, t677).
 //
+// **That confirming call asks the converse question (t691).** A8
+// `run-mvbr0w7e-6a01c05b`: the confirming request was byte for byte the
+// first's, at temperature 0, and both said yes over an answer holding rows it
+// should not have held -- one opinion counted twice. A first yes a build test
+// confirms is now asked, on the second call's copy (`recheck`), the converse
+// (`./agreement/ask-again.ts`): each stored row against the request's words
+// that ask for it in the answer. It is screened as every recheck is; where it
+// cannot be sent, the second call repeats the first and the trail says so
+// (`secondAsked`), so the yes is never called first-ask confirmed on it.
+// Its answer is weighed beside the first as before.
+//
 // **An unsure beside a yes whose doubt Core's record contradicts is asked once
 // more (t503).** Lane C round 17 (`run-mv6lgqi6-4bfab2e1`, trial 3): one check
 // could not tell because later pages were never read, where every paging read's
@@ -103,12 +114,13 @@
 import {
   automationStudioLlmProviderFailureSpendsCall,
   runAutomationStudioLlmHarness,
+  screenAutomationStudioLlmEvidence,
   type AutomationStudioLlmProvider,
   type AutomationStudioLlmRunBudgetLedger,
   type AutomationStudioLlmTokenLimits
 } from "../llm/index.ts";
 import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "./contracts/index.ts";
-import { automationStudioResultVerificationAgreement, automationStudioResultVerificationAskAgain, automationStudioResultVerificationNoRecord, automationStudioResultVerificationReaskContradicted } from "./agreement/index.ts";
+import { automationStudioResultVerificationAgreement, automationStudioResultVerificationAskAgain, automationStudioResultVerificationConfirmingAsk, automationStudioResultVerificationNoRecord, automationStudioResultVerificationReaskContradicted } from "./agreement/index.ts";
 import { automationStudioResultCheckActivity } from "./check-activity.ts";
 import { automationStudioResultCoreObservation } from "./core-observation.ts";
 import { automationStudioResultSummaryWithPagingWords, automationStudioResultSummaryWithUnreadColumns } from "./read-account/index.ts";
@@ -217,7 +229,9 @@
   if (!automationStudioResultVerificationAskAgain(first, { confirmAnswer })) {
     return said({ outcome: { ...automationStudioResultVerificationAgreement({ first }), performed: true }, interventions });
   }
-  const second = await askCheck(request, provider, 2, trail);
+  // A first yes a build test confirms is asked the converse question, never the same one again (header, t691).
+  const converse = screenedRecheck(automationStudioResultVerificationConfirmingAsk(first, request.summary, { confirmAnswer }), request.deniedEvidenceKeys);
+  const second = await askCheck(converse ? { ...request, summary: { ...request.summary, recheck: converse } } : request, provider, 2, trail);
   // The request as the judges read it: a split's no whose advice excludes by words it never states is marked and asked again (t515, `./agreement.ts`).
   const wording = automationStudioRequestWording(request.instructions, request.summary);
   // The summary and the request's text: Core's record a no's every reason is weighed against (t607, `./refuted-no/`).
@@ -238,7 +252,7 @@
     settled: reasked, first, second, reads: request.summary.reads, requestText, says: wording?.says, ask, record: automationStudioResultVerificationNoRecord(input),
     agree: (one, two) => automationStudioResultVerificationAgreement({ ...input, first: one, second: two })
   });
-  const confirmed = automationStudioResultFirstAskConfirmed({ confirmAnswer, outcome, first, second, verdictChanged: trail.verdictChanged, reasks: trail.reasks });
+  const confirmed = automationStudioResultFirstAskConfirmed({ confirmAnswer, outcome, first, second, verdictChanged: trail.verdictChanged, reasks: trail.reasks, secondAsked: converse ? "converse" : "same" });
   return said({ outcome: { ...outcome, performed: true, ...(confirmed ? { firstAskConfirmed: true as const } : {}) }, interventions });
 }
 
@@ -396,6 +410,17 @@
   return automationStudioLlmProviderFailureSpendsCall({ code: error.code, status: typeof status === "number" ? status : undefined });
 }
 
+/**
+ * A recheck the verification may send, screened as the exclusion-evidence
+ * recheck is (`./exclusion-evidence/recheck.ts`): none without the domain's
+ * denied keys, or where it would carry one or anything secret-shaped (t691).
+ */
+function screenedRecheck(recheck: string | undefined, deniedKeys: readonly string[] | undefined): string | undefined {
+  if (recheck === undefined || deniedKeys === undefined) return undefined;
+  const screened = screenAutomationStudioLlmEvidence({ recheck }, deniedKeys);
+  return screened.deniedKey || screened.secretShaped ? undefined : recheck;
+}
+
 /** `{ [key]: value }`, or nothing when the value is undefined, for an optional field that may not be set to `undefined`. */
 function withDefined<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
   return value === undefined ? {} : ({ [key]: value } as { [P in K]?: V });
--- a/packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verdict/unquoted-line.ts
+++ b/packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verdict/unquoted-line.ts
@@ -1,4 +1,4 @@
-import type { AutomationStudioRequestRowsUnquoted } from "../request-rows/index.ts";
+import { automationStudioRequestRowsStoredLine, type AutomationStudioRequestRowsUnquoted } from "../request-rows/index.ts";
 
 /** A presence test as Core names it (`read-account/condition-name.ts`, `read-account/condition.ts`): its wording ends `is present` or `is absent`. */
 const PRESENCE_CONDITION = / is (?:present|absent)\)$/u;
@@ -17,6 +17,8 @@
  * (t599), asking for what it tests.
  */
 export function unquotedLine(entry: AutomationStudioRequestRowsUnquoted): string {
+  // Rows another read stored though this condition left them out of the act: rows the result keeps, said so (t691).
+  if (entry.stored) return automationStudioRequestRowsStoredLine(entry);
   const where = entry.step !== undefined ? `Step ${entry.step}` : `Read ${entry.nodeId ?? "(unnamed)"}`;
   const one = entry.rows.length === 1;
   if (entry.bound && PRESENCE_CONDITION.test(entry.condition)) {
--- a/packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/tests/judge.test.ts
+++ b/packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/tests/judge.test.ts
@@ -359,8 +359,10 @@
     const verdict = await judge(PICKUP_CART, { provider })({ summary: run40Summary(), budget: { maxCostUsd: 0.2 } });
     expect(seen).toHaveLength(2);
     expect(verdict).toEqual({ verdict: "yes", spent: { inputTokens: 1800, outputTokens: 120, totalTokens: 1920, estimatedCostUsd: 0.002, calls: 2 }, firstAskConfirmed: true });
-    // The same evidence both times, each call under half of what the build has left.
-    expect(seen[1]?.context).toEqual(seen[0]?.context);
+    // The first ask's evidence both times, the converse question on the confirming call's copy (t691, `../../agreement/ask-again.ts`), each call under half of what the build has left.
+    const { recheck, ...confirming } = seen[1]!.context.resultSummary!;
+    expect({ ...seen[1]!.context, resultSummary: confirming }).toEqual(seen[0]?.context);
+    expect(recheck).toContain("converse question");
     expect(seen.map((call) => call.maxEstimatedCostUsd)).toEqual([0.1, 0.1]);
   });
 
--- a/packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/tests/request-size.test.ts
+++ b/packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/tests/request-size.test.ts
@@ -58,7 +58,10 @@
   await automationStudioBuildTestJudge({ instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project-1", flowId: "flow-1", provider })({ summary, budget: { maxCostUsd: 1 } });
   // A yes is confirmed by a second call with the same evidence (`../judge.ts`, live run murwcmx2).
   expect(seen).toHaveLength(2);
-  expect(seen[1]?.context).toEqual(seen[0]?.context);
+  // The first ask's evidence again, with the converse question on the confirming call's copy (t691, `../../agreement/ask-again.ts`).
+  const { recheck, ...confirming } = seen[1]!.context.resultSummary!;
+  expect({ ...seen[1]!.context, resultSummary: confirming }).toEqual(seen[0]?.context);
+  expect(recheck).toContain("converse question");
   return seen[0]!;
 }
 
```
