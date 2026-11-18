import type { ZodType, ZodTypeDef } from "zod";
import { appContractError, type AppContractErrorCode, type AppParseResult } from "../error/index.ts";

/** Reject raw schema diagnostics: messages and property paths may contain supplied secrets. */
export function parseAppContract<T>(schema: ZodType<T, ZodTypeDef, unknown>, value: unknown, code: AppContractErrorCode, versioned = false): AppParseResult<T> {
  try {
    if (versioned && typeof value === "object" && value !== null && "schemaVersion" in value && typeof value.schemaVersion === "number" && value.schemaVersion !== 1) return { ok: false, error: appContractError("app.unsupported_version") };
    const parsed = schema.safeParse(value);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: appContractError(code) };
  } catch {
    return { ok: false, error: appContractError(code) };
  }
}
