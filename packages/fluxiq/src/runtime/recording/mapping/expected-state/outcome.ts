import type { JsonObject } from "../../../../core/index.ts";

export type RecordingExpectedStateOutcome =
  | { kind: "absent" | "not_plain" | "uncloneable" | "empty" }
  | { kind: "state"; state: JsonObject };
