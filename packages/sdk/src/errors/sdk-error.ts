// The SDK's own error: a refusal that happened in the program's process, before or
// instead of a call to the engine. Refusals the engine sent are `FluxNodeApiError`.

import type { FluxNodeIssue } from "@fluxiq/contracts/fluxnode";

/**
 * - `invalid_definition`, `invalid_schema`: `defineFluxNode` or `pipeline` was given something the contracts refuse;
 * - `invalid_inputs`, `invalid_outputs`: a value does not fit its declared type;
 * - `key_unreadable`, `key_insecure`, `key_missing`: a key that was named could not be used;
 * - `connection`, `protocol`: the engine could not be reached, or answered something the contracts do not describe;
 * - `stream_lost`: the event stream ended before the run did and could not be resumed;
 * - `aborted`: the program's `AbortSignal` was already aborted;
 * - `run_request.options_on_resume`, `run_request.overrides_on_resume`: a resume was given options or overrides, which it keeps from its first run (the contracts' own refusal codes);
 * - `cli`: a command line the CLI could not follow.
 */
export type SdkErrorCode =
  | "invalid_definition"
  | "invalid_schema"
  | "invalid_inputs"
  | "invalid_outputs"
  | "key_unreadable"
  | "key_insecure"
  | "key_missing"
  | "connection"
  | "protocol"
  | "stream_lost"
  | "aborted"
  | "run_request.options_on_resume"
  | "run_request.overrides_on_resume"
  | "cli";

/** An error with a stable `code`, the `issues` behind it when there are some, and a `hint` saying what to do. */
export class SdkError extends Error {
  readonly code: SdkErrorCode;
  readonly issues: FluxNodeIssue[];
  readonly hint: string | undefined;

  constructor(code: SdkErrorCode, message: string, details: { issues?: FluxNodeIssue[]; hint?: string; cause?: unknown } = {}) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = "SdkError";
    this.code = code;
    this.issues = details.issues ?? [];
    this.hint = details.hint;
  }
}
