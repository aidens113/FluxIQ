# Exploration path: the design every worker builds to (t861)

The lane supervisor's decisions, so workers can run in parallel. Read this whole file, then your brief. `S/` = `packages/fluxiq/src`, `SVC/` = `S/framework/automation-service/service`.

## The hard rule

A task ends only with its result judged achieved, its budget gone (an empty balance included), or a person's Stop. Nothing else may end it. Retrying never repeats a lasting act. Every node retries (first plus 3), a stale target is found again, permission gates and secret screening stand. Guidance and test fixtures never mirror a realistic scenario's task, site, products or answer. No provider or paid call, no Lab, no browser: scripted models only.

## The shape

`generateFlowBootstrapAdaptation({ authoringMode: "answer-first", evidenceGuided: true })` runs one **attempt**:

```text
open attempt, purse ($5 default), session (as a trial's), act record, row sink
repeat ROUND until an ending:
  one evidence loop: dryRun off, no trial port, no reset, no supervisor, draft on
    tools: the domain's + core.run_flow in FORWARD form
    every tool call goes through: permission gate -> act gate -> row sink
    a `complete` decision -> checkCompletion -> Flow-less judge, one call
      yes -> result labelled confirmed, round ends ok
      no / unsure -> refused back to the model with the reason, loop goes on
  the round ended some other way -> keep-going table says what next:
    budget / empty balance -> budget_out, with the best result so far
    a person's Stop        -> stopped_by_person
    provider silent        -> wait with backoff, say so in chat, same round's state
    any stall or limit     -> FRESH ROUND from the page as it stands: same draft,
                              same act record, same tried record, a short note
    loop signal ask_person -> waiting_for_person(stuck_in_a_loop), then continues
final witness read -> save draft (candidate-draft.json, verification not_performed)
write attempt + result, each checked with checkAutomationStudioTaskAttemptResult
```

The answer returned: `{ projectId, flowId, status: "answered", attempt, result, candidateId?, revision?, digest? }`. `status` is the contract's attempt status mapped by the caller, so a budget-out is still a normal return, never a thrown failure.

## Where things live

| Dir (new unless said) | Holds | Worker |
| --- | --- | --- |
| `S/runtime/answer-first/act-record/` | The merged act record, four source mergers, the act gate | acts |
| `SVC/answer-first/run-acts/` + `SVC/runtime-session/graph-options.ts` | The gate on a real Flow run; the double-act probe | acts |
| `S/runtime/result-verification/flow-less/` | Flow-less summary and the one-call judge | judge |
| `S/runtime/answer-first/result/` | Builds and checks the `TaskResult` and the ending | judge |
| `S/runtime/llm/node-tools/run/`, `replay/`, `loop-tools.ts`, `loop-configuration.ts`, one line in `evidence-loop.ts` | Forward form of `core.run_flow` | forward |
| `S/runtime/answer-first/keep-going/`, `S/runtime/answer-first/attempt-purse/` | The endings table, backoff, the purse's numbers | keep-going |
| `SVC/answer-first/rows/`, `SVC/answer-first/witnesses/` | Row sink, session, witnesses | rows |
| `SVC/answer-first/` (rest), `service.ts` (no new lines), `SVC/flow-bootstrap-requests/generate.ts`, `SVC/flow-bootstrap-commands/generation/request.ts`, `contracts.ts`, `S/runtime/conversations/commands/` | The driver, attempt store, wiring, chat status, guidance, all real-service tests | driver |
| Lane supervisor | `S/flows/authoring/model/authoring-mode/`, Extension `authoring-mode-env.ts`, `docs/architecture/automation-studio*.md`, the report | |

Shared records are `@fluxiq/contracts/automation`'s (`packages/contracts/src/task-attempts/`): use them, never restate or change them. `S/runtime/llm/repeat-guard/**` and `S/runtime/conversations/answer*` are other lanes'.

House rules: `AutomationStudio...` naming; one exported thing per file; a barrel `index.ts` in every directory; a shared filename prefix becomes a directory; tests in a `tests/` folder beside the subject; a header comment saying why, in plain words, citing the run or rule; `node scripts/structure-audit.mjs` must pass (run from the Core worktree root).

## Interfaces fixed now

**Act record** (`S/runtime/answer-first/act-record/`, exports through its barrel):

```ts
type AutomationStudioAttemptActCall = {
  actionId: string;            // the node or tool that acts
  parameters: JsonObject;      // what it was sent
  consequences: readonly string[];   // declared classes; [] for undeclared
  instructedAct?: string;      // an instructed act it claims, if any
  row?: JsonObject;            // the row, when it acts per row
  stage: "exploration" | "forward" | "trial" | "run";
};
type AutomationStudioAttemptActAdmission =
  | { kind: "run" }
  | { kind: "already_done"; act: AutomationStudioAttemptAct }   // identical and landed: refuse, no dispatch
  | { kind: "look_first"; act: AutomationStudioAttemptAct };    // may have landed and no look since: refuse, no dispatch

class AutomationStudioAttemptActRecord {
  constructor(options: { seed?: AutomationStudioAttemptActRecordData; persist?: (data: AutomationStudioAttemptActRecordData) => Promise<void>; now?: () => number });
  admit(call: AutomationStudioAttemptActCall): AutomationStudioAttemptActAdmission;
  /** A call that ran. Records it when it is a lasting act. `uncertain` means it ran and its effect is not known. */
  settled(call: AutomationStudioAttemptActCall, outcome: { effectApplied: boolean; uncertain?: boolean; words: { what: string; where: string } }): AutomationStudioAttemptAct | undefined;
  /** An observation ran: anything that may have landed may now be retried, not blind. */
  looked(): void;
  /** Whether this row already took a lasting act (never by position or handle). */
  rowDone(row: JsonObject): boolean;
  /** Whether a step's non-row lasting act already landed. */
  stepDone(call: Pick<AutomationStudioAttemptActCall, "actionId" | "parameters" | "row">): boolean;
  /** Remembers which row a handle printed in a read belongs to, so a by-hand press on it counts for that row. */
  noteReadRows(rows: readonly JsonObject[]): void;
  acts(): AutomationStudioAttemptAct[];   // the contract's shape, what a result carries
  forModel(): JsonObject;                 // what a fresh round is told, screened words only
  data(): AutomationStudioAttemptActRecordData;
  flushed(): Promise<void>;
}
```

Row identity: a `sha256:` digest of the row's own fields, leaving out what a read mints (`^\$|handle|evidence`, as `engine/automation/lifecycle-run/act-identity.ts`). Act id: `act.` + digest of action, target identity and row identity. Target identity takes a handle through the row map or the frozen target's stable fields, never a position.

**Forward run** (`S/runtime/llm/loop-configuration.ts`, field on the loop input):

```ts
forwardRun?: {
  /** This row already took its lasting act: the pass is excluded, nothing is sent for it. */
  rowDone(row: JsonObject): boolean;
  /** This step's own lasting act already landed: it is checked, never sent again. */
  stepDone(step: AutomationStudioFlowDraftStep): boolean;
  /** What each pass really did, for the record: called once per answered pass. */
  passed?(step: AutomationStudioFlowDraftStep, row: JsonObject | undefined, answer: AutomationStudioLlmEvidenceToolExecutionResult): void;
}
```

With it, `core.run_flow` is offered even with `dryRun: false`, says it runs forward from where the page is, and runs a lasting step for real on a row not yet done. No reset, no re-anchor, ever. Without it, today's behaviour byte for byte.

**Flow-less judge** (`S/runtime/result-verification/flow-less/`):

```ts
type AutomationStudioFlowLessSummary = {
  instructions: string;
  rows?: { totalRows: number; truncated: boolean; columns: {id: string; label: string}[]; rows: JsonObject[] };
  acts: readonly AutomationStudioAttemptAct[];
  answerText?: string;              // the model's words, marked as such when shown
  endView?: AutomationStudioResultEndView;
  witnesses?: { before?: JsonObject; after?: JsonObject };
};
automationStudioFlowLessSummaryDigest(summary): string   // same evidence, same digest
automationStudioFlowLessJudge(input: { summary; provider; run: harness runner; timeoutMs?; signal? }):
  Promise<{ verdict: "yes" | "no" | "unsure" | "not_judged"; reason: string; checkedWhat?: string; refusedByPurse?: boolean; unanswered?: boolean }>
```
Exactly one model call (`taskKind: "loop_verification"`, so `judgeReply` in test fixtures answers it). `not_judged` is a call that gave nothing. Secret screening applies to what it is shown.

**Result writer** (`S/runtime/answer-first/result/`):

```ts
automationStudioAnswerFirstResult(input: {
  attemptId: string; label: "confirmed"|"refuted"|"unverified"; timesChecked: number;
  rows?: AutomationStudioTaskResultRows; acts: AutomationStudioAttemptAct[];
  answerText?: string; checkedWhat?: string; missingWhat?: string; from?: AutomationStudioTaskResultFrom[];
}): AutomationStudioTaskResult
```
It picks the kind (rows, else done_on_site, else plain_answer, else an empty partial; budget-out only rows or partial), screens `answerText`, and returns only what `parseAutomationStudioTaskResult` accepts.

```ts
automationStudioAnswerFirstEnding(input: { attempt: AutomationStudioTaskAttempt; result: AutomationStudioTaskResult | undefined }): { attempt; result }
```
Parses both, calls `checkAutomationStudioTaskAttemptResult`, throws a typed error on any issue: a programming error, never an ending.

**Keep-going table** (`S/runtime/answer-first/keep-going/`):

```ts
type AutomationStudioAnswerFirstRoundEnd =
  | { kind: "loop"; result: AutomationStudioLlmEvidenceLoopResult }
  | { kind: "thrown"; error: unknown };
type AutomationStudioAnswerFirstNext =
  | { kind: "achieved" }
  | { kind: "budget_out"; why: "purse" | "empty_balance" }
  | { kind: "stopped" }
  | { kind: "backoff"; waitMs: number; say: string }     // provider silent: costs nothing
  | { kind: "fresh_round"; why: string; note: JsonObject }; // any stall or limit
automationStudioAnswerFirstNext(input: { end; aborted: boolean; purseRefused: boolean; achieved: boolean; backoffs: number }): AutomationStudioAnswerFirstNext
```
Every loop failure code and every thrown code maps to something; an unknown one is a `fresh_round`, never an ending. `backoffs` counts in a row; delays grow to a cap and never run out.

**Attempt purse** (`S/runtime/answer-first/attempt-purse/`): `AUTOMATION_STUDIO_ANSWER_FIRST_DEFAULT_BUDGET_USD = 5`; `automationStudioAnswerFirstBudgetUsd({ flowSetting?, env? })`, where an explicit lower setting holds; `automationStudioAnswerFirstKeepBackJudge(purse, ...)` over `keepBackForJudging`.

**Row sink** (`SVC/answer-first/rows/`):

```ts
automationStudioAnswerFirstRowSink(input: {
  runId: string; readRowsKey?: string;
  onRecordBatch: (batch: AutomationStudioRecordBatch) => Promise<AutomationStudioRunDatasetSummary>;
}): {
  /** One tool call's answer. Stores what a real read returned. Never takes a row from a model's words. */
  fromCall(call: { callId: string; toolId: string; value: JsonObject }, answer: AutomationStudioLlmEvidenceToolExecutionResult): Promise<{ rows: JsonObject[] } | undefined>;
  summary(): { datasetId?: string; totalRows: number; truncated: boolean; columns: {id,label}[]; rows: JsonObject[] };
}
```

**Witnesses** (`SVC/answer-first/witnesses/`): `automationStudioAnswerFirstWitnesses({ read })` with `beforeFirstLastingAct()`, called once, and `atEnd()`; a failed read is noted and never ends anything.

**Loop detection** (t859, not merged yet). The loop input gains `attemptRecord` and `loopSignal` when it merges; types are in `C:/Users/osrs_/FluxStuff/fxwork/t859/!FluxIQ/packages/fluxiq/src/runtime/llm/repeat-guard/loop-detection/types.ts`. Read-only. The driver answers `end` to both kinds and then takes a fresh round, or waits for the person.

## Decisions

- **One purse, no creation record.** The attempt's purse carries nothing in and writes no creation record, as a repair's build does (`repair: true` path of `creation-purse.ts`). A Lab-scoped ceiling or a Flow's explicit lower limit still holds.
- **A model never writes a row, and never decides what landed.** Rows come from a read's answer. An act's state comes from the call's result. `answerText` is the model's words and is labelled so.
- **Judged once on a digest.** A completion whose summary digest equals the last no or unsure is refused without a model call: new evidence is what it needs.
- **An undeclared press** with an effect is recorded `classes: []`, `may_have_landed`, marked `undeclared`, is shown to the model and the judge, and is left out of the result's `acts` and out of refusals. This is D6's disclosed limit, stated in the report.
- **`look_first`:** the record refuses a may-have-landed repeat until an observation ran after it. The retry is then not blind.
- **`already_done` is told as a result, not a failure:** `{ ok: false, code: "attempt.act_already_done", ... }` says it happened and to carry on, in generic words.
- **Extend** in this mode builds as `candidate`, until the Second Attempt lane lands.
- **The chat reaches this mode through `configured`**, since `S/api-contracts` is not this lane's. `generate.ts` resolves it.
