import type { JsonObject } from "../../../../../core/index.ts";
import { PipelineError, type PipelineSdkPort } from "../../pipelines/index.ts";
import type { FluxNodeRun } from "../fluxnode-run.ts";

/** The most records one `transform_needed` event carries (the contract's). */
const MOST_RECORDS = 1000;

/**
 * The program's callbacks over the event stream. A `transform_needed` event names the step, the callback and
 * the records; the program answers with `transform_answer` (records, or the error its callback raised).
 * A sink has no event of its own in the contracts, so it uses the same one: the program runs its callback
 * and answers with no records, and a transform's answer is its callback's records.
 * A wait the run's Stop or end settled gives no answer, which stops the pipeline.
 */
export function pipelineSdkPort(run: FluxNodeRun): PipelineSdkPort {
  const ask = async (stepId: string, callback: string, records: JsonObject[]): Promise<JsonObject[]> => {
    const answers: JsonObject[] = [];
    for (let start = 0; start < Math.max(1, records.length); start += MOST_RECORDS) {
      const answer = await run.waitFor({ type: "transform_needed", eventId: run.nextEventId(), stepId, callback, records: records.slice(start, start + MOST_RECORDS) });
      if (answer?.type !== "transform_answer") throw new PipelineError("pipeline.aborted", "The pipeline was stopped before the program answered its callback.", stepId);
      if (answer.error !== undefined) throw new PipelineError("pipeline.callback_failed", `The program's callback "${callback}" raised: ${answer.error}`, stepId);
      answers.push(...(answer.records ?? []));
    }
    return answers;
  };
  return {
    transform: async ({ stepId, callback, records }) => await ask(stepId, callback, records),
    sink: async ({ stepId, callback, records }) => {
      await ask(stepId, callback, records);
    }
  };
}
