import type { ClientGatewayActivityPhase } from "@fluxiq/contracts/client-gateway";
import { AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../../flow-draft/index.ts";
import type { AutomationStudioActivityCallWords } from "./action.ts";
import { automationStudioActivityToolCall } from "./tool-call.ts";

const COMPLETE = "Checking whether the Flow is finished";

/**
 * What a decision the model returned will do, said as the action a person
 * reads, from the decision's own shape: a tool call is the call's action
 * ("Clicking “Get a free quote”", `exploring`), a draft edit is "Updating the
 * draft Flow" (`building`), and a completion is "Checking whether the Flow is
 * finished" (`verifying`). Nothing for anything else, so an unreadable
 * decision is not narrated.
 *
 * Each says what FluxIQ is about to try, never a result: the model's reason
 * shown beside it is its own claim, and what came of it is said after, from
 * Core's answer. A completion read "Checking the Flow is finished -- The
 * napkin act a3 is already done by step 27", a step written and never run
 * (t193 1003, C14).
 */
export function automationStudioActivityDecision(
  decision: unknown,
  /** The bound domain's words for a call (`AutomationStudioLlmEvidenceLoopInput.describeCall`), when it has them. */
  describe?: (call: { toolId: string; value?: unknown }) => AutomationStudioActivityCallWords | undefined
): { phase: ClientGatewayActivityPhase; title: string } | undefined {
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) return undefined;
  const record = decision as { kind?: unknown; callId?: unknown; toolId?: unknown; input?: unknown };
  if (record.kind === "tool_call" && typeof record.toolId === "string") {
    const call = { callId: typeof record.callId === "string" ? record.callId : "", toolId: record.toolId, value: record.input };
    const words = automationStudioActivityToolCall(call, describe?.(call));
    return { phase: words.phase, title: words.title };
  }
  if (record.kind === "amend_draft") {
    return { phase: "building", title: automationStudioActivityToolCall({ callId: "", toolId: AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID }).title };
  }
  if (record.kind === "complete") return { phase: "verifying", title: COMPLETE };
  return undefined;
}
