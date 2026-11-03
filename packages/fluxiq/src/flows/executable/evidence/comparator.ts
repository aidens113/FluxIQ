import type { JsonObject } from "../../../core/index.ts";

export type EvidenceComparator =
  | { kind: "exists" }
  | { kind: "equals"; value: unknown }
  | { kind: "not_equals"; value: unknown }
  | { kind: "numeric"; operator: ">" | ">=" | "<" | "<=" | "==" | "!="; value: number }
  | { kind: "changed" }
  | { kind: "custom"; comparatorId: string; parameters?: JsonObject };
