# Flow-less judge and result writer (t861, worker: judge)

## Outcome

Done, with one limit the lane supervisor must decide on: a real judge's system prompt still talks about Flows (below). Nothing was run against a real model.

## What changed and why

New `S/runtime/result-verification/flow-less/` (`judge.ts`, `judged-summary.ts`, `question.ts`, `screened-words.ts`, `summary-digest.ts`, `types.ts`, barrel, tests), one line in `S/runtime/result-verification/index.ts`. New `S/runtime/answer-first/result/` (`result.ts`, `ending.ts`, `ending-error.ts`, `preview.ts`, `carried-acts.ts`, `probe.ts`, barrel, tests). Nothing else in `result-verification/` changed. `S/runtime/answer-first/index.ts` is untouched: the driver adds `export * from "./result/index.ts"`.

### How the driver calls them

```ts
const judged = await automationStudioFlowLessJudge({
  summary, provider, run: runAutomationStudioLlmHarness /* or a wrapper that records the receipt */,
  projectId, flowId, runId, deniedEvidenceKeys, timeoutMs, signal
});
// "yes" | "no" | "unsure" | "not_judged", reason, checkedWhat?, refusedByPurse?, unanswered?
automationStudioFlowLessSummaryDigest(summary);           // compare before asking again
automationStudioAnswerFirstResult({ attemptId, label, timesChecked, rows, acts, answerText, checkedWhat, missingWhat, from });
automationStudioAnswerFirstEnding({ attempt, result });   // throws AutomationStudioAnswerFirstEndingError (.issues)
```

### Reused by import, and copied

Imported: the harness runner's types, `taskKind: "loop_verification"`, `automationStudioResultVerificationWithinDeadline` and its deadline size, `automationStudioResultVerdict` (so only an explicit yes passes, and a yes citing a cell the rows lack is unsure, t810), `automationStudioResultScreenedJudgement`, `automationStudioResultEndView`, `screenAutomationStudioLlmEvidence`, and the contract parsers and check.

Copied, because private: the column and cell loop of `screenedRows` (`result-summary.ts`) and `canonicalJson` (`llm/repeat-policy.ts`). The small truncated-reply read follows `verify.ts`.

### Differences from design.md, each needing the driver to know

1. **The judge's input has three more required fields:** `projectId`, `flowId`, `deniedEvidenceKeys` (`runId` optional). The harness needs the ids. A real provider refuses a result summary with no declared keys (`request-evidence-check.ts`), so leaving them out would make every real judgement `not_judged`, forever, with scripted tests still green. Required means the driver gets a compile error instead. Pass the bound domain's keys, or `[]` for a domain with none.
2. **A result not `confirmed` is only ever `rows` or `partial`.** The writer has no status input, and the best result so far is what a budget-out carries, so it has to be one `checkAutomationStudioTaskAttemptResult` accepts. Acts and `answerText` stay on the record; only the kind claims less. This also applies to a person's Stop.
3. **`automationStudioAnswerFirstEnding` does not throw on two cases design.md's "any issue" would:** a budget-out with no result gets an empty `partial`, and a result that does not parse is rewritten smaller and `unverified`, keeping its acts. The brief asks for both. `achieved` with such a result still throws, because it is no longer confirmed.

## Commands run and observed results

From `packages/fluxiq`: `pnpm.cmd exec vitest run src/runtime/result-verification/flow-less src/runtime/answer-first/result --minWorkers 1 --maxWorkers 2`

```text
Test Files  4 passed (4)
     Tests  88 passed (88)
```

From the worktree root: `pnpm.cmd --filter fluxiq check` exits 2 on the last run, with two errors, neither in my files:

```text
src/framework/automation-service/service.ts(2487,80): error TS2769: No overload matches this call.
src/runtime/answer-first/act-record/record.ts(209,5): error TS2412: ...
```

An earlier run, before my last small edits and before those files changed, exited 0.

`node scripts/structure-audit.mjs` exits 1: `structure-audit: 11 violation(s) across 5 rule(s).` All are in `answer-first/act-record/` and `service/answer-first/run-acts/`. A grep of the log for `flow-less` and `answer-first/result` finds nothing.

## Not verified

- **No real model has seen this.** All of it ran through the real harness with a scripted provider, so how a real judge reads the question under the system prompt below is unmeasured.
- The real pre-flight check and message builder were run on the request (`automationStudioLlmRequestEvidenceRefusal`, `automationStudioLlmTaskMessages`); the provider's own send was not.
- Empty balance on the judge's call was not exercised. By reading, it comes back `unanswered`, and the next decision's own failure then ends the round as a budget-out.
- A retryable transport fault (429, 503) was not scripted, because it waits on real backoff. By reading, Core's retry policy retries it inside the one harness call.

## Open questions or contradictions found

1. **A real judge's system prompt still talks about Flows (lane supervisor's call).** The brief says the question says nothing of steps, a Flow's shape or a trial. What this judge sends does not, and a test holds it (the summary and the instruction; `flowShape` is left off the wire). But `automationStudioDiagnosisPromptInstruction("loop_verification")` in `S/runtime/llm/diagnosis-instructions.ts`, which I may not touch, opens every such call with "resultSummary.flowShape as every step the Flow can perform", and tells it to answer no for "a Flow with no step that could have narrowed" and that an empty result needs "the Flow's steps show it actually looked". `question.ts` counters this in generic words ("nothing is wrong because it is not shown"), which is mitigation only. **Recommendation:** give that function a Flow-less branch, chosen by a field on the request, that drops those sentences. It is small and should come before any paid run, because spurious noes here spend real budget.
2. **`timeoutMs` should be passed.** Without it the harness default of 20 s applies, the cutoff t473 was about. The maximum is 45 s.
3. **A judge's miscited yes can stall on the digest rule.** A yes citing a wrong cell is `unsure`, and the same evidence is then refused without a call until something changes. Today's judge would ask again; this one cannot. `not_judged` should not be recorded against the digest, since no answer came back.
4. **`act_wrong` without `step` makes the whole reply unreadable** (`well-formed.ts`), though the reply schema allows it, and a reply here has no step to name. The question tells the judge to use kind `other`. If a judge ignores that, the result is `not_judged`, and a test pins it.
5. **The judge emits no chat activity,** unlike `verify.ts`, since chat status is the driver's. The driver should say the check started and ended, or it will be invisible in chat.
6. **`reason` on `not_judged` uses today's reader's sentence,** "The run's result was never judged: ...". The word is "run", not Flow; `callFailureWords` is not exported, and importing it directly breaks the audit.
7. **Credential-shaped preview cells are withheld with a note.** The brief did not ask for this. The stored rows are untouched.
