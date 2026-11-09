// Turns a run's `ended` result into what the program gets: for an achieved run the
// outputs are checked once more against the declared type, so a typed `outputs` is
// never a lie, and the other three endings come back as they are.

import type { FluxNodeRunResult } from "@fluxiq/contracts/fluxnode";
import { validateJsonValue } from "@fluxiq/contracts/fluxnode";
import type { AnyFluxNode } from "../define/index.ts";
import { SdkError } from "../errors/index.ts";
import type { AchievedRun, RunOutcome } from "./run-types.ts";

/** The program's view of `result`. Throws `invalid_outputs` when an achieved run's outputs miss the node's declared type. */
export function finishRun<O>(node: AnyFluxNode, result: FluxNodeRunResult): RunOutcome<O> {
  if (result.status !== "achieved") return { ...result, status: result.status };
  if (result.outputs === undefined) throw new SdkError("protocol", `The run ${result.runId} was achieved but carries no outputs.`);
  const declared = node.spec.outputs;
  if (declared !== undefined) {
    const errors = validateJsonValue(declared, result.outputs);
    if (errors.length > 0) {
      throw new SdkError("invalid_outputs", `The engine's outputs for "${node.name}" do not fit its declared type:\n  ${errors.map((error) => `${error.path || "(outputs)"}: ${error.message}`).join("\n  ")}`);
    }
  }
  const achieved: AchievedRun<O> = { ...result, status: "achieved", outputs: result.outputs as O };
  return achieved;
}
