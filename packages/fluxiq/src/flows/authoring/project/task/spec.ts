import type { AutomationStudioProjectTaskPart } from "./part.ts";

export type AutomationStudioProjectTaskSpec = {
  parts: AutomationStudioProjectTaskPart[];
  notAsked: string[];
  /** Things that must show no change, judged relative to the state before a run (header, t775). */
  unchanged?: string[];
  digest: string;
};
