import path from "node:path";
// The web app reaches `@fluxiq/contracts` only through a `fluxiq` subpath: its production build cannot resolve it directly.
import type { ClientGatewayAuditEntry } from "fluxiq/client-gateway";
import { redactFields } from "../log";
import { appendAuditLine } from "./append-audit-line";

/** The part of the client gateway service this module listens to. */
export type SecurityEventSource = {
  onSecurityEvent(listener: (event: ClientGatewayAuditEntry) => void): () => void;
};

export type GatewayAuditPersistenceOptions = {
  /** The instance's `.fluxiq` directory; the file is `<fluxiqDir>/security/gateway-audit.jsonl`. */
  fluxiqDir: string;
  maxBytes?: number;
  /** Told once per failed write, with no detail beyond the error code. Defaults to nothing. */
  onWriteError?: (code: string) => void;
};

/**
 * Appends each gateway security event to a JSONL file that outlives the
 * in-memory audit ring. Entries pass through the log redaction. A write error
 * is reported through `onWriteError` and never reaches the gateway. Returns
 * the unsubscribe function.
 */
export function attachGatewayAuditPersistence(source: SecurityEventSource, options: GatewayAuditPersistenceOptions): () => void {
  const filePath = path.join(options.fluxiqDir, "security", "gateway-audit.jsonl");
  return source.onSecurityEvent((event) => {
    try {
      appendAuditLine(filePath, JSON.stringify(redactFields(event as unknown as Record<string, unknown>)), options.maxBytes);
    } catch (error) {
      try {
        options.onWriteError?.((error as NodeJS.ErrnoException).code ?? "unknown");
      } catch {
        /* best-effort: a failing error callback must not reach the gateway either */
      }
    }
  });
}
