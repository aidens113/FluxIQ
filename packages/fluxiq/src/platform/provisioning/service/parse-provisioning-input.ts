import { PLATFORM_PROVISIONING_OPERATIONS } from "@fluxiq/contracts/platform";
import type { PlatformProvisioningError, PlatformProvisioningInput, PlatformProvisioningOperationName } from "@fluxiq/contracts/platform";
import { provisioningInputIssues, type SchemaIssue } from "./input-issues.ts";

/** A schema as parsing needs it (every zod schema of the operation table fits). */
type InputSchema = {
  safeParse(value: unknown): { success: true; data: unknown } | { success: false; error: { issues: SchemaIssue[] } };
};

/** A parsed input, or the error to answer with. */
export type ParsedProvisioningInput<TName extends PlatformProvisioningOperationName> =
  | { ok: true; input: PlatformProvisioningInput<TName> }
  | { ok: false; error: PlatformProvisioningError };

/**
 * Parses an operation's input with its transport's schema: `httpInput` over
 * HTTP (which refuses a password and unknown fields), `input` in-process.
 * An operation with no HTTP schema is `operation_unavailable` over HTTP. A
 * refusal is `invalid_input` with its issues by path, never echoing a value.
 */
export function parseProvisioningInput<TName extends PlatformProvisioningOperationName>(operation: TName, value: unknown, transport: "http" | "in-process"): ParsedProvisioningInput<TName> {
  const spec = PLATFORM_PROVISIONING_OPERATIONS[operation];
  const schema: InputSchema | null = transport === "http" ? spec.httpInput : spec.input;
  if (schema === null) return { ok: false, error: { code: "operation_unavailable", message: `${operation} is not available over HTTP.` } };
  const parsed = schema.safeParse(value);
  if (!parsed.success) return { ok: false, error: { code: "invalid_input", message: `The ${operation} input failed its schema.`, issues: provisioningInputIssues(parsed.error.issues) } };
  // The schema just checked is the one `PlatformProvisioningInput<TName>` is inferred from (the HTTP one is its password-free subset).
  return { ok: true, input: parsed.data as PlatformProvisioningInput<TName> };
}
