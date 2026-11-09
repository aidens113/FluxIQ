// Turns a FluxNode, its inputs and the run options into the contracts' run request.
// Inputs written for a zod schema are parsed by it first, so defaults apply and a wrong
// value fails here with zod's message instead of at the engine.

import type { JsonObject } from "@fluxiq/contracts/core";
import type { FluxNodeRunRequestInput } from "@fluxiq/contracts/fluxnode";
import type { AnyFluxNode } from "../define/index.ts";
import { SdkError } from "../errors/index.ts";
import { isZodSchema } from "../schema/index.ts";
import type { RunOptions } from "./run-types.ts";

function withOptions(request: FluxNodeRunRequestInput, options: RunOptions): FluxNodeRunRequestInput {
  const out = { ...request };
  if (options.overrides !== undefined) out.options = options.overrides;
  if (options.correlationId !== undefined) out.correlationId = options.correlationId;
  if (options.idempotencyKey !== undefined) out.idempotencyKey = options.idempotencyKey;
  return out;
}

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
  return withOptions({ spec: node.spec, inputs: (values ?? {}) as JsonObject }, options);
}

/** The request that continues a waiting or budget-out run. */
export function buildResumeRequest(resumeHandle: string, options: RunOptions): FluxNodeRunRequestInput {
  return withOptions({ resumeHandle }, options);
}
