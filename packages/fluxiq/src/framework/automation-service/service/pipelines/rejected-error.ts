import { PipelineError } from "./errors.ts";

export type PipelineProblem = { index: number; path: string; message: string };

/** A validate step with `onInvalid: "reject"` met invalid records. The run treats it as a "no" to fix. */
export class PipelineRejectedError extends PipelineError {
  readonly problems: readonly PipelineProblem[];

  constructor(stepId: string, problems: readonly PipelineProblem[]) {
    const first = problems[0];
    super("pipeline.rejected", `${problems.length} problem${problems.length === 1 ? "" : "s"} in the records of step "${stepId}"${first === undefined ? "" : `; first: record ${first.index} at "${first.path}": ${first.message}`}`, stepId);
    this.name = "PipelineRejectedError";
    this.problems = problems;
  }
}
