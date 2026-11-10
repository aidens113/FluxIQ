import type { ProjectPartStep } from "../../../../api-contracts/automation/index.ts";
import type { OutlineArm } from "./arm.ts";
import type { OutlineLink } from "./link.ts";
import type { OutlineStepKind } from "./step-kind.ts";

/**
 * One step a person reads. `nodeIds` names every graph node the step stands
 * for, the node it is about first; hidden structural nodes (start, merge, a
 * hidden end) and the value-only nodes feeding it come after. Every node of the
 * graph is in exactly one step's `nodeIds`.
 */
export type OutlineStep = {
  /** "3", "5.1", "5.1.1"; empty for a heading that is not itself a step. */
  number: string;
  nodeIds: string[];
  kind: OutlineStepKind;
  words: string;
  /** The lasting classes the step declares (what it sends, deletes, pays or changes). */
  lasting: ProjectPartStep["lastingClasses"];
  /** The block the step's own words open: a loop's body, the "Only if" path. */
  children?: OutlineStep[];
  /** The other ways on, each with its own words ("Otherwise:", "If that does not work:"). */
  arms?: OutlineArm[];
  /** The Flow a "Run Flow" step runs. */
  link?: OutlineLink;
  /** For a `jump`, the node it goes to. */
  jumpTo?: string;
};
