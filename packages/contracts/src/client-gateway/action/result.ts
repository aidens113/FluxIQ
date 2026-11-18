import type { JsonObject } from "../../core.js";
import type { AutomationStudioFailureRecord } from "../../failure/index.js";
import type { ClientGatewayActionResultStatus } from "./result-status.ts";

/**
 * An action result as Core hands it to the caller that dispatched the command.
 * A client's `interrupted` has already been read into `unknown` or `failed`
 * (see `ClientGatewayReportedActionResult`), so no caller meets it.
 */
export type ClientGatewayActionResult = {
  commandId: string;
  status: ClientGatewayActionResultStatus;
  startedAt?: number;
  completedAt?: number;
  message?: string;
  target?: JsonObject;
  payload?: JsonObject;
  error?: string;
  /** A target wait that cleared without a person, in whole milliseconds; independent of action status. */
  clearedWait?: { waitedMs: number };
  /** Structured failure the client reports; the runtime keeps it only when `parseAutomationStudioFailureRecord` accepts it. */
  failure?: AutomationStudioFailureRecord;
  metadata?: JsonObject;
};
