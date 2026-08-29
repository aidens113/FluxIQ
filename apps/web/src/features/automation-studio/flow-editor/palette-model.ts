import type { AutomationEditorNodeSpec } from "./node-types";
export function automationNodeCompatibilityHint(item: AutomationEditorNodeSpec): string {
  if (item.availability?.kind === "domain") return "Domain: " + String(item.availability.domainId ?? "current");
  if (item.source?.kind === "composite") return "Published Flow";
  if (item.source?.kind === "recording") return "Project node";
  if (item.source?.kind === "code") return "Code node";
  if (item.privileged) return "Privileged action";
  if (item.scope === "both") return "Flow and routine";
  return item.scope === "policy" ? "Flow only" : "Routine only";
}
