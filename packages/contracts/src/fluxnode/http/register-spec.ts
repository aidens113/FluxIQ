// POST specs: register a FluxNode's spec, or a data pipeline (plan, D3). Registering is
// idempotent: the same name and hash answer the same registration. A new spec hash
// under a known name is a new task beside the old one, whose learned Flow is offered as
// a starting point (plan, N1).

import { z } from "zod";
import { dataPipelineSchema } from "../data/index.ts";
import { fluxNodeFieldSchemas } from "../fields/index.ts";
import { flowPathSchema, fluxNodeNameSchema } from "../flow/index.ts";
import { fluxNodeSpecSchema } from "../spec/index.ts";

/**
 * The request body: exactly one of `spec` and `pipeline`. A pipeline answers with its
 * `dataPipelineHash` as its `specHash`, and is filed by its name as a FluxNode is.
 */
export const fluxNodeRegisterSpecRequestSchema = z
  .object({ spec: fluxNodeSpecSchema.optional(), pipeline: dataPipelineSchema.optional() })
  .strict()
  .refine((request) => (request.spec === undefined) !== (request.pipeline === undefined), {
    message: "Give exactly one of spec and pipeline.",
    params: { code: "register_request.target" }
  });

export type FluxNodeRegisterSpecRequest = z.infer<typeof fluxNodeRegisterSpecRequestSchema>;

/**
 * - `specHash`: the spec's hash, as `fluxNodeSpecHash` computes it, or a pipeline's,
 *   as `dataPipelineHash` does;
 * - `flowPath`: where its learned Flow is filed (`fluxNodeNameToFlowPath`);
 * - `created`: false when this name and hash were already registered;
 * - `previousSpecHash`: the name's latest hash before this one, when it had one and
 *   it differs, so the program can say a new learned Flow starts.
 */
export const fluxNodeRegisterSpecResponseSchema = z
  .object({
    name: fluxNodeNameSchema,
    specHash: fluxNodeFieldSchemas.sha256Hex,
    flowPath: flowPathSchema,
    created: z.boolean(),
    previousSpecHash: fluxNodeFieldSchemas.sha256Hex.optional()
  })
  .strict();

export type FluxNodeRegisterSpecResponse = z.infer<typeof fluxNodeRegisterSpecResponseSchema>;
