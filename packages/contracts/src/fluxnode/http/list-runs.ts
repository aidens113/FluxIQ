// GET runs: list runs, newest first, a page at a time.

import { z } from "zod";
import { fluxNodeFieldSchemas } from "../fields/index.ts";
import { fluxNodeNameSchema } from "../flow/index.ts";
import { FLUXNODE_RUN_PATH_KINDS, fluxNodeCostSchema } from "../run/index.ts";
import { FLUXNODE_RUN_STATES } from "./run-state.ts";

const cursorSchema = z.string().regex(/^[A-Za-z0-9._~-]{1,512}$/u, "An opaque cursor, as the last page gave it.");

/**
 * The query, read from the address's text: filter by `name`, `state` and
 * `correlationId`; `limit` 1 to 200, 50 by default; `cursor` from the last page.
 */
export const fluxNodeListRunsQuerySchema = z
  .object({
    name: fluxNodeNameSchema.optional(),
    state: z.enum(FLUXNODE_RUN_STATES).optional(),
    correlationId: fluxNodeFieldSchemas.callerKey.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: cursorSchema.optional()
  })
  .strict();

export type FluxNodeListRunsQuery = z.infer<typeof fluxNodeListRunsQuerySchema>;

/** One run in a list: enough to show it and to fetch the rest. `path` and `endedAt` once it has ended. */
export const fluxNodeRunSummarySchema = z
  .object({
    runId: fluxNodeFieldSchemas.id,
    name: fluxNodeNameSchema,
    specHash: fluxNodeFieldSchemas.sha256Hex.optional(),
    state: z.enum(FLUXNODE_RUN_STATES),
    startedAt: fluxNodeFieldSchemas.epochMs,
    endedAt: fluxNodeFieldSchemas.epochMs.optional(),
    path: z.enum(FLUXNODE_RUN_PATH_KINDS).optional(),
    cost: fluxNodeCostSchema,
    correlationId: fluxNodeFieldSchemas.callerKey.optional()
  })
  .strict();

export type FluxNodeRunSummary = z.infer<typeof fluxNodeRunSummarySchema>;

/** The response body: a page of runs, and the cursor for the next page when there is one. */
export const fluxNodeListRunsResponseSchema = z.object({ runs: z.array(fluxNodeRunSummarySchema).max(200), nextCursor: cursorSchema.optional() }).strict();

export type FluxNodeListRunsResponse = z.infer<typeof fluxNodeListRunsResponseSchema>;
