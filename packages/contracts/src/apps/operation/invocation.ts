import { z } from "zod";
import { jsonValueSchema } from "../../fluxnode/json/index.ts";
import { appFields, parseAppContract } from "../validation/index.ts";

const schema = z.object({ schemaVersion: z.literal(1), installationId: appFields.id, operationId: appFields.operationId, inputs: jsonValueSchema, idempotencyKey: appFields.id }).strict();
export type AppInvocationV1 = z.infer<typeof schema>;

/** Inputs are business data, including any fields named role/workspace/payer; never caller authority. */
export function parseAppInvocation(value: unknown) {
  return parseAppContract(schema, value, "app.invalid_invocation", true);
}
