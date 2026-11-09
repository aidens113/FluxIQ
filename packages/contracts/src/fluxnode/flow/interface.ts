// A Flow's interface: the inputs it takes and the outputs it gives, each optional and
// each with an exact type when the developer wants one (plan, N3). A FluxNode's
// declaration and a pipeline's both carry one.

import { z } from "zod";
import { zodFromParser, type FluxNodeRawIssue } from "../issue/index.ts";
import { jsonTypeSchemaSchema, readJsonTypeSchema, type JsonTypeSchema } from "../type-schema/index.ts";

/**
 * Reads a Flow's input type: a schema in the subset whose `type` is exactly
 * `"object"`, because inputs are named, and a goal's `{placeholders}` name them. A
 * property declared as `{}` is an input with a name and no type.
 */
export function readFlowInputs(value: unknown, issues: FluxNodeRawIssue[]): JsonTypeSchema | null {
  const schema = readJsonTypeSchema(value, issues);
  if (schema === null) return null;
  if (schema.type !== "object") {
    issues.push({ path: ["type"], code: "flow_interface.inputs_not_object", message: 'Inputs are named, so their type is "type": "object" with each input under properties.' });
    return null;
  }
  return schema;
}

/** The input type as a zod schema. */
export const flowInputsSchema = zodFromParser(readFlowInputs);

/** A Flow's interface. Both parts are optional: a Flow may take nothing and say what it produced only when it ends. */
export const flowInterfaceSchema = z
  .object({
    inputs: flowInputsSchema.optional(),
    outputs: jsonTypeSchemaSchema.optional()
  })
  .strict();

export type FlowInterface = z.infer<typeof flowInterfaceSchema>;

/** The names of the declared inputs, in declaration order; none when inputs are not declared. */
export function flowInputNames(inputs: JsonTypeSchema | undefined): string[] {
  return inputs?.properties === undefined ? [] : Object.keys(inputs.properties);
}
