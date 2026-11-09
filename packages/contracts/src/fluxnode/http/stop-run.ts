// POST runs/{runId}/stop: the program stops a run, as its `AbortSignal` does
// (plan, N5). The run ends `stopped` with what it has, and its state comes back.

import { z } from "zod";
import { fluxNodeFieldSchemas } from "../fields/index.ts";
import { fluxNodeRunStateSchema } from "./run-state.ts";

/** The request body: an optional reason, kept with the run. */
export const fluxNodeStopRunRequestSchema = z.object({ reason: fluxNodeFieldSchemas.personText.optional() }).strict();

export type FluxNodeStopRunRequest = z.infer<typeof fluxNodeStopRunRequestSchema>;

/** The response body: the run's state once stopping has been recorded. */
export const fluxNodeStopRunResponseSchema = fluxNodeRunStateSchema;
