// POST runs: start a run. The body is a run request (`fluxNodeRunRequestSchema`); the
// answer is the run's state, usually `running`. A repeated idempotency key answers
// the run it started, which may have ended. Errors answer with `fluxNodeErrorBodySchema`.

import { fluxNodeRunRequestSchema } from "../run/index.ts";
import { fluxNodeRunStateSchema } from "./run-state.ts";

/** The request body: a run request. */
export const fluxNodeStartRunRequestSchema = fluxNodeRunRequestSchema;

/** The response body: the started run's state. */
export const fluxNodeStartRunResponseSchema = fluxNodeRunStateSchema;
