import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioJudgeEvidenceProjector } from "../../llm/harness-options/index.ts";
import { automationStudioResultEvidenceScreen } from "../result-evidence/index.ts";
import type { AutomationStudioJudgeEvidenceProjection } from "./project.ts";

type Role = ReturnType<AutomationStudioJudgeEvidenceProjector>["role"];
const KEYS = new Set(["role", "evidence", "missing"]);
const ROLES = new Set<Role>(["data", "action", "observation"]);
const CODE = /^[a-z][a-z0-9_.:-]*$/u;

/** Validate and privacy-screen semantic output; also used when a durable finding is reopened. */
export function automationStudioJudgeEvidenceResponse(response: unknown, deniedKeys: readonly string[]): AutomationStudioJudgeEvidenceProjection {
  const invalid = (): AutomationStudioJudgeEvidenceProjection => ({ missing: ["judge_evidence.projection_invalid"], withheld: true });
  if (!isObject(response) || Object.keys(response).some((key) => !KEYS.has(key)) || !ROLES.has(response.role as Role)) return invalid();
  const gaps = response.missing;
  if (gaps !== undefined && (!Array.isArray(gaps) || gaps.some((code) => typeof code !== "string" || !CODE.test(code)))) return invalid();
  const codes = [...new Set(gaps as string[] | undefined)];
  if (automationStudioResultEvidenceScreen({ missing: codes }, []).withheld) return invalid();
  if (response.evidence === undefined) {
    if (codes.length === 0) codes.push("judge_evidence.finding_missing");
    return { role: response.role as Role, missing: codes, withheld: true };
  }
  if (!jsonValue(response.evidence)) return invalid();
  // This screen preserves real UUID/date/number/array cells. Trail screening
  // would mistake some of them for bookkeeping and remove them.
  const screened = automationStudioResultEvidenceScreen({ evidence: response.evidence }, deniedKeys);
  return { role: response.role as Role, ...(screened.value.evidence === undefined ? {} : { evidence: screened.value.evidence }), missing: codes, withheld: screened.withheld || codes.length > 0 };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate every member, with no depth or item cap; cycles and non-JSON values are invalid. */
function jsonValue(value: unknown): value is JsonValue {
  const active = new Set<object>();
  const pending: Array<{ value: unknown; leaving?: boolean }> = [{ value }];
  while (pending.length > 0) {
    const next = pending.pop()!;
    const item = next.value;
    if (item === null || typeof item === "string" || typeof item === "boolean") continue;
    if (typeof item === "number") {
      if (!Number.isFinite(item)) return false;
      continue;
    }
    if (typeof item !== "object") return false;
    if (next.leaving) {
      active.delete(item);
      continue;
    }
    if (active.has(item) || (!Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item)))) return false;
    active.add(item);
    pending.push({ value: item, leaving: true });
    for (const child of Array.isArray(item) ? Array.from(item) : Object.values(item)) pending.push({ value: child });
  }
  return true;
}
