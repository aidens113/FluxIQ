import { automationStudioActivityHumanLabel } from "./human-label.ts";
import { automationStudioActivityNodeName } from "./node-name.ts";

/** `core.describe_nodes` (`../../llm/node-tools/describe-nodes.ts`), read as a plain string so this module does not reach into the loop. */
const DESCRIBE_NODES = "core.describe_nodes";
/** `core.recall_result` (`../../llm/evidence-recall/tool-id.ts`). */
const RECALL_RESULT = "core.recall_result";
/** `core.run_flow` (`../../llm/node-tools/run-flow.ts`). */
const RUN_FLOW = "core.run_flow";
/** The most step names a title lists before it says how many more. */
const MAX_NAMED = 3;

/** A control's or a step's name, in the curly quotes a card reads its target from (`ui/activity-action/action-of.ts`). */
const quoted = (name: string): string => `“${name}”`;

function listed(names: readonly string[]): string {
  const shown = names.slice(0, MAX_NAMED);
  const more = names.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : shown[0] ?? "";
}

/**
 * What one of Core's own look-up tools does, said from its input: reading how
 * the steps it names are used (`Looking up how to use “Type and Click”`), and
 * reading an earlier call's result again (`Looking again at what “open store
 * picker 1” found`), and running part of the Flow again (`Running steps 3 to
 * 5 of the Flow`, t244). Nothing for any other tool. These named no verb, so
 * they read "Working on the page" (t193).
 */
export function automationStudioActivityCoreTool(call: { toolId: string; value?: unknown }): string | undefined {
  const value = call.value && typeof call.value === "object" && !Array.isArray(call.value) ? call.value as Record<string, unknown> : {};
  if (call.toolId === DESCRIBE_NODES) {
    const ids = Array.isArray(value.ids) ? value.ids.filter((id): id is string => typeof id === "string") : [];
    const names = [...new Set(ids.map(automationStudioActivityNodeName).filter((name): name is string => name !== undefined))];
    return names.length > 0 ? `Looking up how to use ${quoted(listed(names))}` : "Looking up how to use a step";
  }
  if (call.toolId === RECALL_RESULT) {
    // The call id the model gave the call it recalls ("open-store-picker-1"),
    // in words; Core's own dotted ids ("initial.core.run_node") are not.
    const recalled = typeof value.callId === "string" && !value.callId.includes(".") ? automationStudioActivityHumanLabel(value.callId.replace(/[-_]+/gu, " "), 60) : undefined;
    return recalled ? `Looking again at what ${quoted(recalled)} found` : "Looking again at what an earlier step found";
  }
  if (call.toolId === RUN_FLOW) {
    const step = (each: unknown): each is number => typeof each === "number" && Number.isInteger(each) && each >= 1;
    if (!step(value.from)) return "Running part of the Flow";
    if (!step(value.to)) return `Running the Flow from step ${value.from}`;
    return value.to === value.from ? `Running step ${value.from} of the Flow` : `Running steps ${value.from} to ${value.to} of the Flow`;
  }
  return undefined;
}
