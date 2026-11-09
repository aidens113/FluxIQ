// POST specs: register a FluxNode's spec. Registering is idempotent: the same name and
// spec hash answer the same registration. A new spec hash under a known name is a new
// task beside the old one, whose learned Flow is offered as a starting point (plan, N1).

import { z } from "zod";
import { fluxNodeFieldSchemas } from "../fields/index.ts";
import { flowPathSchema, fluxNodeNameSchema } from "../flow/index.ts";
import { fluxNodeSpecSchema } from "../spec/index.ts";

/** The request body: the spec. */
export const fluxNodeRegisterSpecRequestSchema = z.object({ spec: fluxNodeSpecSchema }).strict();

export type FluxNodeRegisterSpecRequest = z.infer<typeof fluxNodeRegisterSpecRequestSchema>;

/**
 * - `specHash`: the spec's hash, as `fluxNodeSpecHash` computes it;
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
