import type { FluxNodeErrorCode, FluxNodeIssue } from "@fluxiq/contracts/fluxnode";

/**
 * The code a refused body answers with: `invalid_spec` when every issue is inside the
 * spec (`/spec` or below: a registered or inline FluxNode spec), `invalid_request` for
 * anything else, including a body whose issues are partly outside the spec.
 */
export function bodyRefusalCode(issues: readonly FluxNodeIssue[]): Extract<FluxNodeErrorCode, "invalid_request" | "invalid_spec"> {
  const inSpec = issues.length > 0 && issues.every((issue) => issue.path === "/spec" || issue.path.startsWith("/spec/"));
  return inSpec ? "invalid_spec" : "invalid_request";
}
