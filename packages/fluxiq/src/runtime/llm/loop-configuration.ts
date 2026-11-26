// What a loop may be configured with, and how those numbers resolve.
//
// One module says what a caller may ask for and what each number means;
// `evidence-loop.ts` says what the loop does with them. The split follows the
// one already between the loop and its grammar (`evidence-loop-decision.ts`):
// the contract is long because each field is a decision with a reason behind
// it, and a file that both states the contract and runs on it grows past what
// anyone reads in one sitting.
//
// Everything here is re-exported from `evidence-loop.ts`, so the loop's public
// surface is unchanged and every existing consumer still reads it from there.

import type { JsonObject, JsonValue } from "../../core/index.ts";
import type { AutomationStudioLlmEvidenceFinishingTools, AutomationStudioLlmEvidenceLoopBudget } from "./loop-budget.ts";
import { automationStudioLlmEvidenceLoopBudgetValid } from "./loop-budget.ts";
import type { AutomationStudioLlmUsageSummary } from "./harness/index.ts";
import type { AutomationStudioLlmStepLogPageReader } from "./step-log/index.ts";
import type { AutomationStudioLlmLoopAskedRepeats, AutomationStudioLlmLoopAttemptRecord, AutomationStudioLlmLoopSignal, AutomationStudioLlmLoopSignalAnswer } from "./repeat-guard/loop-detection/index.ts";
import type { AutomationStudioLlmBuildPurse } from "./build-purse/index.ts";
import type { AutomationStudioFlowDraftClaimRefused, AutomationStudioFlowDraftLoopNeverEnds, AutomationStudioFlowDraftRoute, AutomationStudioFlowDraftStep } from "../flow-authoring/draft/index.ts";
import { automationStudioFlowDraftCopyScheduledCandidate } from "../flow-authoring/draft/scheduled-candidate/index.ts";
import type { AutomationStudioFlowDraftDryRunGateInput, AutomationStudioFlowDraftReplayForward, AutomationStudioFlowDraftTestReport } from "./node-tools/index.ts";
import type { AutomationStudioRunEnvironment } from "../../framework/automation-service/environment/index.ts";
import type { AutomationStudioLlmEvidenceLoopResume } from "./evidence-loop/index.ts";
import { automationStudioLlmEvidenceLoopConfigurationIssue as issue, type AutomationStudioLlmEvidenceLoopConfigurationIssue } from "./configuration-issue/index.ts";
import type { AutomationStudioLlmEvidencePlanningTools } from "./evidence-progress/index.ts";
import type { AutomationStudioLlmPageChannel } from "./view-channel/index.ts";
import type {
  AutomationStudioLlmEvidenceCompletionCheck,
  AutomationStudioLlmEvidenceLoopAccounting,
  AutomationStudioLlmEvidenceLoopTrace,
  AutomationStudioLlmEvidenceTool,
  AutomationStudioLlmEvidenceToolExecutionResult
} from "./evidence-loop.ts";

/** What a call names, in words a person reads: the control it acts on, and the words it types or looks for. */
export type AutomationStudioLlmEvidenceCallWords = { target?: string | undefined; text?: string | undefined };

export type AutomationStudioLlmEvidenceLoopInput = {
  /** Explicit candidate authoring records discovery evidence without retaining draft steps. */
  discoveryOnly?: true;
  /**
   * Suffixes the opening call's id, `initial.<toolId>.<scope>`, for a loop run
   * beside others for one Flow (a subflow builder, by its brief; t537). Absent,
   * the id is `initial.<toolId>` byte for byte (`./evidence-loop/call-id.ts`).
   */
  callScope?: string | undefined;
  /**
   * A discovery-only loop's own submit and test tools, which its wrap-up keeps
   * running and its notes name (a subflow builder's; t537). Absent, they are
   * the candidate's, `core.submit_candidate` and `core.test_candidate`.
   */
  finishingTools?: AutomationStudioLlmEvidenceFinishingTools | undefined;
  /** Backend-owned target revision for a tool whose request also depends on non-page state. Never provider data; unchanged targets keep the same key. */
  requestContextKey?: ((toolId: string) => string | undefined) | undefined;
  /**
   * What this attempt has already tried, shared by its loops across fresh
   * contexts and stages (`./repeat-guard/loop-detection/attempt-record.ts`).
   * Absent, each loop keeps its own.
   */
  attemptRecord?: AutomationStudioLlmLoopAttemptRecord | undefined;
  /**
   * The ladder's last two steps, which only a caller on the single-loop path can
   * do (`./repeat-guard/loop-detection/watch.ts`). Answer `continue` when the
   * signal is dealt with here and the loop may go on; `end` to stop the round as
   * a stall does, then start a fresh loop with the same `attemptRecord` or wait
   * for the person. Absent, every loop ends as a stall always has.
   */
  loopSignal?: ((signal: AutomationStudioLlmLoopSignal) => AutomationStudioLlmLoopSignalAnswer) | undefined;
  /**
   * How many times the task asks for this lasting act, for the new path: the
   * caller fills it from the attempt's act record. With a `loopSignal`, a stated
   * lasting act on one target is refused past this count (past one repeat when it
   * says nothing). With no `loopSignal` such an act is told and never refused, so
   * this is not read for a refusal. Nothing the model replies can lift it.
   */
  askedRepeats?: AutomationStudioLlmLoopAskedRepeats | undefined;
  /**
   * A loop whose model plans and hands the work on rather than acting on the
   * target (the project supervisor; t569): the tools that move its work
   * forward, which are never taken for looks; and its way forward,
   * which the no-progress redirect and the searching note name in place of the words that send a builder to act
   * (`./evidence-progress/planning-tools.ts`). Absent, every note is as it was.
   */
  planning?: AutomationStudioLlmEvidencePlanningTools | undefined;
  /**
   * The domain's reading of a tool result's page text, for the step log's
   * `page.txt` alone (`./step-log/page-reader.ts`). Never read by the loop and
   * never part of a request to the model. Absent, no step writes a `page.txt`.
   */
  stepLogPageText?: AutomationStudioLlmStepLogPageReader | undefined;
  tools: AutomationStudioLlmEvidenceTool[];
  decide(input: {
    iteration: number;
    tools: AutomationStudioLlmEvidenceTool[];
    evidence: ReadonlyArray<{ callId: string; toolId: string; value: JsonValue }>;
    decisionSchema: JsonObject;
    canComplete: boolean;
    signal?: AbortSignal;
  }): Promise<unknown>;
  /**
   * Runs one tool call. The loop hands no byte allowance: a tool returns its
   * whole result, and every result is shown to the model in full, save a view
   * of the target a newer one replaced (`context-window.ts`).
   */
  executeTool(input: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal; referenceNow?: number }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
  /** Host-only canonical registry/permission scope. No port means prior-call batching is unavailable. */
  rerunAuthority?: import("./prior-nodes/index.ts").AutomationStudioLlmPriorNodesAuthority | undefined;
  /**
   * The top-level keys of a tool result that are a view of the target -- a
   * page, for the web domain -- as the bound domain declared them
   * (`AutomationStudioLlmEvidenceRuntimeBinding.observedStateKeys`). Each
   * decision is shown the newest view whole and every earlier one as a
   * reference to the result that replaced it (`context-window.ts`). Absent or
   * empty, every result is shown whole.
   */
  observedStateKeys?: readonly string[] | undefined;
  /**
   * The bound domain's page channel, from the registry's loop binding
   * (`AutomationStudioLlmEvidenceRuntimeBinding.pageChannel`). Given, each
   * result's page is shown in place, whole once and as changes after, within
   * the page budget per request (`./view-channel/`). Absent, the window is as
   * `observedStateKeys` alone makes it.
   */
  pageChannel?: AutomationStudioLlmPageChannel | undefined;
  /** Where a list read's answer holds its kept records, as the bound domain declared it (`AutomationStudioLlmEvidenceRuntimeBinding.readRowsKey`). */
  readRowsKey?: string | undefined;
  /** Explicit bound-domain screening authority for authored rerun path diagnostics. Absent, omit paths. */
  deniedEvidenceKeys?: readonly string[] | undefined;
  // There is no count of turns or of calls that ends a loop (t1056). `maxIterations` and `maxToolCalls` ended every
  // loop with no `loopSignal` at their figure, eight by default, and the readers of a recorded run were held to a ceiling of
  // 64 of each; none of that stands (user, 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY
  // JUST RESETS EVERYTHING"). A loop ends with its result, its purse, its clock, a person's Stop, or the round its caller
  // ends on loop detection's signal; a repeat is steered and decided (`loopSignal`).
  /** @deprecated Read by nothing (t1056): no count of turns ends a loop. Accepted only while `adaptation/recovery/` still passes it; remove it with that caller. */
  maxIterations?: number;
  /** @deprecated Read by nothing (t1056): no count of calls ends a loop. Accepted only while `adaptation/recovery/` still passes it; remove it with that caller. */
  maxToolCalls?: number;
  /**
   * The run's own bounds -- tokens, cost, time -- from which the loop works out
   * before each decision how many it has left. With one given, the model is shown what is left
   * as the newest entry (`AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID`); the
   * last decision is offered only completion; and with none left the loop ends
   * `llm_evidence_loop.iteration_limit`. Absent, none of that happens.
   *
   * Cost is the exception: its count only tells the model what is left and
   * when to wrap up, and never ends a loop. The purse (`purse`, below) is the
   * only cost authority, and a decision it refuses is the only cost ending.
   */
  budget?: AutomationStudioLlmEvidenceLoopBudget;
  /**
   * The run's environment (traces and offline trials, P1, U7). The loop's clock
   * comes from it -- what `budget`'s time bound counts down on and what the
   * accounting's elapsed time reads -- unless `budget.now` names one, which
   * still wins. Nothing else is read from it: its channel scope is entered by
   * whoever runs the loop, around the whole loop, as ambient as the host lease
   * is, so the loop itself never calls `within`. Absent, the wall clock.
   */
  environment?: AutomationStudioRunEnvironment | undefined;
  /**
   * The build's purse (`./build-purse/purse.ts`), the one cost authority for a
   * Flow's creation. Given, every decision is held against it and the loop
   * makes no purse of its own: the cost the model is told is left is the
   * purse's (with `budget` given, whether or not it names `maxCostUsd`), and a
   * breach on it while this loop runs is counted in this loop's
   * `budgetBreaches`. Absent, a loop whose `budget` names `maxCostUsd` makes
   * its own purse at that ceiling.
   */
  purse?: AutomationStudioLlmBuildPurse;
  completionSchema?: JsonObject;
  minToolCalls?: number;
  propagateDecisionErrors?: boolean;
  // There is no setting for steps in a row without progress (t1049). Such a
  // count once ended the loop (`maxStepsWithoutProgress`, eight by default);
  // none does now (user, 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING
  // CALL LIMIT THAT RANDOMLY JUST RESETS EVERYTHING"). The loop still counts
  // them, to steer: from
  // `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS` on
  // it tells the model plainly what it keeps repeating
  // (`./evidence-progress/stall-redirect.ts`), and a repeat is loop detection's
  // to catch and the model's to decide (`loopSignal`). Only the result, the
  // purse or a person's Stop ends a task.
  /**
   * Ask again after an unusable decision instead of ending.
   *
   * When set, a `decide` that throws `AutomationStudioLlmUnusableDecisionError`
   * spends that iteration -- one provider call, paid from the purse like any
   * other -- is recorded as an `unusable` step, the model is told the issue
   * codes and the decision shape as evidence under
   * `AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID`, and the loop
   * asks again on the same model. No count of them in a row ends the loop
   * (t1056): unusable decisions refused for the same issues again are steps
   * without progress, which steer, and the same unreadable reply again is a
   * finding on loop detection's ladder (`./evidence-loop/unreadable-reply.ts`).
   * A loop that cannot get a usable reply ends when its purse does.
   *
   * `stalled` builds the error a round ends with where its caller ends it on
   * loop detection's signal (`loopSignal` answering `end`) or the model asked
   * the person (`./decision-handlers/model-decision.ts`): it is thrown under
   * `propagateDecisionErrors`, otherwise the loop ends
   * `llm_evidence_loop.repeat_without_progress`.
   *
   * Absent, the error is an ordinary decision error, as it always was. Any
   * other error `decide` throws is unaffected either way.
   *
   * A completed result that `checkCompletion` refuses is an unusable decision
   * too, and is told and asked again the same way.
   */
  unusableDecisions?: {
    /**
     * @deprecated Read by nothing (t1049, t1056). Its last caller is a test in `adaptation/recovery/`, a path t1056
     * could not edit; remove the field with that line.
     */
    maxConsecutive?: number;
    stalled(input: {
      issueCodes: readonly string[];
      trace: readonly AutomationStudioLlmEvidenceLoopTrace[];
      accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting>;
      /**
       * The draft as it stood when the loop stopped, a copy: what a stalled
       * build tests, judges and repairs rather than dropping
       * (`../flow-bootstrap/unfinished-build/`).
       */
      steps: readonly AutomationStudioFlowDraftStep[];
    }): unknown;
  };
  /**
   * The caller's own move for a loop that keeps repeating, while it still has
   * one that may get the build further (t477; user: a build never gives up on a
   * recoverable failure). Asked when loop detection's ladder reaches its top
   * rung -- refusing has not stopped a run of looks, of refused repeats or of
   * refusals of one kind -- with the issue codes of that run
   * (`decision-handlers/stall-recovery.ts`). `call` is run as the loop's own
   * call -- a candidate build's retest of its latest revision -- its answer is
   * shown to the model with a note saying why, and the round goes on.
   * `endedBecause` says why nothing was left. Absent, or answering neither, a
   * loop with no `loopSignal` goes on steered; one with a caller that ends the
   * round on the signal ends it as that caller says.
   */
  recoverStall?(stall: { issueCodes: readonly string[] }): { call: { toolId: string; input: JsonObject } } | { endedBecause: string } | undefined;
  /**
   * Check a completed result before the loop accepts it.
   *
   * A result the check refuses was a paid call that produced nothing usable.
   * With `unusableDecisions` set it is recorded as an `unusable` step, the
   * check's feedback is added to the evidence the model sees under
   * `AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID`, and the loop
   * asks again; without it, the loop ends `llm_evidence_loop.invalid_decision`.
   * A check that throws is a decision error. Its issue codes are what decide
   * whether the refusal is new: the feedback should name each issue and the
   * shape that is accepted, since it is all the model has to correct from.
   */
  checkCompletion?(
    result: JsonObject,
    /** The draft as it stands, so a caller that builds its result from what
     * the loop did rather than from what the model wrote has it to build from;
     * and the decisions the loop may still make after this one (`turnsLeft`,
     * t743), so a check that would ask for more work knows whether there is
     * room for it. */
    context: { steps: readonly AutomationStudioFlowDraftStep[]; turnsLeft?: number | undefined }
  ): AutomationStudioLlmEvidenceCompletionCheck | Promise<AutomationStudioLlmEvidenceCompletionCheck>;
  /**
   * What a tool call that throws, or returns what is not a result, does.
   *
   * `observe`: it is a step without progress, recorded in the trace under its
   * call id with a closed code, and shown to the model as that call's result
   * (`tool-failure.ts`); the loop asks again, and no run of them ends it
   * (t1049): a model that keeps calling what fails is steered. It is not
   * evidence toward `minToolCalls`, and an action that failed counts as a
   * change, since it may have changed what a look would see. `end`: the loop
   * ends `llm_evidence_loop.tool_failed` at once and records nothing.
   *
   * Absent, `observe` when `unusableDecisions` is set -- a loop that asks
   * again after a decision it could not use asks again after a call that
   * failed -- otherwise `end`. Cancellation ends the loop either way.
   */
  toolFailures?: "observe" | "end";
  /**
   * A digest of the whole state, taken either side of each action.
   *
   * What it buys is the reduction (`runtime/exploration-reduction/`), which
   * needs a digest chain to say which steps the end state depended on. It
   * costs a round trip per call, so it is the caller's decision. Answering
   * with nothing leaves that step without digests and is not a failure; a hook
   * that throws is taken as the call having failed, and the step is recorded
   * as one, because a step with a digest the caller could not take is a step
   * nothing knows the shape of.
   *
   * A caller whose results report `stateDigests` from the call's own captures
   * (`evidence-loop/tool-execution.ts`) leaves this out: the loop then reads
   * each call's two states off its result and never asks for one, which is
   * what keeps a look at one capture instead of three. Given, it is asked as
   * before and a result's own digests are not read, so no point in a step is
   * ever digested twice.
   */
  captureStateDigest?(input: { callId: string; toolId: string; signal?: AbortSignal }): Promise<string | undefined> | string | undefined;
  /**
   * What a call names, in words a person reads, for the chat alone
   * (`../activity/observer.ts`): the control its handle names and the words it
   * types or looks for, as the bound domain allows them shown. The loop never
   * reads it. Absent, the chat says the call's verb alone.
   */
  describeCall?(call: { toolId: string; value: JsonObject }): AutomationStudioLlmEvidenceCallWords | undefined;
  /** The parameter keys that name the control a step acts on, from the bound domain's bundle (`./node-tools/rerun-check.ts`). Absent, a checked rerun reads every parameter as naming it. */
  controlParameterKeys?: ReadonlySet<string> | undefined;
  /**
   * The draft the loop accrues and shows the model beside its evidence
   * (`runtime/flow-draft/`), with `amend_draft` decisions to correct it.
   * `false` turns both off; `steps` is returned either way. The draft is always
   * shown whole: every step with its argument. No count of edits withdraws
   * amending (t1056): editing the draft is the authoring, and the purse bounds it.
   */
  draft?: false | {
    /**
     * Steps the draft already holds before the loop takes its first one.
     *
     * This is how a loop is asked to work on a result that exists rather than
     * to write one from nothing: a Flow read back as steps
     * (`node-tools/draft-from-flow.ts`) is handed in here, the model is shown
     * it as its own draft, and every amendment -- drop, reorder, rerun -- edits
     * it. The loop appends to it exactly as it appends to one it filled itself,
     * and `steps` comes back as the whole list.
     *
     * A seeded step is one the loop did not take. It carries the caller's word
     * for whether the result contains it and nothing else: no call id, because
     * no call was made; no replay, so a seeded draft is not dry-run gated; and
     * the caller keeps seeded ids clear of the `d<n>` this loop mints, so an
     * amendment naming a step names one step.
     */
    seed?: readonly AutomationStudioFlowDraftStep[];
    /**
     * The ids of the seeded steps carried from a saved Flow or an earlier attempt, as opposed to an earlier round of
     * this one (t1037 phase 2). They are the model's word: the framework drafts around them and never decides them
     * again, so a saved step a run broke at stays in the Flow until the model edits it, and a later read of its list
     * does not take its place. A seeded step named `f<n>` (`../flow-authoring/draft/carried-step/`) is carried
     * whether or not it is listed.
     */
    carried?: readonly string[] | undefined;
    /**
     * Which reads the caller's answer is made of, where the caller decides it (answer-first: every read not marked a
     * working read, t1037 phase 2). Absent, the framework takes the asked table's last read, or the last read, as the
     * result (`../flow-authoring/draft/compose/result-reads.ts`); every other read is left out as not the result.
     */
    resultRead?: ((step: AutomationStudioFlowDraftStep) => boolean) | undefined;
    /** Where each seeded step's node started in the run being repaired, by step id (`node-tools/draft-from-flow.ts`): a rerun of it, or
     * of the step that took its place, with no start page of its own is put back there first (`node-tools/step-place.ts`; t194 C-D). */
    seedStartedOn?: Readonly<Record<string, JsonObject>>;
    /**
     * The seed is the draft of a build that ran out before it finished, and
     * this build continues it (`../flow-bootstrap/incomplete-draft/`).
     *
     * Before the first decision the model is told what the last build still
     * owed (`./evidence-loop/resume.ts`). The draft is not replayed: a
     * continuation is still the build's live phase, and the model carries on
     * from wherever the page stands (user, 2026-09-30). A seed carried from the
     * loop's own steps keeps their replay, so unlike an extend's seed it is
     * tested like any draft once the model says the Flow is ready.
     */
    resume?: AutomationStudioLlmEvidenceLoopResume;
    /** The instructed acts as the model's checklist beside the draft, from the first decision (`../flow-bootstrap/instructed-acts/checklist.ts`). */
    acts?: (steps: readonly AutomationStudioFlowDraftStep[]) => JsonValue | undefined;
    /** The acts not done yet, by id: what a redirect names and what authored progress counts down. */
    actsMissing?: (steps: readonly AutomationStudioFlowDraftStep[]) => readonly string[];
    /**
     * Asked before an act is claimed on a step, by an `amend_draft` naming
     * `act` or a call run with `add` and `act`: the refusal when the act judge
     * would reject the claim, which is then not made and is told
     * `act_not_done_there` (`./harness-options/draft-acts.ts`,
     * `../flow-draft/amendment/types.ts`; week report W1). Absent, every claim is made.
     */
    claimRefused?: AutomationStudioFlowDraftClaimRefused;
    /**
     * Asked of each repeat an `amend_draft` writes that runs its span again
     * while the span's last step succeeds: assembly's own refusal when the
     * loop could end only by failing -- its last step can answer no route that
     * ends it, and no `most` the person gave bounds it -- which is then taken
     * back and told `repeat_never_ends` with that sentence, naming the nodes
     * that do end one (`./harness-options/draft-acts.ts`,
     * `../flow-authoring/draft/amendment/types.ts`). Absent, the loop is
     * refused only when the Flow is assembled.
     */
    loopNeverEnds?: AutomationStudioFlowDraftLoopNeverEnds;
    /** The route the person named, or that they named none, shown with the draft once known (`./harness-options/draft-route.ts`). */
    route?: () => AutomationStudioFlowDraftRoute | undefined;
    /**
     * Whether the draft follows that route, asked of a completion before
     * `checkCompletion` once the caller composes the two
     * (`automationStudioLlmEvidenceLoopRouteChecked`; the loop never does): a
     * refusal is fed back and counted exactly as that check's would be, and
     * the caller's check is not asked.
     */
    routeCheck?: (steps: readonly AutomationStudioFlowDraftStep[]) => Promise<Extract<AutomationStudioLlmEvidenceCompletionCheck, { ok: false }> | undefined>;
  };
  /**
   * Whether a completed result must first have its draft replayed clean
   * (`runtime/flow-draft/dry-run.ts`) -- the test of the Flow, asked only once
   * the completion check has accepted it (`./evidence-loop/completion-attempt.ts`).
   *
   * On by default, and it costs a caller that cannot replay nothing: the gate
   * applies only to a draft whose proposed steps carry what a replay needs, so
   * a host that says nothing about replaying is never held to it. Where it does
   * apply, the target is put back the way the draft's first step found it and
   * every proposed step is run again through `executeTool` -- the same executor,
   * so the same permission gate -- with **no provider call made by any of it**,
   * and a result whose draft did not replay clean is refused back to the model
   * as an ordinary issue rather than proposed.
   *
   * `false` turns it off, which is for a caller whose actions cannot be taken
   * twice, never for making a build finish sooner: the replay is the only thing
   * between "each step worked when I took it" and "these steps work as a Flow".
   */
  dryRun?: false;
  /**
   * The forward run (t861, plan D2): the model does the first row by hand, writes the loop, and `core.run_flow` then
   * runs it on the rows not yet done, from the page as it stands, never from the top. With it the tool is offered
   * even with `dryRun: false`, says so, and a lasting step really acts on a row not done yet (`./node-tools/replay/forward.ts`).
   * No reset, no re-anchor. Absent, the loop is what it always was.
   */
  forwardRun?: AutomationStudioFlowDraftReplayForward;
  /**
   * This caller puts no page back (answer-first, plan D1): a model's rerun of a step runs from the page as it stands,
   * with no reset and no earlier step done again, a lasting act's included; its answer says the page its step started
   * on and that it ran here, and the step records that it ran in place (`./node-tools/step-place.ts`, `forward_run`;
   * run `run-mwc60eal-4c9fdf6f`). Every call still passes the caller's act gate. Absent, a rerun is put back first.
   */
  rerunsInPlace?: true;
  /**
   * This loop authors a Flow that is finished only once a run of the whole
   * Flow from its start was judged to do what was asked (user, 2026-10-02,
   * t244): the build's every round. A completion whose Flow the dry run cannot
   * run whole -- a step that left nothing to run it again with, or no step
   * that ran in this build at all -- is refused `llm_evidence_loop.full_run_required`,
   * where it used to be passed untested (`node-tools/dry-run-gate.ts`). Absent,
   * a loop that runs a dry run still refuses steps carried from an earlier Flow
   * and otherwise passes what it cannot run, as the recovery ladder's
   * exploration -- which authors no Flow -- needs.
   */
  fullRunRequired?: true;
  /**
   * What the dry run observed, each time it passes: the replay it passed on and
   * what each step answered, for a judge of what the build actually did. Never
   * called on a refusal (`node-tools/dry-run-gate.ts`).
   */
  observeTest?(report: AutomationStudioFlowDraftTestReport): void;
  /**
   * The ids of the instruction's acts the build reads as lasting
   * (`../flow-bootstrap/action-permissions.ts`, `instructedLastingActs`), asked
   * for once, only when the loop first sends its steps again -- its dry run, a
   * part run (`core.run_flow`) or a rerun's put-back -- each of which checks a
   * step claiming one rather than running it again
   * (`../flow-draft/verify-only.ts`; t174-w89, run `run-murwd8le-79e735a8`
   * Cause 3). Absent, a step lasts by its declaration alone.
   */
  lastingActs?: (() => Promise<ReadonlySet<string>>) | undefined;
  /**
   * One look at the target the dry run left, right after it passes, for the
   * judge of the test (`node-tools/dry-run-gate.ts`, `endView`). Asked only
   * where `observeTest` is given; a look that fails leaves the report without
   * a page.
   */
  testEndView?: AutomationStudioFlowDraftDryRunGateInput["endView"];
  /**
   * The node each step names, by its id, for every place the loop sends its
   * steps again -- its dry run and a part run (`core.run_flow`) -- so a repeat
   * runs once for each row its list returned, as the Flow would
   * (`node-tools/replay-span.ts`). Absent, a repeat is sent once on the row the
   * build explored and excused.
   */
  nodeOf?: AutomationStudioFlowDraftDryRunGateInput["nodeOf"];
  /**
   * The full definition of the node each step names, for the same places: what
   * lets a read sent again carry the record output assembly writes on its node,
   * as the stored Flow's read does (`node-tools/replay.ts`, read-list S1).
   */
  definitionOf?: AutomationStudioFlowDraftDryRunGateInput["definitionOf"];
  /**
   * The plan part a step serves, for a build that works within a scope: the dry
   * run sends the record output the part owes that the saved Flow has (K5,
   * `node-tools/replay-draft.ts`). Absent (an instruction-only build), none.
   */
  partOf?: AutomationStudioFlowDraftDryRunGateInput["partOf"];
  /**
   * The columns the instruction names, as the caller read them once with
   * `automationStudioFlowBootstrapInstructionColumns(instructionText)`: the dry
   * run, a part run and a forward run send every read the record output the
   * saved Flow's assembly gives it, so a replayed read declares the person's
   * columns and no others (`node-tools/replay/replay.ts`, run-mwb2kkv5-1baeee11).
   * Absent or empty, nothing changes.
   */
  namedColumns?: AutomationStudioFlowDraftDryRunGateInput["namedColumns"];
  signal?: AbortSignal;
};

/**
 * The steps a loop starts with, renumbered from 1 whatever the caller numbered
 * them, so what the model is shown and what an amendment names agree however
 * the seed was built. A loop given none starts empty, which is every build that
 * writes a Flow from nothing.
 */
export function automationStudioLlmEvidenceLoopSeedSteps(
  draft: AutomationStudioLlmEvidenceLoopInput["draft"]
): AutomationStudioFlowDraftStep[] {
  return (draft === false ? [] : draft?.seed ?? []).map((step, index) => {
    const copy = { ...step, position: index + 1 };
    automationStudioFlowDraftCopyScheduledCandidate(step, copy);
    return copy;
  });
}

/**
 * The loop's input with the draft's route check asked before the caller's
 * completion check, as one check, so a route refusal takes the path every
 * refused check takes: the same evidence entry, the same no-progress count, the
 * same trace line. A test's refusal of a completion both accepted still reaches
 * the caller's check (`./evidence-loop/completion-attempt.ts`, `testRefused`).
 * With no route check the input comes back as it was.
 *
 * **The caller composes it, before it observes the loop.** The activity
 * observer (`../activity/observer.ts`) wraps `checkCompletion` to put each
 * completion check and each refusal in the chat; a route check composed inside
 * the loop would sit outside that wrapper and refuse unseen. So the build
 * composes it first and observes the result (`../service.ts`, the round's
 * loop input), and the loop never composes it on its own.
 */
export function automationStudioLlmEvidenceLoopRouteChecked(input: AutomationStudioLlmEvidenceLoopInput): AutomationStudioLlmEvidenceLoopInput {
  const routeCheck = input.draft === false ? undefined : input.draft?.routeCheck;
  if (!routeCheck) return input;
  const check = input.checkCompletion;
  const checked = async (result: JsonObject, context: { steps: readonly AutomationStudioFlowDraftStep[]; turnsLeft?: number | undefined }): Promise<AutomationStudioLlmEvidenceCompletionCheck> =>
    await routeCheck(context.steps) ?? (check ? check.call(input, result, context) : { ok: true });
  const testRefused = (refusal: unknown): void => {
    const inner = (check as { testRefused?: unknown } | undefined)?.testRefused;
    if (typeof inner === "function") inner.call(check, refusal);
  };
  return { ...input, checkCompletion: Object.assign(checked, { testRefused }) };
}

export type EvidenceLoopLimits = {
  /** Calls that must have run before the model may complete. A floor, never an ending. */
  minToolCalls: number;
};

/** Limits the loop cannot run on: the check that refused them, by name (`./configuration-issue/`, t584). */
export type EvidenceLoopLimitsRefused = { issue: AutomationStudioLlmEvidenceLoopConfigurationIssue };

/**
 * The loop's limits, or the first check they fail. Each refusal names its
 * check and the figures it held, so a loop that ends
 * `llm_evidence_loop.invalid_configuration` says which (t584).
 *
 * **No count ends a loop (t1056).** Not its turns, its calls, its edits, its looks, its unusable or unreadable replies in
 * a row, nor its steps without progress (t1049) -- with or without a `loopSignal` (user, 2026-11-24: "THERE SHOULDNT BE
 * ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS EVERYTHING"). Each such ending either threw a round's
 * evidence away (t1008, run-mwufisf0-5535f5f5: four rounds of looks in a row) or ended a build that still had money. A
 * task ends with its result or its purse (user, 2026-11-03), and a repeat is caught by loop detection, steered, and
 * decided by the model (2026-11-19).
 */
export function resolveLimits(input: AutomationStudioLlmEvidenceLoopInput): EvidenceLoopLimits | EvidenceLoopLimitsRefused {
  const limits: EvidenceLoopLimits = { minToolCalls: input.minToolCalls ?? 0 };
  const issue = limitsIssue(input, limits);
  return issue ? { issue } : limits;
}

/** The first check `limits` fail, in the order the loop has always asked them, or none. */
function limitsIssue(input: AutomationStudioLlmEvidenceLoopInput, limits: EvidenceLoopLimits): EvidenceLoopLimitsRefused["issue"] | undefined {
  const { minToolCalls } = limits;
  const unusable = input.unusableDecisions;
  if (unusable && typeof unusable.stalled !== "function") return issue("limits.unusable_stalled", {}, "unusableDecisions.stalled is not a function.");
  const budget = input.budget;
  if (budget && !automationStudioLlmEvidenceLoopBudgetValid(budget)) {
    return issue("limits.budget", { maxTotalTokens: budget.maxTotalTokens, maxTokensPerDecision: budget.maxTokensPerDecision, maxCostUsd: budget.maxCostUsd, maxDurationMs: budget.maxDurationMs, keptForFinishing: budget.countCalls?.keptForFinishing },
      "The budget is refused: each bound given must be a positive finite number, its clock a function, and countCalls.keptForFinishing a whole number of at least 0.");
  }
  if (!Number.isSafeInteger(minToolCalls) || minToolCalls < 0) {
    return issue("limits.min_tool_calls", { minToolCalls }, `minToolCalls ${minToolCalls} must be a whole number of at least 0.`);
  }
  return undefined;
}
