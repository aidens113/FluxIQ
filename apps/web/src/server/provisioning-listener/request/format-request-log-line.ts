/** What one request's log line holds: nothing from its headers or body, and the operation only when it is a known one. */
export type ProvisioningRequestLogEntry = {
  operation: string | null;
  status: number;
  code: string | null;
  durationMs: number;
  /** For an unexpected failure only: what kind it was (`failureKind`), never its message. */
  failure?: string;
};

/**
 * `[FluxIQ] provisioning createAccount 200 - 12ms`; `-` stands for no operation or no error code.
 * An unexpected failure adds its kind: `... 500 internal_error 697ms failure=Error:workspaces.close_failed`.
 */
export function formatRequestLogLine(entry: ProvisioningRequestLogEntry): string {
  const failure = entry.failure === undefined ? "" : ` failure=${entry.failure}`;
  return `[FluxIQ] provisioning ${entry.operation ?? "-"} ${entry.status} ${entry.code ?? "-"} ${Math.round(entry.durationMs)}ms${failure}`;
}
