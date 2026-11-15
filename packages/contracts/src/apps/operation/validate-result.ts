import { jsonValueSchema } from "../../fluxnode/json/index.ts";
import { validateJsonValue } from "../../fluxnode/type-schema/index.ts";
import type { JsonValue } from "../../core.ts";
import { appContractError, type AppParseResult } from "../error/index.ts";
import type { AppOperation } from "./schema.ts";
import { parseAppOperation } from "./parse.ts";

export function validateAppOperationResult(operation: AppOperation, value: unknown): AppParseResult<JsonValue> {
  try {
    const checked = parseAppOperation(operation);
    const data = jsonValueSchema.safeParse(value);
    if (checked.ok && data.success && validateJsonValue(checked.value.result, data.data).length === 0) return { ok: true, value: data.data };
  } catch {
    return { ok: false, error: appContractError("app.invalid_result") };
  }
  return { ok: false, error: appContractError("app.invalid_result") };
}
