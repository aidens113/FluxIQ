// The errors the FluxNode API refuses a request with. A refused request is not a run
// ending: a run, once started, ends only as `FLUXNODE_RUN_STATUSES` says.

import { z } from "zod";
import { fluxNodeFieldSchemas } from "../fields/index.ts";

/**
 * - `invalid_request`, `invalid_spec`, `invalid_inputs`: the body or query was refused; `issues` says where;
 * - `unknown_fluxnode`, `unknown_spec_hash`, `unknown_run`, `unknown_event`: nothing by that name or id;
 * - `event_already_answered`, `answer_mismatch`: the event was answered, or this answer is for another kind of event;
 * - `run_ended`: the run has ended, so it cannot be answered or stopped;
 * - `idempotency_conflict`: the key was used with a different request;
 * - `no_host`: no connected host provides the runtime;
 * - `unauthenticated`, `forbidden`: no valid key, or a key without the grant;
 * - `rate_limited`, `unavailable`: try again after `retryAfterMs`;
 * - `internal`: Core failed; the message says no more than is safe.
 */
export const FLUXNODE_ERROR_CODES = Object.freeze([
  "invalid_request",
  "invalid_spec",
  "invalid_inputs",
  "unknown_fluxnode",
  "unknown_spec_hash",
  "unknown_run",
  "unknown_event",
  "event_already_answered",
  "answer_mismatch",
  "run_ended",
  "idempotency_conflict",
  "no_host",
  "unauthenticated",
  "forbidden",
  "rate_limited",
  "unavailable",
  "internal"
] as const);

export type FluxNodeErrorCode = (typeof FLUXNODE_ERROR_CODES)[number];

const issueSchema = z.object({ path: z.string().max(1024), code: z.string().min(1).max(128), message: z.string().min(1).max(2000) }).strict();

/** The body of every refused request. */
export const fluxNodeErrorBodySchema = z
  .object({
    error: z
      .object({
        code: z.enum(FLUXNODE_ERROR_CODES),
        message: fluxNodeFieldSchemas.personText,
        issues: z.array(issueSchema).max(200).optional(),
        retryAfterMs: fluxNodeFieldSchemas.count.optional()
      })
      .strict()
  })
  .strict();

export type FluxNodeErrorBody = z.infer<typeof fluxNodeErrorBodySchema>;
