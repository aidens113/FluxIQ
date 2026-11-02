import type { JsonValue } from "../../../../core/index.ts";
export type AutomationStudioComparatorImplementation = (left: JsonValue, right: JsonValue) => {
  equal: boolean;
  score?: number;
};
