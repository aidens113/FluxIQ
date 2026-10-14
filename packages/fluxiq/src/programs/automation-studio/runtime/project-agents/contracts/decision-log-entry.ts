import { automationStudioProjectJsonShape as shape, type AutomationStudioProjectParse } from "./json-shape.ts";

// One supervisor decision, with its reason: dispatching briefs, triaging a
// return, re-planning, or ending the build. The log is what a later supervisor
// invocation reads to learn why the Flow is the way it is.

export const AUTOMATION_STUDIO_PROJECT_DECISION_KINDS = Object.freeze(["dispatch", "triage", "re_plan", "ending"] as const);

export type AutomationStudioProjectDecisionLogEntry = {
  kind: (typeof AUTOMATION_STUDIO_PROJECT_DECISION_KINDS)[number];
  reason: string;
  /** The briefs the decision is about; empty for a decision about none. */
  briefIds: string[];
  /** The structure plan in force when the decision was made, once there is one. */
  planDigest?: string;
};

export const automationStudioProjectDecisionLogEntry = Object.freeze({
  parse(value: unknown): AutomationStudioProjectParse<AutomationStudioProjectDecisionLogEntry> {
    return shape.parse(() => {
      const fields = shape.object(value, "decision", ["kind", "reason", "briefIds"], ["planDigest"]);
      const entry: AutomationStudioProjectDecisionLogEntry = {
        kind: shape.oneOf(fields.kind, "decision.kind", AUTOMATION_STUDIO_PROJECT_DECISION_KINDS),
        reason: shape.text(fields.reason, "decision.reason", 2000),
        briefIds: shape.array(fields.briefIds, "decision.briefIds", 100).map((id, index) => shape.storageId(id, `decision.briefIds.${index}`))
      };
      if (new Set(entry.briefIds).size !== entry.briefIds.length) return shape.refuse("project.duplicate", "decision.briefIds");
      if (fields.planDigest !== undefined) entry.planDigest = shape.digest(fields.planDigest, "decision.planDigest");
      return entry;
    });
  }
});
