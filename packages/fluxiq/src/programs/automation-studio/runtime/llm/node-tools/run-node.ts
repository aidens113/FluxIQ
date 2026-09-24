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
// **The names are the whole library, not the described part of it.** The node
// catalog the model is shown beside its evidence is fitted to a byte budget and
// says so (`flow-bootstrap/plan/catalog.ts`, `catalogTruncated`). That was
// tolerable while the catalog only had to help the model *write* a node. It is
// not tolerable now that it also decides what the model can *run*, so the
// enumerated names here are every available node, and the truncated catalog
// governs only how much prose accompanies them.
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

/** How many node names the tool will enumerate before it stops naming them. */
const MAX_ENUMERATED_NODES = 400;

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
  "A node that fails comes back with what went wrong and the state as it now is: read it, change something, and run again. A failure ends nothing.",
  "Run a node that only reads -- a snapshot, a wait, an assertion -- to see where you are; run one that acts to make the page do what the instruction needs.",
  // "only reads" earns its eight characters: a build that had to collect a
  // page of products into a table read "leaves nothing behind" as a question
  // about the dataset it would produce, answered `create_new` for the node that
  // reads the list, and stopped to ask permission to read
  // (`run-mueozmp8-348a2057`). The gate now disregards that answer; this is so
  // it is not reached for. There was no room for a sentence: the description is
  // 1,990 of the 2,000 characters a provider accepts, and a build whose first
  // request is refused runs nothing at all (`tests/run-node.test.ts`).
  `Say in \`consequences\` what running this node would lastingly do, from ${AUTOMATION_STUDIO_ACTION_CONSEQUENCES.join(", ")}: [] when it only reads or leaves nothing behind, and a node that sends, publishes, orders, deletes or changes something saved names its class and is put to the person first.`,
  `Judge this node, not the Flow: in one Flow the press that applies a filter is [] and the press that submits the post is ${PUBLISHING}.`,
  "Correct a step you have already run with an amend_draft decision rather than by running it again: rerun replaces it, drop removes it, reorder moves it."
].join(" ");

/**
 * The run-node tool for one resolved library, or nothing when the library is
 * empty.
 *
 * `initial` is one call the caller takes responsibility for: the loop makes it
 * before the first paid decision, so the model's first question is asked with
 * the target already in front of it. The caller writes that argument, not the
 * model, which is why it may be declared on a tool that can also act.
 */
export function automationStudioLlmRunNodeTool(input: {
  nodeIds: readonly string[];
  initial?: JsonObject;
}): AutomationStudioLlmEvidenceTool | undefined {
  const nodeIds = [...new Set(input.nodeIds)].filter((id) => typeof id === "string" && id.length > 0).sort();
  if (!nodeIds.length) return undefined;
  // Past the bound the names are left to the catalog rather than enumerated,
  // so a library of thousands does not put its whole index in every request.
  const node: JsonObject = nodeIds.length <= MAX_ENUMERATED_NODES
    ? { enum: [...nodeIds], description: "The node's id, copied exactly from the catalog." }
    : { type: "string", minLength: 1, maxLength: 200, description: "The node's id, copied exactly from the catalog." };
  return {
    toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID,
    description: DESCRIPTION,
    // The worst a call may do, which is what the offering gate reads. Each call
    // says for itself what it actually did.
    effect: "mutate",
    perCallEffect: true,
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
    ...(input.initial ? { initialObservation: { input: input.initial } } : {})
  };
}
