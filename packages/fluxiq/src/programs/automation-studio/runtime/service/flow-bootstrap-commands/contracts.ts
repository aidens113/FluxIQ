import type { AutomationStudioActionPermissionRequest } from "../../action-permissions/index.ts";
import type { AutomationStudioBootstrapAdaptation, AutomationStudioBootstrapAdaptationMode } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioFlowBootstrapGenerationGrant } from "./generation-request.ts";

// What a caller asks for when it generates a Flow Bootstrap adaptation, and
// what it gets back.

export type AutomationStudioGenerateFlowBootstrapAdaptationInput = {
  projectId: string;
  flowId: string;
  executionGrant: AutomationStudioFlowBootstrapGenerationGrant;
  evidenceGuided?: true;
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
};

export type AutomationStudioGenerateFlowBootstrapAdaptationResult = {
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
   * Present when the build met an action its grant did not permit and finished
   * anyway. The proposal is real and is stored, and nothing may be approved or
   * applied until the person has answered this: issue the next build's grant
   * with the classes it lists as `missing`.
   */
  permissionRequest?: AutomationStudioActionPermissionRequest;
};
