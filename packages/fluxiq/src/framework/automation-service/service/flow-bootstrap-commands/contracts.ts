import type { AutomationStudioTaskAttempt, AutomationStudioTaskResult } from "@fluxiq/contracts/automation";
import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioActionConsequence, AutomationStudioActionPermissionRequest } from "../../../../runtime/action-permission-requests/index.ts";
import type { AutomationStudioBootstrapAdaptation, AutomationStudioBootstrapAdaptationMode } from "../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioCandidateTrialVerdict } from "../../../../runtime/flow-authoring/bootstrap/candidate/index.ts";
import type { AutomationStudioRunOverrides } from "../../../../runtime/run-overrides/index.ts";
import type { AutomationStudioLlmModelCaller } from "../../../../runtime/llm/index.ts";
import type { AutomationStudioAsk, AutomationStudioAskAnswer } from "../../../../runtime/automation-parking/index.ts";
import type { AutomationStudioFlowLessSummary } from "../../../../runtime/result-verification/index.ts";

// What a caller asks for when it generates a Flow Bootstrap adaptation, and
// what it gets back.

export type AutomationStudioGenerateFlowBootstrapAdaptationInput = {
  projectId: string;
  flowId: string;
  /** The person the build is made for, whose unlocked key pays for its model calls. Not an authorization. */
  caller: AutomationStudioLlmModelCaller;
  /** The lasting consequences the person has already allowed this build's actions to have. Absent, none: each is asked about. */
  permittedConsequences?: AutomationStudioActionConsequence[];
  evidenceGuided?: true;
  /**
   * Opt-in explicit complete candidate submission; static validity remains
   * unverified. `project` builds that candidate through the project supervisor
   * and its builders (`../project-build/`); its result is a candidate's.
   * `answer-first` runs one live exploration that must reach the person's result
   * (`../answer-first/`); its result is an attempt's, `status: "answered"`.
   */
  authoringMode?: "candidate" | "project" | "answer-first";
  useReusableContext?: true;
  /**
   * What this build does to the Flow. Absent, `create`: a blank Flow, written
   * from the instruction, which is every build there has ever been.
   *
   * `extend` starts from the Flow that is already there -- read back as the
   * draft the model amends (`llm/node-tools/draft-from-flow.ts`) -- and keeps
   * its Router, Subflow, graph Flow and node ids, so the result is an edit
   * rather than a second Flow that happens to contain most of the same nodes.
   * It is the door a run that answered the wrong question comes back through.
   */
  mode?: AutomationStudioBootstrapAdaptationMode;
  /**
   * Where the Flow this build writes starts, in the bound domain's own
   * spelling. Core carries it and never parses it
   * (`runtime/flow-bootstrap/start-location.ts`).
   *
   * Given, the model is shown it and the bound domain is told it on every tool
   * call, so the domain can refuse everything until the Flow has reached it and
   * the step that reaches it ends up in the draft the plan is assembled from.
   * Omitted, the build explores whatever the caller put in front of it, as it
   * always has.
   */
  startLocation?: string;
  /** How human the build's input looks, a whole number 0 to 100 (`humannessSchema`), read from the request. Absent means 0. */
  humanness?: number;
  /**
   * How long the build waits for a person to answer a permission question
   * before carrying on without an answer.
   *
   * Absent, or not a positive number, means it does not wait: the question is
   * still opened in the Flow's thread, and the build proposes what it could
   * build while carrying the request, which nothing may approve or apply until
   * the person grants it. A caller with somebody in front of it -- the API
   * handler, where a person has just pressed build -- passes a wait, and the
   * build carries straight on with permission the moment they answer.
   */
  permissionAskTimeoutMs?: number;
  /**
   * What the chat's reading of the message that asked for this build cost, in
   * US dollars. A build that is not a refuted-result repair opens the Flow's
   * creation purse with it carried on top of what earlier builds spent, so it
   * is saved into the creation's record with the rest (`./creation-purse.ts`).
   * A repair ignores it. Absent, nothing is carried.
   */
  interpretationCostUsd?: number;
  /** How many priced model calls `interpretationCostUsd` sums, recorded as the Flow spend's "chat" calls. */
  interpretationCalls?: number;
};

export type AutomationStudioGenerateFlowBootstrapAdaptationProposal = {
  projectId: string;
  flowId: string;
  adaptationId: string;
  status: "proposed";
  riskLevel: AutomationStudioBootstrapAdaptation["riskLevel"];
  sourceInstructionIds: string[];
  baseDependencyDigest: string;
  baseSettingsRevision: number;
  accounting: {
    requestId: string;
    estimatedInputTokens: number;
    provider?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
  };
  /**
   * Present when the build met an action whose consequence the person had not
   * permitted and finished anyway. The proposal is real and is stored, and
   * nothing may be approved or applied until the person has answered this: send
   * the next build with the classes it lists as `missing` permitted.
   */
  permissionRequest?: AutomationStudioActionPermissionRequest;
  /**
   * Candidate mode only: the candidate and the trial whose confirmed yes made
   * this proposal (t340). A legacy build's proposal never carries it.
   */
  candidate?: AutomationStudioGeneratedCandidateTrial;
};

/** Which candidate, at which revision and digest, and which trial run's confirmed yes produced a proposal. */
export type AutomationStudioGeneratedCandidateTrial = {
  candidateId: string;
  revision: number;
  digest: string;
  trial: { runId: string; verdict: "yes"; calls: number };
};

/**
 * Why a candidate stayed a draft: the standing trial verdict for its latest
 * revision (`not_tested` when none ran), the trial run behind it, and Core's
 * codes (`candidate.trial_judged_no`, `FLOW_BOOTSTRAP_STALE`, ...).
 */
export type AutomationStudioCandidateDraftTrial = {
  verdict: AutomationStudioCandidateTrialVerdict | "not_tested";
  runId?: string;
  codes: string[];
};

export type AutomationStudioGenerateFlowBootstrapAdaptationResult = AutomationStudioGenerateFlowBootstrapAdaptationProposal | (
  Omit<AutomationStudioGenerateFlowBootstrapAdaptationProposal, "status" | "adaptationId" | "riskLevel" | "permissionRequest" | "candidate"> & {
    status: "draft";
    candidateId: string;
    revision: number;
    digest: string;
    verification: "not_performed";
    promotionAllowed: false;
    /** Present when a trial runner was available: why nothing was promoted. */
    trial?: AutomationStudioCandidateDraftTrial;
  }
) | AutomationStudioGenerateFlowBootstrapAdaptationAnswered;

/**
 * What an answer-first attempt answers: a normal return however it ended, a budget-out and
 * a person's Stop among them, since neither is a failure of the call (plan, "The one hard
 * requirement"). `attempt.status` says how it ended. The Flow is untouched: `candidateId`,
 * `revision` and `digest` name the unverified draft it saved, where one could be assembled.
 */
export type AutomationStudioGenerateFlowBootstrapAdaptationAnswered = {
  projectId: string;
  flowId: string;
  status: "answered";
  /** What the build's callers read of any answer: the instructions it worked from, the Flow as it found it, and what it spent. */
  sourceInstructionIds: string[];
  baseDependencyDigest: string;
  baseSettingsRevision: number;
  accounting: AutomationStudioGenerateFlowBootstrapAdaptationProposal["accounting"];
  attempt: AutomationStudioTaskAttempt;
  result?: AutomationStudioTaskResult;
  candidateId?: string;
  revision?: number;
  digest?: string;
  /**
   * Only for an attempt run with caller options (`AutomationStudioAnswerFirstCallerOptions`): what
   * confirmed its result, `check` or `judge`, or `none` where the caller turned checking off and took
   * the result as it was. That last attempt is `achieved`, its result `unverified`, and the attempt
   * record says why (`checkingOff`), which is the one achieved attempt the shared contract lets go
   * unconfirmed. Absent when the attempt ended without a result taken, and always absent on a chat
   * attempt.
   */
  confirmedBy?: "check" | "judge" | "none";
};

/**
 * Per-call settings for an answer-first attempt, for a caller that drives one from code -- a
 * FluxNode (`docs/working/fluxnode-plan.md`, N1-N7) -- rather than from the chat. They are the
 * second argument of the service's `generateFlowBootstrapAdaptation`, which a request body cannot
 * reach, so nothing sent over the API can raise a budget or bring its own check.
 *
 * Passing them at all asks for answer-first: no `authoringMode`, `evidenceGuided` or
 * `FLUXIQ_AUTHORING_MODE` is needed. Every field is optional, and an absent one means exactly what
 * the chat does. The hard rule binds them all: the attempt ends with its result, its budget gone,
 * or a Stop, and none of them adds a way to end in failure.
 */
export type AutomationStudioAnswerFirstCallerOptions = {
  /** The task's key in place of the digest of its words and site, so other words for one task find what it kept (a FluxNode's name and spec hash). 1 to 512 characters. */
  taskKey?: string;
  /**
   * The execution this attempt's lasting acts belong to, apart from its task (a FluxNode run, or the run an
   * idempotency key first started). Given, an attempt carries what an earlier attempt at its task landed only
   * when that attempt ran under the same scope, and otherwise starts with an empty act record: a new execution
   * means its acts, and the same one never presses again what may have landed (`../answer-first/attempt/opening.ts`).
   * The task key still finds the saved Flow. Absent (the chat), the same words carry what landed
   * (`runtime/answer-first/act-record/seed.ts`). 1 to 512 characters.
   */
  actScope?: string;
  /** The model this attempt's calls ask for, in place of the Flow's `llmModel`. */
  model?: string;
  /** How human the attempt's input looks, a whole number 0 to 100; absent means 0, today's path. */
  humanness?: number;
  /** The attempt's whole allowance in dollars, which may be above the $5 default. A Flow limit a person chose, the host's total and a Lab ceiling still hold it lower. */
  budgetUsd?: number;
  /** When the judge runs: `auto`, only when there is no `check` (the default); `always`, after a passing check too; `off`, never, and with no check the result is taken unverified. */
  judge?: "auto" | "always" | "off";
  /** The caller's own check of a completion, run before any judge and at no cost. */
  check?: AutomationStudioAnswerFirstCallerCheck;
  /** Where a question only a person can answer goes, in place of the Flow's conversation. */
  personAsk?: AutomationStudioAnswerFirstPersonAskSink;
  /** The standing grant. Present, it replaces the request's permitted consequences, nothing is asked about a lasting act, and an act outside it is refused so the rounds find another way. */
  scope?: AutomationStudioAnswerFirstCallerScope;
  /**
   * This attempt's Flow input values, by name (a FluxNode's inputs; fluxnode-plan N2). A saved Flow's
   * run gets them as its run inputs, so a step bound to an input runs with this attempt's value; and the
   * draft this attempt saves has every fixed step value equal to one of them bound to that input
   * (`../answer-first/flow-run/input-bound-steps.ts`), with the value as its default. No model reads them.
   */
  inputs?: Readonly<Record<string, JsonValue>>;
  /**
   * The overrides frame the run was set under (a FluxNode run's; `runtime/run-overrides/`), JSON only and never holding a secret input
   * (those travel beside the run, `runtime/run-secrets/`). The attempt runs inside it when no frame is already set, so a person's
   * press on the attempt (Carry on, Run again) goes on under the same overrides.
   */
  runOverrides?: AutomationStudioRunOverrides;
};

/**
 * What an attempt keeps of its caller's options, with the attempt in its task's memory, so a person's
 * press in the panel (Carry on, Run again) goes on under them: everything that can be written down.
 * A press comes from the panel with no options of its own, so it takes these. The function-valued
 * options are the caller's process and cannot be kept: such a press has no `check`, so its judge
 * runs as the kept mode says with no check (`auto` judges, `off` takes the result unverified), and no
 * `personAsk`, so a question goes to the Flow's conversation, where the person who pressed is.
 */
export type AutomationStudioAnswerFirstKeptCallerOptions = Pick<AutomationStudioAnswerFirstCallerOptions, "taskKey" | "actScope" | "model" | "budgetUsd" | "judge" | "scope" | "inputs" | "runOverrides" | "humanness">;

/**
 * The caller's check of what the attempt got: Core's own summary of it (rows from reads, acts from
 * the act record, the page as it ended), never the model's. `true` passes; a string is a "no" whose
 * reason goes back into the rounds as a judge's no does; `false` is a no with no reason given. A
 * check that throws is a no too, naming the error, so a faulty check costs a round and never the task.
 */
export type AutomationStudioAnswerFirstCallerCheck = (summary: AutomationStudioFlowLessSummary) => boolean | string | Promise<boolean | string>;

/**
 * A program's way to hear a question only a person can answer, and to answer it by callback.
 * `raised` is told each question as it is put (the `person_needed` event). `answer`, when given, is
 * waited on in place; absent, or resolving `undefined`, nobody answered, and the attempt waits as it
 * does with nobody to ask.
 */
export type AutomationStudioAnswerFirstPersonAskSink = {
  raised(ask: AutomationStudioAsk): void | Promise<void>;
  answer?(ask: AutomationStudioAsk, wait: { expiresAtMs?: number; signal?: AbortSignal }): Promise<AutomationStudioAskAnswer | undefined>;
};

/**
 * What a caller's attempt may do. `permittedConsequences` are the lasting acts granted, the classes a
 * chat request permits. `sites` are host names, each covering itself and its subdomains, with a port
 * only where given (the FluxNode scope's rule, `fluxNodeScopeAllowsSite`); absent, any site.
 */
export type AutomationStudioAnswerFirstCallerScope = {
  permittedConsequences: readonly AutomationStudioActionConsequence[];
  sites?: readonly string[];
};

/**
 * Only an absent flag is statically legacy. Candidate mode ends as a draft or,
 * after a confirmed trial yes, as a proposal carrying `candidate` (t340).
 */
export type AutomationStudioGenerateFlowBootstrapAdaptationResultFor<Input extends AutomationStudioGenerateFlowBootstrapAdaptationInput> =
  "authoringMode" extends keyof Input ? AutomationStudioGenerateFlowBootstrapAdaptationResult
  : AutomationStudioGenerateFlowBootstrapAdaptationProposal;
