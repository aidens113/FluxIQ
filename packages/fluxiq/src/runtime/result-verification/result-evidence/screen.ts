// Both judges send this same declared evidence shape. Screen values individually; never cut pages or records.
//
// **What comes out is JSON (t974, F22).** The bundle is held in memory, where a read's `leftOut.found` keeps `undefined`
// for each condition the read said nothing of, aligned with `where` (`../flow-less/read-left-out.ts`). An object member
// that is `undefined` was always left out, but an array item was kept, and the provider's pre-send check refuses any
// request whose context is not JSON (`llm.provider_request_context_unbounded`, `../../llm/provider-task/preflight.ts`)
// before anything is sent. Live runs run-mwouzg29-ebb0f27d, run-mwov5v61-01468cd3 and run-mwow1z18-81707c66 had every
// completion refused "not judged" that way, with no judge call: the store wrote the same items as `null`, so no record
// showed them. So an `undefined` item is `null`, as JSON says it and the store keeps it, which leaves `found` aligned with
// `where`; a value JSON has no form for (a function, a symbol, a bigint) is withheld.
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { screenAutomationStudioLlmEvidence } from "../../llm/index.ts";
import type { AutomationStudioResultEvidenceBundle } from "./types.ts";

export function automationStudioResultEvidenceScreen(bundle: AutomationStudioResultEvidenceBundle, deniedKeys: readonly string[]): { value: JsonObject; withheld: boolean } {
  let withheld = false;
  const visit = (raw: unknown): JsonValue => {
    if (raw === undefined) return null;
    if (typeof raw === "function" || typeof raw === "symbol" || typeof raw === "bigint") {
      withheld = true;
      return "(withheld)";
    }
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
