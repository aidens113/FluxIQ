/** Why a pipeline stopped: a step could not run as declared. `code` is stable text, `stepId` names the step. */
export class PipelineError extends Error {
  readonly code: string;
  readonly stepId: string | undefined;

  constructor(code: string, message: string, stepId?: string) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
    this.stepId = stepId;
  }
}
