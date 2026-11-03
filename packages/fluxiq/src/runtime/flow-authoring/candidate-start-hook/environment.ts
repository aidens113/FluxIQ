// The two variables a deployment sets to give candidate trials a start hook
// (decision D1, 2026-10-07). Both unset is the product's configuration: no
// hook, and each trial records `not_reset`. A test facility that owns the
// target sets them to its own reset of that target.
//
// - `endpoint`: an http(s) address the deployment trusts. Each trial POSTs an
//   empty JSON object to it before running, and records what it answered.
// - `token`: optional; sent as `Authorization: Bearer <token>` when set. It is
//   never echoed in an error, a readiness record or a trial record.

/** The variables the Core process reads for the candidate start hook. */
export const AUTOMATION_STUDIO_CANDIDATE_START_HOOK_ENV = Object.freeze({
  endpoint: "FLUXIQ_CANDIDATE_START_URL",
  token: "FLUXIQ_CANDIDATE_START_TOKEN"
} as const);
