/** What one request's log line holds: nothing from its headers or body, and the operation only when it is a known one. */
export type ProvisioningRequestLogEntry = {
  operation: string | null;
  status: number;
  code: string | null;
  durationMs: number;
};

/** `[FluxIQ] provisioning createAccount 200 - 12ms`; `-` stands for no operation or no error code. */
export function formatRequestLogLine(entry: ProvisioningRequestLogEntry): string {
  return `[FluxIQ] provisioning ${entry.operation ?? "-"} ${entry.status} ${entry.code ?? "-"} ${Math.round(entry.durationMs)}ms`;
}
