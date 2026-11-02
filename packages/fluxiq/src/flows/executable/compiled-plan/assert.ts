import type { AutomationStudioCompiledPlan } from "./plan.ts";
import { AUTOMATION_STUDIO_COMPILED_PLAN_SCHEMA_VERSION } from "./schema-version.ts";
import { digestAutomationStudioCompiledPlanValue as sha256 } from "./digest.ts";
import { serializeAutomationStudioCompiledPlanValue as stableStringify } from "./serialization.ts";

export function assertAutomationStudioCompiledPlan(value: unknown): asserts value is AutomationStudioCompiledPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Compiled Automation Studio plan must be an object.");
  const plan = value as Partial<AutomationStudioCompiledPlan>;
  if (plan.schemaVersion !== AUTOMATION_STUDIO_COMPILED_PLAN_SCHEMA_VERSION) throw new Error("Compiled Automation Studio plan schema version is unsupported.");
  if (!plan.flowId || !plan.projectId || !plan.compilerVersion || !plan.planDigest) throw new Error("Compiled Automation Studio plan identity is incomplete.");
  if (!Array.isArray(plan.nodes) || !Array.isArray(plan.edges) || !plan.edgesBySource) throw new Error("Compiled Automation Studio plan graph is incomplete.");
  const expected = sha256(stableStringify({ ...plan, planDigest: undefined }));
  const legacyExpected = sha256(stableStringify(withoutPlanDigest(plan)));
  if (plan.planDigest !== expected && plan.planDigest !== legacyExpected) throw new Error("Compiled Automation Studio plan digest mismatch.");
}

function withoutPlanDigest(plan: Partial<AutomationStudioCompiledPlan>): Record<string, unknown> {
  const copy = { ...plan } as Record<string, unknown>;
  delete copy.planDigest;
  return copy;
}
