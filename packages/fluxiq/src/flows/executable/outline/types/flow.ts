import type { OutlineInterface } from "./interface.ts";
import type { OutlineIssue } from "./issue.ts";
import type { OutlineStep } from "./step.ts";

/** A stored Flow graph as a numbered list of plain steps. */
export type FlowOutline = { interface: OutlineInterface; steps: OutlineStep[]; issues: OutlineIssue[] };
