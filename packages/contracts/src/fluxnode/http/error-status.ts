// The HTTP status each API error code answers with.

import type { FluxNodeErrorCode } from "../run/index.ts";

/** One status per code; the body is always `fluxNodeErrorBodySchema`. */
export const FLUXNODE_ERROR_HTTP_STATUS: Readonly<Record<FluxNodeErrorCode, number>> = Object.freeze({
  invalid_request: 400,
  invalid_spec: 400,
  invalid_inputs: 400,
  unknown_fluxnode: 404,
  unknown_spec_hash: 404,
  unknown_run: 404,
  unknown_event: 404,
  event_already_answered: 409,
  answer_mismatch: 409,
  run_ended: 409,
  idempotency_conflict: 409,
  unauthenticated: 401,
  forbidden: 403,
  internal: 500
});
