/** A policy either asks for another iteration or returns its final result. */
export type AgentIterationResult<Result> = { kind: "continue" } | { kind: "complete"; result: Result };
