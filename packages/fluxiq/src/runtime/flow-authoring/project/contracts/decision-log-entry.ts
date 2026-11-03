import type { AutomationStudioProjectDecisionLogEntry, AutomationStudioProjectParse } from "../../../../flows/authoring/project/index.ts";
import { automationStudioProjectJsonShape as shape } from "./json-shape.ts";
import { AUTOMATION_STUDIO_PROJECT_DECISION_KINDS } from "../../../../flows/authoring/project/index.ts";

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
