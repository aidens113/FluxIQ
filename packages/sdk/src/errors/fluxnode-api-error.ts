// An error the engine answered with: the contracts' error body and the HTTP status.

import type { FluxNodeErrorCode, FluxNodeIssue } from "@fluxiq/contracts/fluxnode";
import { SdkError } from "./sdk-error.ts";

/** The engine refused a request. `apiCode` is the contracts' error code; `status` the HTTP status. */
export class FluxNodeApiError extends SdkError {
  readonly status: number;
  readonly apiCode: FluxNodeErrorCode | string;

  constructor(details: { status: number; apiCode: FluxNodeErrorCode | string; message: string; issues?: FluxNodeIssue[] }) {
    super("protocol", details.message, details.issues === undefined ? {} : { issues: details.issues });
    this.name = "FluxNodeApiError";
    this.status = details.status;
    this.apiCode = details.apiCode;
  }
}
