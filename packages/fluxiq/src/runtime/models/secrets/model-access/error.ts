// The error a chat's model call ends in when it cannot reach a model for an access reason (t924).

import type { ModelAccessState } from "@fluxiq/contracts/platform";

/** A model call that could not reach a model, carrying the person's model-access state. Not retried: the same call meets the same reason. */
export class AutomationStudioModelAccessError extends Error {
  readonly code = "llm.provider_secret_unavailable";
  readonly retryable: boolean;
  constructor(readonly access: ModelAccessState, options: { retryable?: boolean; cause?: unknown } = {}) {
    super(access.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AutomationStudioModelAccessError";
    this.retryable = options.retryable === true;
  }
}

/** The state carried by an error, when it is a model-access failure. */
export function automationStudioModelAccessOf(error: unknown): ModelAccessState | undefined {
  return error instanceof AutomationStudioModelAccessError ? error.access : undefined;
}
