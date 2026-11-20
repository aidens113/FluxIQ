// Both judges send this same declared evidence shape. Screen values individually; never cut pages or records.
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { screenAutomationStudioLlmEvidence } from "../../llm/index.ts";
import type { AutomationStudioResultEvidenceBundle } from "./types.ts";

export function automationStudioResultEvidenceScreen(bundle: AutomationStudioResultEvidenceBundle, deniedKeys: readonly string[]): { value: JsonObject; withheld: boolean } {
  let withheld = false;
  const visit = (raw: unknown): JsonValue => {
    if (Array.isArray(raw)) return raw.map(visit);
    if (raw !== null && typeof raw === "object") return Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined).map(([key, value]) => {
      // Check the key independently so an unsafe cell never removes its safe siblings or page provenance.
      const named = screenAutomationStudioLlmEvidence({ [key]: null }, deniedKeys);
      if (named.deniedKey || named.secretShaped) {
        withheld = true;
        return ["withheld", "(withheld)"];
      }
      return [key, visit(value)];
    }));
    const screened = screenAutomationStudioLlmEvidence(raw, deniedKeys);
    if (screened.deniedKey || screened.secretShaped || (typeof raw === "number" && !Number.isFinite(raw))) {
      withheld = true;
      return "(withheld)";
    }
    return raw as JsonValue;
  };
  return { value: visit(bundle) as JsonObject, withheld };
}
