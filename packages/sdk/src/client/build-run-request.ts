// Turns a FluxNode, its inputs and the run options into the contracts' run request.
// Inputs written for a zod schema are parsed by it first, so defaults apply and a wrong
// value fails here with zod's message instead of at the engine.

import type { JsonObject } from "@fluxiq/contracts/core";
import type { FluxNodeRunRequestInput } from "@fluxiq/contracts/fluxnode";
import type { AnyFluxNode } from "../define/index.ts";
import { SdkError } from "../errors/index.ts";
import { isZodSchema } from "../schema/index.ts";
import type { ResumeOptions } from "./resume-options.ts";
import type { RunOptions } from "./run-types.ts";
import { splitRunOverrides } from "./split-run-overrides.ts";
import { withRunOptions } from "./with-run-options.ts";

/** The request that runs `node` over `inputs`. */
export function buildRunRequest(node: AnyFluxNode, inputs: unknown, options: RunOptions): FluxNodeRunRequestInput {
  let values = inputs;
  if (isZodSchema(node.inputsSchema)) {
    const parsed = node.inputsSchema.safeParse(inputs);
    if (!parsed.success) {
      const lines = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(inputs)"}: ${issue.message}`);
      throw new SdkError("invalid_inputs", `The inputs for "${node.name}" do not fit its declared type:\n  ${lines.join("\n  ")}`);
    }
    values = parsed.data;
  }
  return withRunOptions({ spec: node.spec, inputs: (values ?? {}) as JsonObject }, options);
}

/**
 * The request that continues a waiting or budget-out run. A resume keeps its first options and overrides, so a
 * JS caller that passes them anyway is refused here, by the contracts' codes, before any request.
 */
export function buildResumeRequest(resumeHandle: string, options: ResumeOptions): FluxNodeRunRequestInput {
  const given = (options as RunOptions).overrides;
  if (given !== undefined) {
    const split = splitRunOverrides(given);
    if (split.options !== undefined) throw new SdkError("run_request.options_on_resume", "A resumed run keeps its first options; do not pass options (retries, judge, budgetUsd, model, mode, timeoutMs) to resume.");
    throw new SdkError("run_request.overrides_on_resume", "A resumed run keeps its first overrides; do not pass overrides to resume.");
  }
  return withRunOptions({ resumeHandle }, options);
}
