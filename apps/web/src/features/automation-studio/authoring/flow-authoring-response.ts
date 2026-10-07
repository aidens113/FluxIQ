import { parseAutomationStudioCandidateAuthoringResult, type AutomationStudioCandidateAuthoringResult } from "fluxiq/automation-studio/candidate-authoring";
import type { ApiResponse } from "../../programs/program-api";

/**
 * What an evidence-guided build or improvement answers. The panel asks for
 * Core's own authoring mode (`authoringMode: "configured"`), so which of the two
 * comes back is Core's setting (`FLUXIQ_AUTHORING_MODE`), never the panel's:
 * a proposed `adaptation` in legacy mode, an unverified `candidate` draft in
 * candidate mode.
 */
export type FlowAuthoringPayload = {
  adaptation?: { projectId?: string; flowId?: string; adaptationId?: string; status?: string };
  candidate?: AutomationStudioCandidateAuthoringResult;
};

/**
 * Passes a build's answer on, except a candidate that is not a valid draft of
 * the Flow it was asked for, which becomes a failure. A proposed adaptation is
 * passed on unchanged, as it always was.
 */
export function screenFlowAuthoringResponse(response: ApiResponse<FlowAuthoringPayload>, subject: { projectId: string; flowId: string }): ApiResponse<FlowAuthoringPayload> {
  const payload = response.payload as Record<string, unknown> | undefined;
  if (!response.ok || !payload || typeof payload !== "object" || !("candidate" in payload)) return response;
  return parseAutomationStudioCandidateAuthoringResult(response.payload, subject)
    ? response
    : { ...response, ok: false, error: "The build did not return a valid candidate draft for this Flow." };
}
