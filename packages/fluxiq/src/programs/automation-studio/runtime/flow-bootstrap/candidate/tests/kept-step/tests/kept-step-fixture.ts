// A library catalogue search for the step-hint replays (t666): a step choosing
// an option of a named group, then one list read, over a two-node demo
// domain, and the trial feedback a gate keeps for it. Used by
// `./kept-step-drop.test.ts` and the subflow mirror's
// `../../../../subflow-candidate/tests/kept-step-drop.test.ts`. No task, site, item
// or answer of any realistic scenario.
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../../../nodes/index.ts";

/** A domain node taking one object parameter `id`. */
function node(key: string, id: string): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1", id: `domain.demo.${key}`, version: "1.0.0", label: key, description: key, category: "action",
    source: { kind: "importer", domainId: "demo", implementationKey: key }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
    inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: [{ id, label: id, valueType: "object", required: true }]
  };
}

export const CHOOSE_NODE = node("choose_option", "choice");
export const READ_NODE = node("read_list", "readList");

/** The request: its own words name the format the first filter chooses, never the edition. */
export const AUDIOBOOK_REQUEST = "List every audiobook in the branch catalogue about mountain birds, with title and narrator.";

/** What a submission controller is made with, over the two-node domain. */
export const KEPT_STEP_SUBMISSION = {
  projectId: "project.test", flowId: "flow.test", baseDependencyDigest: "accepted.base",
  registry: new AutomationStudioNodeRegistry([CHOOSE_NODE, READ_NODE]),
  resolution: { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] }
};

export const AUDIOBOOK = { group: "Format", option: "Audiobook" };
export const UNABRIDGED = { group: "Edition", option: "Unabridged" };

/** A script of the given choices, then one list read with these conditions. */
export function choiceReadScript(choices: readonly object[], where: readonly object[] = []): JsonObject {
  const readList = { fields: { title: "title", narrator: "narrator", format: "format" }, where };
  return { summary: "Audiobooks", flow: [
    "flow: Audiobooks about mountain birds",
    ...choices.flatMap((choice, index) => [`step: choose filter ${index + 1}`, `  node: ${CHOOSE_NODE.id}`, `  choice: ${JSON.stringify(choice)}`]),
    "step: read the books", `  node: ${READ_NODE.id}`, `  readList: ${JSON.stringify(readList)}`
  ].join("\n") };
}

/**
 * The feedback a trial of `subflows` gives (`../../../../../service/candidate-trial/feedback.ts`):
 * its read and the steps before it, each named by its node id in a run.
 */
export function choiceTrialFeedback(subflows: ReadonlyArray<{ key: string; nodes: ReadonlyArray<{ key: string; definitionId: string; parameters?: Record<string, unknown> }> }>): JsonObject {
  const subflow = subflows.find((one) => one.nodes.some((step) => step.definitionId === READ_NODE.id))!;
  const id = (key: string) => `node.bootstrap.0a1b.${subflow.key}.${key}`;
  const steps = subflow.nodes.filter((step) => step.definitionId === CHOOSE_NODE.id).map((step) => {
    const choice = step.parameters?.choice as { group: string; option: string };
    return { nodeId: id(step.key), label: `choose ${choice.option}`, group: choice.group, chose: choice.option, addedChoice: true, resultCount: { before: 80, after: 20 } };
  });
  const read = subflow.nodes.find((step) => step.definitionId === READ_NODE.id)!;
  return { code: "candidate.trial_judged_no", reads: [{ nodeId: id(read.key), narrowedBefore: steps }] };
}
