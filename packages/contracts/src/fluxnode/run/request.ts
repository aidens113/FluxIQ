// A request to run a FluxNode (plan, N5-N9): an inline spec or a registered name, the
// inputs, any option overrides, and the caller's correlation id and idempotency key.
// A waiting or budget-out run continues from its resume handle instead.

import { z } from "zod";
import { dataPipelineSchema } from "../data/index.ts";
import { fluxNodeFieldSchemas } from "../fields/index.ts";
import { fluxNodeNameSchema } from "../flow/index.ts";
import { parseWithZod, type FluxNodeParseResult } from "../issue/index.ts";
import { jsonObjectSchema } from "../json/index.ts";
import { fluxNodeOptionsSchema, fluxNodeSpecSchema } from "../spec/index.ts";
import { checkFluxNodeRunInputs } from "./inputs-check.ts";
import { fluxNodeResumeHandleSchema } from "./result.ts";

/**
 * Exactly one of:
 *
 * - `spec`: the FluxNode itself, registered on the way if it is new;
 * - `name`: a registered FluxNode, at its latest spec or at `specHash`;
 * - `resumeHandle`: continue a waiting or budget-out run, keeping its inputs;
 * - `pipeline`: a data pipeline (plan, D3), compiled into a Flow and registered on
 *   the way if it is new; a registered one runs by `name`, as a FluxNode does.
 *
 * - `inputs`: the inputs, checked against an inline spec here and against a
 *   registered one by Core; not allowed with `resumeHandle`;
 * - `options`: overrides of the spec's options, each replacing the declared one;
 *   `retries` still stays at least 3;
 * - `correlationId`: ties separate runs together, as plain code calling one FluxNode
 *   after another does (plan, D3);
 * - `idempotencyKey`: the same key with the same request returns the same run.
 */
export const fluxNodeRunRequestSchema = z
  .object({
    spec: fluxNodeSpecSchema.optional(),
    name: fluxNodeNameSchema.optional(),
    specHash: fluxNodeFieldSchemas.sha256Hex.optional(),
    resumeHandle: fluxNodeResumeHandleSchema.optional(),
    pipeline: dataPipelineSchema.optional(),
    inputs: jsonObjectSchema.optional(),
    options: fluxNodeOptionsSchema.optional(),
    correlationId: fluxNodeFieldSchemas.callerKey.optional(),
    idempotencyKey: fluxNodeFieldSchemas.callerKey.optional()
  })
  .strict()
  .superRefine((request, context) => {
    const issue = (path: string, code: string, message: string): void => {
      context.addIssue({ code: z.ZodIssueCode.custom, path: path === "" ? [] : [path], message, params: { code: `run_request.${code}` } });
    };
    const given = [request.spec, request.name, request.resumeHandle, request.pipeline].filter((part) => part !== undefined).length;
    if (given !== 1) issue("", "target", "Give exactly one of spec, name, resumeHandle and pipeline.");
    if (request.specHash !== undefined && request.name === undefined) issue("specHash", "spec_hash_without_name", "specHash picks a version of a registered name; give name with it.");
    if (request.resumeHandle !== undefined && request.inputs !== undefined) issue("inputs", "inputs_on_resume", "A resumed run keeps its inputs; leave inputs out.");
    if (request.spec !== undefined) {
      for (const problem of checkFluxNodeRunInputs(request.spec, request.inputs ?? {})) {
        const steps = problem.path.split("/").slice(1).map((step) => step.replaceAll("~1", "/").replaceAll("~0", "~"));
        context.addIssue({ code: z.ZodIssueCode.custom, path: steps, message: problem.message, params: { code: problem.code } });
      }
    }
  });

export type FluxNodeRunRequest = z.infer<typeof fluxNodeRunRequestSchema>;

/** What a caller writes, before the inline spec's defaults are filled. */
export type FluxNodeRunRequestInput = z.input<typeof fluxNodeRunRequestSchema>;

/** Parses an untrusted value into a run request, or every reason it is not one. */
export function parseFluxNodeRunRequest(value: unknown): FluxNodeParseResult<FluxNodeRunRequest> {
  return parseWithZod(fluxNodeRunRequestSchema, value);
}
