import type { AutomationStudioProblem } from "../../../api/contracts.ts";

// A page of Automation Studio problems.

export type AutomationStudioProblemPage = {
  problems: AutomationStudioProblem[];
  total: number;
  counts: { error: number; warning: number; info: number };
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
};
