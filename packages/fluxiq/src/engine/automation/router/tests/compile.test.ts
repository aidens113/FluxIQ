import { expect, it } from "vitest";
import { compileExecutableRouterPlan } from "../index.ts";
import type { ExecutableRouteRule } from "../../../../flows/executable/routing/index.ts";

it("sorts a copied rule list deterministically and retains complete original rule/target identities", () => {
  const target = { subflowId: "target.actual", status: "active" as const, payload: { label: "retained" } };
  const rule = (ruleId: string, order: number) => ({ ruleId, order, status: "active" as const, target: { kind: "subflow" as const, subflowId: target.subflowId }, label: `original.${ruleId}` });
  const later = rule("later", 2), tieSecond = rule("b", 1), tieFirst = rule("a", 1);
  const router = { routerId: "router.actual", flowId: "flow.actual", rules: [later, tieSecond, tieFirst] };
  const plan = compileExecutableRouterPlan({ router, subflows: [target] });
  expect(plan.status).toBe("queued");
  expect(plan.rules.map(item => item.rule.ruleId)).toEqual(["a", "b", "later"]);
  expect(router.rules).toEqual([later, tieSecond, tieFirst]);
  expect(plan.rules[0]!.rule).toBe(tieFirst);
  expect(plan.rules[0]!.targetSubflow).toBe(target);
  const label: string = plan.rules[0]!.rule.label;
  const payload: { label: string } | undefined = plan.rules[0]!.targetSubflow?.payload;
  expect(label).toBe("original.a");
  expect(payload).toBe(target.payload);
});

it("keeps the existing last-duplicate target projection and inactive target handling", () => {
  const first = { subflowId: "target.actual", status: "active" as const, marker: "first" };
  const last = { ...first, status: "disabled" as const, marker: "last" };
  const rule: ExecutableRouteRule = { ruleId: "rule.actual", order: 1, status: "active", target: { kind: "subflow", subflowId: first.subflowId } };
  const plan = compileExecutableRouterPlan({ router: { routerId: "router.actual", flowId: "flow.actual", rules: [rule], fallback: rule.target }, subflows: [first, last] });
  expect(plan).toMatchObject({ status: "queued", rules: [{ disabled: true }], diagnostics: [] });
  expect(plan.rules[0]!.targetSubflow).toBe(last);
  expect(plan.fallbackSubflow).toBe(last);
});

it("records exact missing-rule diagnostics in sorted order before the missing fallback, including disabled rules", () => {
  const rules: ExecutableRouteRule[] = [
    { ruleId: "rule.b", order: 2, status: "active", target: { kind: "subflow", subflowId: "missing.b" } },
    { ruleId: "rule.a", order: 1, status: "disabled", target: { kind: "subflow", subflowId: "missing.a" } }
  ];
  const plan = compileExecutableRouterPlan({ router: { routerId: "router.actual", flowId: "flow.actual", rules, fallback: { kind: "subflow", subflowId: "missing.fallback" } }, subflows: [] });
  expect(plan).toEqual({
    routerId: "router.actual", flowId: "flow.actual", status: "failed",
    rules: [{ rule: rules[1], targetSubflow: null, disabled: true }, { rule: rules[0], targetSubflow: null, disabled: true }],
    fallbackSubflow: null,
    diagnostics: [
      { severity: "error", code: "router.rule_missing_target", message: "Route rule rule.a targets missing subflow missing.a.", ruleId: "rule.a", subflowId: "missing.a" },
      { severity: "error", code: "router.rule_missing_target", message: "Route rule rule.b targets missing subflow missing.b.", ruleId: "rule.b", subflowId: "missing.b" },
      { severity: "error", code: "router.fallback_missing_target", message: "Router fallback targets missing subflow missing.fallback.", subflowId: "missing.fallback" }
    ]
  });
});
