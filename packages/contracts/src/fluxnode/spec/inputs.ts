// A FluxNode's input type: a Flow's (`readFlowInputs`), where an input declared directly under
// `properties` may also be a secret (`format: "secret"`, `JSON_TYPE_SECRET_FORMAT`).

import { readFlowInputs } from "../flow/index.ts";
import { finishRawParse, zodFromParser, type FluxNodeParseResult, type FluxNodeRawIssue } from "../issue/index.ts";
import type { JsonTypeSchema } from "../type-schema/index.ts";

function readFluxNodeInputs(value: unknown, issues: FluxNodeRawIssue[]): JsonTypeSchema | null {
  return readFlowInputs(value, issues, { secretInputs: true });
}

/** Parses an untrusted value into a FluxNode's input type, or every reason it is not one. */
export function parseFluxNodeInputs(value: unknown): FluxNodeParseResult<JsonTypeSchema> {
  const issues: FluxNodeRawIssue[] = [];
  return finishRawParse(readFluxNodeInputs(value, issues), issues);
}

/** The same parser as a zod schema, for the spec's `inputs`. */
export const fluxNodeInputsSchema = zodFromParser(readFluxNodeInputs);
