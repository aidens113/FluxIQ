/**
 * One completed step as `index.md` lists it. `role` and `briefId` name the
 * project agent that made it (`./scope.ts`); a step outside every agent scope
 * has neither.
 */
export type AutomationStudioLlmStepLogRow = {
  step: number;
  kind: string;
  tool: string | undefined;
  summary: string;
  costUsd: number | undefined;
  role?: string | undefined;
  briefId?: string | undefined;
};
