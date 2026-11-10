// A step that runs another Flow (rule 4): "Run Flow ▸ Name", linked by the
// Flow's id. The name is the caller's for that Flow, else the step's own label
// when it reads as plain words; the lasting classes are what the step declares
// and what the caller says the Flow can cause.
import type { ProjectPartStep } from "../../../../api-contracts/automation/index.ts";
import type { AutomationStudioFlowNode } from "../../graph/index.ts";
import type { FlowOutlineOptions, OutlineLink } from "../types/index.ts";
import { outlinePartStepOf } from "./part-step.ts";

/** The words, lasting classes and link of a calling step. */
export function outlineCallWords(node: AutomationStudioFlowNode, link: OutlineLink | undefined, describeFlow: FlowOutlineOptions["describeFlow"]): { words: string; lasting: ProjectPartStep["lastingClasses"] } {
  const part = outlinePartStepOf(node);
  const callee = link ? describeFlow?.(link) : undefined;
  const name = callee?.name.trim() || part.plainLabel || (link?.kind === "fluxnode" ? link.id : "another Flow");
  const lasting = [...new Set([...part.said.lastingClasses, ...(callee?.lastingClasses ?? [])])];
  return { words: `Run Flow ▸ ${name}`, lasting };
}
