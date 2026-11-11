import type { FluxNodeErrorCode, FluxNodeIssue } from "@fluxiq/contracts/fluxnode";

/** A refusal to write: the contracts' code and safe words, with the status when it differs from the code's own (404 for an unknown path, 405 for a wrong method). */
export type FluxNodeHttpRefusal = {
  code: FluxNodeErrorCode;
  message: string;
  issues?: FluxNodeIssue[];
  status?: number;
  headers?: Record<string, string>;
};
