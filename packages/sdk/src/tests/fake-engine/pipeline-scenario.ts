// A scripted run for a data pipeline: the records start from the input list the source names, each step
// that calls the program (a function transform, an SDK sink) asks for its callback with `transform_needed`
// and goes on with the answer, and the run ends achieved with the final records, as the engine's does.

import type { JsonObject } from "@fluxiq/contracts/core";
import { dataFieldPathSteps, type FluxNodeRunRequest } from "@fluxiq/contracts/fluxnode";
import type { FakeRun } from "./fake-run.ts";
import type { Scenario } from "./start-fake-engine.ts";

/** The scenario. `endBudgetOut` ends a first run `budget_out`, so its resume handle continues it and the resumed run completes. */
export function pipelineScenario(options: { endBudgetOut?: boolean } = {}): Scenario {
  return async (run: FakeRun, request: FluxNodeRunRequest) => {
    const pipeline = request.pipeline;
    if (pipeline === undefined) return run.end({ status: "stopped" });
    if (options.endBudgetOut === true && request.resumeHandle === undefined) return run.end({ status: "budget_out" });
    const field = pipeline.source.kind === "input" ? dataFieldPathSteps(pipeline.source.field) : [];
    let records = (field.reduce<unknown>((value, key) => (value as Record<string | number, unknown> | undefined)?.[key], run.inputs) ?? []) as JsonObject[];
    let asked = 0;
    for (const step of pipeline.steps) {
      const callback = step.kind === "transform" ? step.callback : step.kind === "sink" && step.to.kind === "sdk" ? step.to.callback : undefined;
      if (callback === undefined) continue;
      asked += 1;
      const eventId = `transform_${asked}`;
      run.emit({ type: "transform_needed", eventId, stepId: step.id, callback, records });
      const answer = await run.awaitAnswer(eventId, 2000);
      if (answer?.type !== "transform_answer" || answer.records === undefined) return run.end({ status: "stopped" });
      if (step.kind === "transform") records = answer.records;
    }
    return run.end({ status: "achieved", outputs: records });
  };
}
