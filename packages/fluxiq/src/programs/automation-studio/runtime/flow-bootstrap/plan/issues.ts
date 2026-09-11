// Issue construction and the field-level checks that emit them. Every
// Bootstrap parse and validation failure is reported through this module, so
// codes, messages, and paths stay uniform.
import type { AutomationStudioFlowBootstrapIssue } from "./contracts.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS } from "./limits.ts";

export function error(code: string, message: string, path?: string): AutomationStudioFlowBootstrapIssue {
  return { severity: "error", code, message, ...(path ? { path } : {}) };
}

export function rejectFields(value: Record<string, unknown>, allowed: string[], path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  const fields = new Set(allowed);
  for (const key of Object.keys(value)) if (!fields.has(key)) issues.push(error("bootstrap.unexpected_field", "Bootstrap output contains an unexpected field.", `${path}.${key}`));
}

export function symbolic(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(value)) issues.push(error("bootstrap.invalid_symbol", "Symbolic keys must be lower-case identifiers and are not durable IDs.", path));
}

export function identifier(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (typeof value !== "string" || value.length === 0 || value.length > 200 || !/^[a-z0-9_.:-]+$/i.test(value)) issues.push(error("bootstrap.invalid_identifier", "Identifier is invalid.", path));
}

export function boundedText(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxStringLength) issues.push(error("bootstrap.invalid_text", "Text must be nonempty and bounded.", path));
}
