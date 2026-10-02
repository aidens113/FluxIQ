import type { ClientGatewayActivityPhase } from "@fluxiq/contracts/client-gateway";
import { AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../../flow-draft/index.ts";
import { automationStudioActivityAction, type AutomationStudioActivityCallWords } from "./action.ts";

/** The run-node tool's id (`../../llm/node-tools/run-node.ts`), read as a plain string so this module does not reach into the loop. */
const RUN_NODE_TOOL_ID = "core.run_node";
/** The callId prefix of a dry run's calls (`../../llm/node-tools/replay-draft.ts`). */
const DRY_RUN_PREFIX = "dryrun.";
/** The callId prefix of the call Core makes itself before the first decision (`../../llm/evidence-loop.ts`). */
const OPENING_PREFIX = "initial.";
/** The key a replay call carries (`../../llm/node-tools/replay.ts`). */
const REPLAY_KEY = "replay";

const FROM_THE_START = "Trying the Flow from the start";

/**
 * What one tool call is, said from the call's own input and nothing else --
 * never its evidence, never the model's text.
 *
 * - `title` is the action a person reads ("Clicking “Get a free quote”");
 * - `label` is the status sentence while it runs;
 * - `kind` is `note` for Core's own bookkeeping calls (the opening call made
 *   before the first decision, and a dry run putting the page back), which a
 *   reader may hide, and `tool` for a
 *   step that is part of the work;
 * - `phase` is `verifying` for a dry run's calls, `building` for the draft
 *   tool and `exploring` for everything else;
 * - `node` is the node id a run-node call names, for the raw record.
 */
export function automationStudioActivityToolCall(call: { callId: string; toolId: string; value?: unknown }, words?: AutomationStudioActivityCallWords): {
  phase: ClientGatewayActivityPhase;
  kind: "tool" | "note";
  title: string;
  label: string;
  dryRun: boolean;
  node?: string;
} {
  if (call.toolId === AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID) {
    return { phase: "building", kind: "tool", title: "Updating the draft Flow", label: "Updating the draft Flow", dryRun: false };
  }
  const value = call.value && typeof call.value === "object" && !Array.isArray(call.value) ? call.value as Record<string, unknown> : {};
  const node = call.toolId === RUN_NODE_TOOL_ID && typeof value.node === "string" && value.node ? value.node : undefined;
  const action = automationStudioActivityAction({ id: node ?? call.toolId, parameters: value.parameters, words });
  const named = node ? { node } : {};
  if (call.callId.startsWith(DRY_RUN_PREFIX)) {
    if (value[REPLAY_KEY] === "reset") {
      return { phase: "verifying", kind: "note", title: "Putting the page back to where the Flow starts", label: FROM_THE_START, dryRun: true };
    }
    const title = action ?? "Running a step";
    return { phase: "verifying", kind: "tool", title, label: `${FROM_THE_START}: ${title.charAt(0).toLowerCase()}${title.slice(1)}`, dryRun: true, ...named };
  }
  if (call.callId.startsWith(OPENING_PREFIX)) {
    const title = action ?? "Looking at where the Flow starts";
    return { phase: "exploring", kind: "note", title, label: title, dryRun: false, ...named };
  }
  const title = action ?? (call.toolId === RUN_NODE_TOOL_ID ? "Trying a step on the page" : "Working on the page");
  return { phase: "exploring", kind: "tool", title, label: title, dryRun: false, ...named };
}
