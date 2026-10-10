// The host's `factEvaluator` as the web-automation domain declares it is
// assignable to Core's boundary (state-aware recovery plan, C9). The shapes
// below restate the domain's declarations in
// `domain/src/runtime/facts/condition.ts` and `domain/src/runtime/host-runtime.ts`
// word for word, because Core never imports a domain repository; `tsc` over
// this file is the check, and the runtime case shows the same object answers
// an observation.

import { describe, expect, expectTypeOf, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { observeAutomationStudioFacts } from "../../../executor/lifecycle-run/index.ts";
import type { AutomationStudioFactEvaluationContext, AutomationStudioHostFactResult, AutomationStudioHostRuntimeBoundary, AutomationStudioHostRuntimeCapability } from "../../../host-runtime.ts";
import type { AutomationStudioFactCondition } from "../../../executor/lifecycle/index.ts";

// The domain's declarations, restated.
type DomainFactVerdict = "true" | "false" | "unknown";
type DomainFactOp = "exists" | "absent" | "visible" | "enabled" | "equals" | "contains" | "matches" | "count";
type DomainFactConditionValue = string | number | boolean | { input: string } | { value: string };
type DomainFactCondition = { fact: string; op: DomainFactOp; value?: DomainFactConditionValue | undefined; target?: JsonObject | undefined };
type DomainFactEvidence = {
  element?: { tag?: string | undefined; role?: string | undefined; name?: string | undefined } | undefined;
  excerpt?: string | undefined;
  count?: number | undefined;
  dialogKind?: "consent" | "rate_limit" | "robot_check" | "promotion" | "assistant" | undefined;
  reason?: string | undefined;
};
type DomainFactResult = { result: DomainFactVerdict; evidence?: DomainFactEvidence | undefined; capturedAt: number };
type DomainFactEvaluationContext = {
  inputs?: Readonly<Record<string, JsonValue>> | undefined;
  values?: Readonly<Record<string, JsonValue>> | undefined;
  documentTimeOrigin?: number | undefined;
  signal?: AbortSignal | undefined;
  nodeId?: string | undefined;
  attemptId?: string | undefined;
};
type DomainFactEvaluator = (conditions: readonly (DomainFactCondition | JsonValue)[], context?: DomainFactEvaluationContext) => Promise<DomainFactResult[]>;
type DomainHostRuntime = AutomationStudioHostRuntimeBoundary & { factEvaluator: DomainFactEvaluator };

/** Core's evaluator as a plain function type, so the check below is strict rather than a method's bivariant one. */
type CoreFactEvaluator = (conditions: readonly AutomationStudioFactCondition[], context: AutomationStudioFactEvaluationContext) => readonly AutomationStudioHostFactResult[] | Promise<readonly AutomationStudioHostFactResult[]>;

describe("the host boundary's fact evaluation", () => {
  it("accepts the domain's host runtime and evaluator as they are declared", async () => {
    expectTypeOf<DomainHostRuntime>().toMatchTypeOf<AutomationStudioHostRuntimeBoundary>();
    expectTypeOf<DomainFactEvaluator>().toMatchTypeOf<CoreFactEvaluator>();
    expectTypeOf<NonNullable<AutomationStudioHostRuntimeBoundary["factEvaluator"]>>().toMatchTypeOf<CoreFactEvaluator>();
    expectTypeOf<"fact-evaluation">().toMatchTypeOf<AutomationStudioHostRuntimeCapability>();
    // Not vacuous: an evaluator answering in another shape is refused.
    expectTypeOf<(conditions: readonly AutomationStudioFactCondition[]) => Promise<Array<{ truth: DomainFactVerdict; capturedAt: number }>>>().not.toMatchTypeOf<CoreFactEvaluator>();

    const evaluator: DomainFactEvaluator = async (conditions) => conditions.map(() => ({ result: "true", evidence: { excerpt: "Signed in", reason: undefined }, capturedAt: 3 }));
    const runtime: DomainHostRuntime = { capabilities: ["fact-evaluation"], factEvaluator: evaluator };
    const bound: AutomationStudioHostRuntimeBoundary = runtime;
    const observation = await observeAutomationStudioFacts({ hostRuntime: bound, groups: [{ key: "g", conditions: [{ fact: "text", op: "contains", value: "Signed in" }] }], context: { nodeId: "n" } });
    expect(observation.calls).toBe(1);
    expect(observation.results.get("g")?.[0]).toMatchObject({ truth: "true", capturedAt: 3 });
    expect(JSON.stringify(observation.results.get("g"))).not.toContain("Signed in");
  });
});
