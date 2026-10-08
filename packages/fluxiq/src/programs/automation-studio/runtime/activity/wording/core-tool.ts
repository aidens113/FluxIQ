import { activityActionVerb, type ActivityActionVerb } from "../../../../../ui/index.ts";
import { automationStudioActivityHumanLabel } from "./human-label.ts";

/** `core.describe_nodes` (`../../llm/node-tools/describe-nodes.ts`), read as a plain string so this module does not reach into the loop. */
const DESCRIBE_NODES = "core.describe_nodes";
/** `core.recall_result` (`../../llm/evidence-recall/tool-id.ts`). */
const RECALL_RESULT = "core.recall_result";
/** `core.run_flow` (`../../llm/node-tools/run-flow.ts`). */
const RUN_FLOW = "core.run_flow";
/** `core.submit_candidate` (`../../flow-bootstrap/candidate/authoring-loop.ts`). */
const SUBMIT_CANDIDATE = "core.submit_candidate";
/** `core.test_candidate` (`../../flow-bootstrap/candidate/trial-gate.ts`). */
const TEST_CANDIDATE = "core.test_candidate";
/**
 * A candidate build's own tools, said as the act a person understands: the
 * chat read "Using “Submit candidate”" and "Using “Test candidate”" (t362,
 * lane A round 4, `run-muyrpbnk-fef374e7`). Never a revision or digest: the
 * call names both, and the person never sees either.
 */
const CANDIDATE_TOOLS: ReadonlyMap<string, string> = new Map([
  [SUBMIT_CANDIDATE, "Saving the Flow's steps"],
  [TEST_CANDIDATE, "Testing the whole Flow from the start"]
]);
/** The most kinds of step a look-up's title says before it says "and more". */
const MAX_NAMED = 3;

/**
 * What a person learns to do by looking a kind of step up, by the verb its id
 * names (`ui/activity-action/verb.ts`). A read whose id goes on to name a list
 * is reading a list.
 */
const HOW_TO: ReadonlyMap<ActivityActionVerb, string> = new Map<ActivityActionVerb, string>([
  ["navigate", "open a page"],
  ["back", "go back a page"],
  ["click", "click"],
  ["type", "type"],
  ["search", "search"],
  ["clear", "clear a field"],
  ["select", "choose an option"],
  ["check", "tick a box"],
  ["upload", "add a file"],
  ["read", "read from the page"],
  ["list", "read a list"],
  ["describe", "read a control's details"],
  ["detect", "find a repeating list"],
  ["look", "look over the page"],
  ["scroll", "scroll"],
  ["wait", "wait for the page"],
  ["assert", "check the page"],
  ["download", "download a file"],
  ["key", "press a key"],
  ["dialog", "answer a dialog"],
  ["tab", "switch tabs"]
]);
/** A name the call carries, in the curly quotes a card reads its target from (`ui/activity-action/action-of.ts`). */
const quoted = (name: string): string => `“${name}”`;
/** A word after a read's verb that says it reads a list. */
const LIST_WORD = /^(list|rows|records|items)$/u;

/** What looking up the step `id` names teaches, in a person's words ("read a list"); nothing for an id that names no verb. */
function howTo(id: string): string | undefined {
  const words = (id.split(".").at(-1) ?? "").toLowerCase().split(/[-_\s]+/u).filter(Boolean);
  const at = words.findIndex((word) => activityActionVerb(word) !== undefined);
  const verb = at < 0 ? undefined : activityActionVerb(words[at]!)?.verb;
  if (verb === undefined) return undefined;
  return verb === "read" && words.slice(at + 1).some((word) => LIST_WORD.test(word)) ? "read a list" : HOW_TO.get(verb);
}

function listed(names: readonly string[], more: boolean): string {
  const shown = names.slice(0, MAX_NAMED);
  if (more || names.length > shown.length) return `${shown.join(", ")} and more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : shown[0] ?? "";
}

/**
 * What one of Core's own look-up tools does, said from its input: reading how
 * the kinds of step it names are used, in a person's words and never by a
 * node's name (`Looking up how to read a list`, `Looking up how to click and
 * type`; one whose verb no word names is "and more", and none at all "how to
 * use a step"), and reading an earlier call's result again (`Looking again at
 * what “open store picker 1” found`), and running part of the Flow again
 * (`Running the rest of the Flow`, t244). Nothing for any other tool. These
 * named no verb, so they read "Working on the page" (t193); the look-up then
 * named its node, "Look · Extract list" (R2-U-4, `run-muwansvz-a2b4a987`). A
 * part run's words name no step number: the person never sees the draft's
 * numbering (t195); the cards of the steps it sends say what each one does.
 * A candidate build's tools say what they do for the Flow: saving its steps,
 * and testing the whole Flow from the start (t362).
 */
export function automationStudioActivityCoreTool(call: { toolId: string; value?: unknown }): string | undefined {
  const candidateTool = CANDIDATE_TOOLS.get(call.toolId);
  if (candidateTool) return candidateTool;
  const value = call.value && typeof call.value === "object" && !Array.isArray(call.value) ? call.value as Record<string, unknown> : {};
  if (call.toolId === DESCRIBE_NODES) {
    const ids = Array.isArray(value.ids) ? value.ids.filter((id): id is string => typeof id === "string") : [];
    const ways = ids.map(howTo);
    const known = [...new Set(ways.filter((way): way is string => way !== undefined))];
    return known.length > 0 ? `Looking up how to ${listed(known, ways.includes(undefined))}` : "Looking up how to use a step";
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
    if (value.to === value.from) return "Running one step of the Flow";
    if (!step(value.to)) return value.from === 1 ? "Running the Flow from its start" : "Running the rest of the Flow";
    return "Running part of the Flow";
  }
  return undefined;
}
