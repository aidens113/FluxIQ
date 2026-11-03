import type { JsonObject } from "../../core/index.ts";

/** An executable action addresses an already registered domain output. */
export type RegisteredOutputAction = {
  outputId?: string;
  actionType: string;
  parameters: Record<string, unknown>;
  confirmationInputId?: string;
  confirmationTimeoutMs?: number;
  metadata?: JsonObject;
};
