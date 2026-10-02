// The node library as one thing the model may do: run one of its nodes, now,
// against the live target.
//
// **Why this exists.** A build used to be offered exploration tools that were
// not the nodes the Flow is made of. Five invented verbs on one side --
// inspect, navigate, press, enter a field, detect a list -- and eighteen real
// output nodes on the other, and nothing joined them. So what the model proved
// while exploring was never what shipped, and a node could enter a Flow having
// never once been executed. The user's instruction was to delete that split:
// the exploratory output is to be the same nodes with the same parameters, so
// the Flow is assembled from steps that provably worked.
//
// **Why one tool rather than one tool per node.** The catalog is whatever the
// registry holds -- Core's built-ins, the domain's nodes, and whatever a host
// or a person registered afterwards -- and it has to stay that way: a node
// added later must appear here with nobody editing this file. One tool per node
// would mean the model's grammar grew a full JSON schema per node on every
// request, and a list this module would have to curate. So there is one verb,
// its argument names the node, and the names it may take are read from the
// registry at the moment the tool is built.
//
// **The names are the whole library.** The enumerated names here are every
// available node, as is the catalog the model is shown beside its evidence,
// which carries each of them whole (`flow-bootstrap/plan/catalog.ts`). Until
// 2026-09-30 that catalog was fitted to a byte budget, so this list was what
// kept a node the catalog dropped runnable.
//
// **What the tool does not decide.** Whether a call looked or changed, what it
// should be recorded as, and whether it belongs in the result are properties of
// the call and not of this tool, so they come back on the execution result's
// `draft` (`../evidence-loop.ts`). That is why the tool declares
// `perCallEffect`.

import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../action-permissions/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../evidence-loop.ts";

/** The one verb that runs a node from the library. */
export const AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID = "core.run_node";

/**
 * The class the worked example names.
 *
 * Read off the declared classes rather than written into the prose, so a class
 * renamed or removed in `action-permissions/` is a compile error here instead
 * of an example that teaches a word the gate no longer knows. The list itself
 * is interpolated for the same reason: a class added there appears in the
 * guidance with nobody editing this file.
 */
const PUBLISHING: (typeof AUTOMATION_STUDIO_ACTION_CONSEQUENCES)[number] = "send_or_publish";

const DESCRIPTION = [
  "Run one node from the library against the live target, now, and get back what that node really did.",
  "This is the same node, with the same parameters, that the finished Flow runs: there is no separate exploration vocabulary.",
  "Name the node in `node`, exactly as the catalog prints its id, and give that node's own parameters in `parameters`.",
  "Where a node acts on something you observed, name it under `target` as {\"handle\": \"<the handle the evidence printed, copied exactly>\"}, and leave every other way of naming it out. Never write a locator, a description or a guess of your own -- you have not been shown one, and a step that names something you did not observe is refused.",
  "A node that reads a repeating list names that list the same way: its request is {\"handle\": \"<the handle the detection tool issued>\"} with the fields you want beside it, never a locator of your own. Detect the list first, then run the node and read the rows it really returned.",
  "A node that runs and succeeds becomes a step of the Flow you are building, with the parameters it ran with, and you never write it down again.",
  // A check is not a failure to try again. "Run again. A failure ends nothing"
  // is what a build read as permission to knock on a robot check until the
  // site locked it out (`run-munp80f5-c31ea417`); a page that needs a person
  // is now handed to one (`../../flow-bootstrap/person-needed.ts`), so the
  // model is told never to act on a check at all. Six characters under the
  // bound below.
  "A failed node says what went wrong and how things now stand. A page that needs a person goes to the person: never press, type into or reload a check.",
  "Run a node that only reads -- a snapshot, a wait, an assertion -- to see where you are; run one that acts to make the page do what the instruction needs.",
  // "only reads" earns its eight characters: a build that had to collect a
  // page of products into a table read "leaves nothing behind" as a question
  // about the dataset it would produce, answered `create_new` for the node that
  // reads the list, and stopped to ask permission to read
  // (`run-mueozmp8-348a2057`). The gate now disregards that answer; this is so
  // it is not reached for. There was no room for a sentence: the description is
  // 1,990 of the 2,000 characters a provider accepts, and a build whose first
  // request is refused runs nothing at all (`tests/run-node.test.ts`).
  // "or opens checkout" below is the one example a live build needed (t195-w18):
  // models declared `move_money` on the press that only opens a checkout page.
  `Say in \`consequences\` what running this node would lastingly do, from ${AUTOMATION_STUDIO_ACTION_CONSEQUENCES.join(", ")}: [] when it only reads or leaves nothing behind, and a node that sends, publishes, orders, deletes or changes something saved names its class and is put to the person first.`,
  `Judge this node, not the Flow: in one Flow the press that applies a filter or opens checkout is [] and the press that submits the post is ${PUBLISHING}.`,
  "A step joins the Flow only when added (add on the call or amend_draft add); correct one with amend_draft: rerun, drop, reorder."
].join(" ");

/**
 * The run-node tool for one resolved library, or nothing when the library is
 * empty.
 *
 * `initial` is one call the caller takes responsibility for: the loop makes it
 * before the first paid decision, so the model's first question is asked with
 * the target already in front of it. The caller writes that argument, not the
 * model, which is why it may be declared on a tool that can also act.
 *
 * `arrival` is the call that takes the target to where the Flow starts: the
 * node that goes somewhere, the parameter the destination is written into, and
 * the destination, which Core carries as given and never reads. It rides on
 * `initial` and is offered only when its node is in the library, so a node the
 * domain cannot run is never the call a build opens with. The loop then opens
 * with it instead of the look (`../evidence-loop.ts`), as the step the model
 * would otherwise have paid a decision to take (F31, `run-muqc07fh-eeffbc86`).
 */
export function automationStudioLlmRunNodeTool(input: {
  nodeIds: readonly string[];
  initial?: JsonObject;
  arrival?: { node: string; parameter: string; location: string };
}): AutomationStudioLlmEvidenceTool | undefined {
  const nodeIds = [...new Set(input.nodeIds)].filter((id) => typeof id === "string" && id.length > 0).sort();
  if (!nodeIds.length) return undefined;
  // Every node is enumerated, however many (2026-09-30): past 400 the names
  // used to be left to the catalog.
  const node: JsonObject = { enum: [...nodeIds], description: "The node's id, copied exactly from the catalog." };
  return {
    toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID,
    description: DESCRIPTION,
    // The worst a call may do, which is what the offering gate reads. Each call
    // says for itself what it actually did.
    effect: "mutate",
    perCallEffect: true,
    // Which node a call runs, so the loop can withdraw the looks among them
    // without withdrawing the library (`../decision-handlers/look-withdrawal.ts`).
    actionInputKey: "node",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["node", "parameters", "consequences"],
      properties: {
        node,
        parameters: { type: "object", description: "That node's own parameters, exactly as its catalog entry declares them." },
        consequences: {
          type: "array",
          maxItems: 5,
          uniqueItems: true,
          items: { type: "string", enum: [...AUTOMATION_STUDIO_ACTION_CONSEQUENCES] },
          description: `What running this node would lastingly do. [] leaves nothing behind; a press that submits, orders, deletes or changes something saved names its class, such as ${PUBLISHING}.`
        }
      }
    },
    ...(input.initial ? { initialObservation: { input: input.initial, ...arrivalFor(input.arrival, nodeIds) } } : {})
  };
}

/** The arrival as a call of this tool, when its node is one the library offers. */
function arrivalFor(arrival: { node: string; parameter: string; location: string } | undefined, nodeIds: readonly string[]): { arrival?: JsonObject } {
  if (!arrival || !arrival.parameter || !arrival.location || !nodeIds.includes(arrival.node)) return {};
  // Nothing lasting: going to a page changes no saved thing.
  return { arrival: { node: arrival.node, parameters: { [arrival.parameter]: arrival.location }, consequences: [] } };
}
