import type { AutomationStudioSiteResetLedger, AutomationStudioSiteResetNamedAct, AutomationStudioSiteResetProjectLedger } from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioSubflowScope, AutomationStudioSubflowTrialPort, runAutomationStudioSubflowBuilderLoop } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmBuildPurse } from "../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";
import type { AutomationStudioProjectSubflowBrief } from "../contracts/index.ts";
import type { AutomationStudioHostResourceLease, AutomationStudioHostResourcePort } from "../host-resources/index.ts";
import type { AutomationStudioProjectBuildRecordStore, AutomationStudioProjectBuildRef } from "../record/index.ts";

// What the dispatcher reaches outside itself (automation-project-agents-plan,
// `Concurrent dispatch`). The service that wires the supervisor in (A5c)
// builds these once per build; nothing here is per brief except what the
// brief port factory hands back.

type BuilderInput = Parameters<typeof runAutomationStudioSubflowBuilderLoop>[0];

/**
 * The build's cancellation, as `AutomationStudioBuildCancellation`
 * (`service/flow-bootstrap-commands/cancellation.ts`) offers it: each brief runs
 * in a `child` of the supervisor's scope, so a Flow cancel aborts every builder
 * and a builder ending never aborts its parent or a sibling.
 */
export type AutomationStudioProjectDispatchCancellation = {
  child<T>(work: () => Promise<T>, stop?: AbortSignal): Promise<T>;
  signal(): AbortSignal | undefined;
};

/** What a brief's ports are made for: the brief, its scope, its own ledger, its lease and its stop. */
export type AutomationStudioProjectBriefPortRequest = {
  brief: AutomationStudioProjectSubflowBrief;
  scope: AutomationStudioSubflowScope;
  /** The brief's own ledger, from the project ledger's `forBrief`: the permission wrapper records the brief's acts in it. */
  ledger: AutomationStudioSiteResetLedger;
  lease: AutomationStudioHostResourceLease;
  signal: AbortSignal;
};

/**
 * A brief's own ending, which stops its loop and not only its next call: a
 * step the person was asked to permit and did not (a plan step refused, which
 * the loop cannot see into), or a check only a person could pass that was not
 * passed. `signal` aborts when either happens; `reason` then says which, in
 * plain words, and the brief comes back `blocked` with it.
 */
export type AutomationStudioProjectBriefEnding = {
  signal: AbortSignal;
  reason(): string | undefined;
};

/**
 * A build or repair brief's surroundings: the loop's harness tools,
 * routing, permissions and person-needed wiring (`loop`), the candidate
 * submission's domain surroundings (`submission`) and the partial-trial port
 * from `service/subflow-trial/` (`trial`). The dispatcher sets the loop's
 * signal, purse (the brief's allowance), iteration bound and call scope.
 */
export type AutomationStudioProjectBuilderPorts = {
  loop: Omit<BuilderInput["loop"], "signal" | "purse" | "maxIterations">;
  submission: Omit<BuilderInput["submission"], "signal">;
  trial?: AutomationStudioSubflowTrialPort | undefined;
  observe?: BuilderInput["observe"];
  /** The brief's permission and person-needed ending; absent, only the build's cancellation stops its loop. */
  ended?: AutomationStudioProjectBriefEnding | undefined;
};

/**
 * A reset brief's surroundings: a loop whose tools reverse this build's own
 * lasting acts through the site's controls. `remainingActs` says what is
 * still to undo; absent, the project ledger's acts still in place.
 */
export type AutomationStudioProjectResetPorts = {
  loop: Omit<AutomationStudioLlmEvidenceLoopInput, "draft" | "dryRun" | "discoveryOnly" | "finishingTools" | "fullRunRequired" | "completionSchema" | "checkCompletion" | "callScope" | "signal" | "purse" | "maxIterations">;
  remainingActs?: (() => Promise<readonly AutomationStudioSiteResetNamedAct[]>) | undefined;
  /** As a builder's: the reset's own permission and person-needed ending. */
  ended?: AutomationStudioProjectBriefEnding | undefined;
};

/** Makes each brief's ports once its lease is held. */
export type AutomationStudioProjectBriefPortFactory = {
  builder(request: AutomationStudioProjectBriefPortRequest): AutomationStudioProjectBuilderPorts | Promise<AutomationStudioProjectBuilderPorts>;
  reset(request: AutomationStudioProjectBriefPortRequest): AutomationStudioProjectResetPorts | Promise<AutomationStudioProjectResetPorts>;
};

export type AutomationStudioProjectDispatcherInput = {
  record: {
    store: Pick<AutomationStudioProjectBuildRecordStore, "read" | "recordReturn" | "recordAllowance">;
    ref: AutomationStudioProjectBuildRef;
  };
  /** The build's purse; each brief's allowance is carved from it. */
  purse: AutomationStudioLlmBuildPurse;
  cancellation: AutomationStudioProjectDispatchCancellation;
  /** The domain's host-resource port; one scheduler per port, shared by every build on it. */
  host: AutomationStudioHostResourcePort;
  /** The project's one lasting-act ledger. */
  ledger: AutomationStudioSiteResetProjectLedger;
  ports: AutomationStudioProjectBriefPortFactory;
  /** The call cap of a brief's allowance; absent, the brief's `maxIterations`. Its subflow trials' judge calls count against it too. */
  maxCalls?: ((brief: AutomationStudioProjectSubflowBrief) => number | undefined) | undefined;
  /** The builder loop; replaced only by tests. */
  runBuilder?: typeof runAutomationStudioSubflowBuilderLoop | undefined;
};
