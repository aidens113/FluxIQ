// A run as the API reports it: running, or ended with its result. GET run answers
// this; POST runs and POST stop answer it too.

import { z } from "zod";
import { fluxNodeFieldSchemas } from "../fields/index.ts";
import { fluxNodeNameSchema } from "../flow/index.ts";
import { FLUXNODE_RUN_STATUSES, fluxNodeCostSchema, fluxNodeRunResultSchema } from "../run/index.ts";

/** `running`, or one of the four endings (`FLUXNODE_RUN_STATUSES`). */
export const FLUXNODE_RUN_STATES = Object.freeze(["running", ...FLUXNODE_RUN_STATUSES] as const);

export type FluxNodeRunState = (typeof FLUXNODE_RUN_STATES)[number];

/**
 * - `state`: `running` until the run ends, then its ending, the same as `result.status`;
 * - `eventsPath`: where its events stream from;
 * - `cost`: spent so far;
 * - `waitingEventIds`: events that wait for the program's answer;
 * - `result`: present exactly when the run has ended.
 */
export const fluxNodeRunStateSchema = z
  .object({
    runId: fluxNodeFieldSchemas.id,
    name: fluxNodeNameSchema,
    specHash: fluxNodeFieldSchemas.sha256Hex.optional(),
    state: z.enum(FLUXNODE_RUN_STATES),
    startedAt: fluxNodeFieldSchemas.epochMs,
    eventsPath: z.string().startsWith("/").max(512),
    cost: fluxNodeCostSchema,
    waitingEventIds: z.array(fluxNodeFieldSchemas.id).max(64).optional(),
    correlationId: fluxNodeFieldSchemas.callerKey.optional(),
    result: fluxNodeRunResultSchema.optional()
  })
  .strict()
  .superRefine((run, context) => {
    if ((run.state === "running") !== (run.result === undefined)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["result"], message: "A run has a result exactly when it has ended.", params: { code: "run_state.result" } });
    }
    if (run.result !== undefined && run.result.status !== run.state) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["state"], message: "An ended run's state is its result's status.", params: { code: "run_state.status_mismatch" } });
    }
  });

export type FluxNodeRunStateBody = z.infer<typeof fluxNodeRunStateSchema>;
