import type { ClientGatewayActivityPhase } from "@fluxiq/contracts/client-gateway";
import { activityActionVerb } from "../../../../../ui/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../../flow-draft/index.ts";
import { automationStudioActivityAction, type AutomationStudioActivityCallWords } from "./action.ts";
import { automationStudioActivityCoreTool } from "./core-tool.ts";
import { automationStudioActivityNodeName } from "./node-name.ts";

/** The run-node tool's id (`../../llm/node-tools/run-node.ts`), read as a plain string so this module does not reach into the loop. */
const RUN_NODE_TOOL_ID = "core.run_node";
/** The callId prefix of a dry run's calls (`../../llm/node-tools/replay-draft.ts`). */
const DRY_RUN_PREFIX = "dryrun.";
/** The callId prefix of the call Core makes itself before the first decision (`../../llm/evidence-loop.ts`). */
const OPENING_PREFIX = "initial.";
/** The key a replay call carries (`../../llm/node-tools/replay.ts`). */
const REPLAY_KEY = "replay";
/** The callId of a step run again with a corrected argument, `rerun.<step>` (`../../llm/evidence-loop/rerun-request.ts`), and of the reset before it, `rerun.<step>.place` (`../../llm/node-tools/step-place.ts`). */
const RERUN = /^rerun\.(\d+)(?:\.|$)/u;

const FROM_THE_START = "Trying the Flow from the start";
/** The opening call when it goes to where the Flow starts rather than looks. */
const ARRIVAL = "Opening where the Flow starts";
/** The opening call when it looks at the page the Flow starts on. */
const OPENING_LOOK = "Looking over the page the Flow starts on";

const lowerFirst = (text: string): string => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;

/**
 * What a call says when no verb names it: the node it runs ("Running the
 * “Merge” step"), else the tool's own words ("Using “recall notes”"), never the
 * id and never "Working on the page", which said nothing a person could tell
 * apart (t193).
 */
function unnamed(toolId: string, node: string | undefined): string {
  const name = automationStudioActivityNodeName(node ?? (toolId === RUN_NODE_TOOL_ID ? "" : toolId));
  if (!name) return "Running a step";
  return node ? `Running the “${name}” step` : `Using “${name}”`;
}

/**
 * What one tool call is, said from the call's own input and nothing else --
 * never its evidence, never the model's text.
 *
 * - `title` is the action a person reads ("Clicking “Get a free quote”"), what
 *   Core's own look-ups read ("Looking up how to use “Type”",
 *   `./core-tool.ts`), and never a sentence that names no action or target;
 * - `label` is the status sentence while it runs;
 * - `kind` is `note` for Core's own bookkeeping calls (the opening look made
 *   before the first decision, and a dry run or a rerun putting the page
 *   back), which a reader may hide, and `tool` for a step that is part of the
 *   work -- the opening call that goes to where the Flow starts among them;
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
  const own = automationStudioActivityCoreTool(call);
  if (own) return { phase: "exploring", kind: "tool", title: own, label: own, dryRun: false };
  const value = call.value && typeof call.value === "object" && !Array.isArray(call.value) ? call.value as Record<string, unknown> : {};
  const node = call.toolId === RUN_NODE_TOOL_ID && typeof value.node === "string" && value.node ? value.node : undefined;
  const action = automationStudioActivityAction({ id: node ?? call.toolId, parameters: value.parameters, words });
  const named = node ? { node } : {};
  if (call.callId.startsWith(DRY_RUN_PREFIX)) {
    if (value[REPLAY_KEY] === "reset") {
      return { phase: "verifying", kind: "note", title: "Putting the page back to where the Flow starts", label: FROM_THE_START, dryRun: true };
    }
    const title = action ?? unnamed(call.toolId, node);
    return { phase: "verifying", kind: "tool", title, label: `${FROM_THE_START}: ${lowerFirst(title)}`, dryRun: true, ...named };
  }
  if (call.callId.startsWith(OPENING_PREFIX)) {
    // A build told where its Flow starts opens by going there, and that call is
    // the Flow's first step rather than bookkeeping (`../../llm/evidence-loop.ts`,
    // F31). Its verb is read back from the action's opening "-ing" word, as a
    // card reads it, and the title keeps that word so the card's icon agrees.
    if (action && activityActionVerb(action.split(" ")[0] ?? "", "gerund")?.verb === "navigate") {
      return { phase: "exploring", kind: "tool", title: ARRIVAL, label: ARRIVAL, dryRun: false, ...named };
    }
    // Core's own look before the first decision: the domain's observation
    // node, with nothing to name but the page it looks at.
    return { phase: "exploring", kind: "note", title: OPENING_LOOK, label: OPENING_LOOK, dryRun: false, ...named };
  }
  const rerun = RERUN.exec(call.callId)?.[1];
  if (value[REPLAY_KEY] === "reset") {
    // A rerun puts the page back where its step starts before running it
    // again: bookkeeping, like a dry run's reset. Its row read "Action · the
    // page" (t193, `run-muqiojz4-04a7a8fc`).
    const title = rerun ? `Putting the page back to where step ${rerun} starts` : "Putting the page back to where the step starts";
    return { phase: "exploring", kind: "note", title, label: title, dryRun: false };
  }
  const title = action ?? unnamed(call.toolId, node);
  const label = rerun ? `Trying step ${rerun} again: ${lowerFirst(title)}` : title;
  return { phase: "exploring", kind: "tool", title, label, dryRun: false, ...named };
}
