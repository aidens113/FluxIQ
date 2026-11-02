import type { JsonObject } from "../../../../core/index.ts";
import type { ElementMatcher } from "../../../../runtime/target-matching/index.ts";
export type AutomationStudioTargetResolverImplementation = (target: JsonObject, context: {
  signal: AbortSignal;
  elementMatcher: ElementMatcher;
}) => JsonObject | null | Promise<JsonObject | null>;
