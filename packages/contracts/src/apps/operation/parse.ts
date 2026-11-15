import { parseAppContract } from "../validation/index.ts";
import { appOperationSchema } from "./schema.ts";

export function parseAppOperation(value: unknown) {
  return parseAppContract(appOperationSchema, value, "app.invalid_operation");
}
