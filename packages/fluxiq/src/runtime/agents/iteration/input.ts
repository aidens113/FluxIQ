import type { AgentIterationResult } from "./result.ts";

export type AgentIterationInput<Result> = {
  maxIterations: number;
  iterate(iteration: number): Promise<AgentIterationResult<Result>>;
  exhausted(): Result | Promise<Result>;
};
