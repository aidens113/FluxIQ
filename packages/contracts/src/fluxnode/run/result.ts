// What a FluxNode run returns (plan, N3-N7). A run ends one of four ways and none of
// them is "failed": its outputs pass, its budget is gone, the program stopped it, or a
// person must act and the run is waiting with a resume handle (plan, N5-N6).

import { z } from "zod";
import { datasetRefSchema, dataLineageSchema } from "../data/index.ts";
import { fluxNodeFieldSchemas } from "../fields/index.ts";
import { flowPathSchema, fluxNodeNameSchema } from "../flow/index.ts";
import { parseWithZod, type FluxNodeParseResult } from "../issue/index.ts";
import { jsonValueSchema } from "../json/index.ts";
import { jsonTypeSchemaSchema } from "../type-schema/index.ts";
import { fluxNodeCostSchema } from "./cost.ts";
import { fluxNodeVerdictSchema } from "./verdict.ts";

/**
 * - `achieved`: the outputs passed (the type, then the check, then the judge as configured);
 * - `budget_out`: the budget is gone; the best partial result and a resume handle come back;
 * - `stopped`: the program stopped it (an `AbortSignal`) or a person pressed Stop;
 * - `waiting_for_person`: only a person can go on; `waitingFor` says why and the
 *   resume handle continues it.
 */
export const FLUXNODE_RUN_STATUSES = Object.freeze(["achieved", "budget_out", "stopped", "waiting_for_person"] as const);

export type FluxNodeRunStatus = (typeof FLUXNODE_RUN_STATUSES)[number];

/** How the run got its result: replayed the learned Flow, repaired it, or explored. */
export const FLUXNODE_RUN_PATH_KINDS = Object.freeze(["replayed", "repaired", "explored"] as const);

export type FluxNodeRunPathKind = (typeof FLUXNODE_RUN_PATH_KINDS)[number];

/** An opaque handle that continues a waiting or budget-out run: 16 to 512 of `A-Z a-z 0-9 . _ ~ -`. */
export const fluxNodeResumeHandleSchema = z.string().regex(/^[A-Za-z0-9._~-]{16,512}$/u, "An opaque resume handle, as Core gave it.");

/** When the run started and ended, in epoch milliseconds, and how long it ran. */
export const fluxNodeRunTimingsSchema = z
  .object({ startedAt: fluxNodeFieldSchemas.epochMs, endedAt: fluxNodeFieldSchemas.epochMs, durationMs: fluxNodeFieldSchemas.count })
  .strict()
  .refine((timings) => timings.endedAt >= timings.startedAt, { message: "endedAt is not before startedAt.", path: ["endedAt"], params: { code: "run_result.time_order" } });

/**
 * - `runId`, `name`, `specHash`: the run and the FluxNode it ran (a pipeline has no spec hash);
 * - `flowId`, `flowPath`: the Flow it used or began; a first exploration creates its draft at the start;
 * - `outputs`: what it produced, typed by the spec's `outputs` when declared, and
 *   otherwise described by `outputsType`, the type Core inferred;
 * - `verdict`, `path`, `cost`, `timings`: see their schemas;
 * - `resumeHandle`: present for `budget_out` and `waiting_for_person`, and only then;
 * - `waitingFor`: what a person must do, only for `waiting_for_person`;
 * - `lineage`: where output values came from, at most 1000 entries; `datasets`: the
 *   datasets the run stored;
 * - `correlationId`: the caller's, echoed;
 * - `overridesDigest`: the digest of the run's resolved overrides, present only when it had any.
 *
 * An `achieved` run's verdict is never `refuted`.
 */
export const fluxNodeRunResultSchema = z
  .object({
    runId: fluxNodeFieldSchemas.id,
    name: fluxNodeNameSchema,
    specHash: fluxNodeFieldSchemas.sha256Hex.optional(),
    flowId: fluxNodeFieldSchemas.id,
    flowPath: flowPathSchema,
    status: z.enum(FLUXNODE_RUN_STATUSES),
    outputs: jsonValueSchema.optional(),
    outputsType: jsonTypeSchemaSchema.optional(),
    verdict: fluxNodeVerdictSchema,
    path: z.enum(FLUXNODE_RUN_PATH_KINDS),
    cost: fluxNodeCostSchema,
    timings: fluxNodeRunTimingsSchema,
    resumeHandle: fluxNodeResumeHandleSchema.optional(),
    waitingFor: fluxNodeFieldSchemas.personText.optional(),
    lineage: z.array(dataLineageSchema).max(1000).optional(),
    datasets: z.array(datasetRefSchema).max(64).optional(),
    correlationId: fluxNodeFieldSchemas.callerKey.optional(),
    overridesDigest: fluxNodeFieldSchemas.sha256Hex.optional()
  })
  .strict()
  .superRefine((result, context) => {
    const issue = (path: string, code: string, message: string): void => {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message, params: { code: `run_result.${code}` } });
    };
    if (result.status === "achieved" && result.verdict.label === "refuted") issue("verdict", "achieved_refuted", "An achieved run's outputs passed, so its verdict is not refuted.");
    const resumable = result.status === "budget_out" || result.status === "waiting_for_person";
    if (resumable && result.resumeHandle === undefined) issue("resumeHandle", "resume_missing", `A ${result.status} run returns a resume handle.`);
    if (!resumable && result.resumeHandle !== undefined) issue("resumeHandle", "resume_unexpected", `A ${result.status} run has nothing to resume.`);
    if ((result.status === "waiting_for_person") !== (result.waitingFor !== undefined)) issue("waitingFor", "waiting_for", "waitingFor is present exactly when the run waits for a person.");
  });

export type FluxNodeRunResult = z.infer<typeof fluxNodeRunResultSchema>;

/** Parses an untrusted value into a run result, or every reason it is not one. */
export function parseFluxNodeRunResult(value: unknown): FluxNodeParseResult<FluxNodeRunResult> {
  return parseWithZod(fluxNodeRunResultSchema, value);
}
