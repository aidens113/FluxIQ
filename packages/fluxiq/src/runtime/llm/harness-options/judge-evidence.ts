import type { JsonValue } from "../../../core/index.ts";

/** A pure host projection of supplied evidence; Core passes a deeply frozen copy, never its private original. */
export type AutomationStudioJudgeEvidenceProjector = (input: Readonly<{
  source: "call" | "flow-attempt" | "build-observation" | "state" | "legacy";
  evidence: JsonValue;
  definitionId?: string | undefined;
  asked?: JsonValue | undefined;
  on?: string | undefined;
  phase?: "before" | "after" | undefined;
}>) => {
  role: "data" | "action" | "observation";
  evidence?: JsonValue | undefined;
  missing?: readonly string[] | undefined;
};
