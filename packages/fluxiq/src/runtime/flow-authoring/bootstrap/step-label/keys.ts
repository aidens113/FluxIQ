// The step keys of a proposal, each with the script labels that name it (t811).
import type { AutomationStudioSubflowProposal } from "../subflow-candidate/index.ts";

/** Every distinct step key of `latest`'s subflows, in plan order, and for each key the labels its script gave it. */
export function automationStudioSubflowFromStepKeys(latest: Pick<AutomationStudioSubflowProposal, "subflows" | "stepLabels">): { keys: string[]; labelsOf: ReadonlyMap<string, readonly string[]> } {
  const keys = [...new Set((latest.subflows ?? []).flatMap((subflow) => (subflow.nodes ?? []).map((node) => node.key)))];
  const labelsOf = new Map<string, string[]>();
  for (const [label, named] of Object.entries(latest.stepLabels ?? {})) {
    for (const key of named) if (keys.includes(key)) labelsOf.set(key, [...(labelsOf.get(key) ?? []), label]);
  }
  return { keys, labelsOf };
}
