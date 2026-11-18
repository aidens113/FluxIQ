import { parseAppContract } from "../validation/index.ts";
import { appGrantSchema } from "./schema.ts";

export function parseAppGrant(value: unknown) {
  return parseAppContract(appGrantSchema, value, "app.invalid_operation");
}
