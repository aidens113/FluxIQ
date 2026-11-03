import type { AgentIterationInput } from "./input.ts";

/** The sole bounded iteration driver; decision, cancellation, budget and tool policy are supplied by its caller. */
export async function runAgentIterations<Result>(input: AgentIterationInput<Result>): Promise<Result> {
  for (let iteration = 1; iteration <= input.maxIterations; iteration += 1) {
    const next = await input.iterate(iteration);
    if (next.kind === "complete") return next.result;
  }
  return await input.exhausted();
}
