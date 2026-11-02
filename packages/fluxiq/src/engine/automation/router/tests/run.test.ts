import { expect, it, vi } from "vitest";
import type { AutomationConditionExpression } from "@fluxiq/contracts/state";
import type { ExecutableRouteRule } from "../../../../flows/executable/routing/index.ts";
import { runExecutableRouter } from "../index.ts";

it("selects the first matching original target and records exact ordered rejection/decision bytes", () => {
  const target = { subflowId: "target.actual", status: "active" as const, graph: { marker: "whole target" } };
  const rule = (ruleId: string, order: number, status: "active" | "disabled", expected: boolean): ExecutableRouteRule => ({ ruleId, order, status, target: { kind: "subflow", subflowId: target.subflowId }, condition: { signalPath: "state.ready", operator: "equals", expected } });
  const neverRead: ExecutableRouteRule = { ...rule("later", 4, "active", true), get condition(): AutomationConditionExpression { throw new Error("evaluated beyond the selected route"); } };
  const now = vi.fn(() => 0), rerouteSource = { fromSubflowId: "target.previous", reason: "known alternative" };
  const result = runExecutableRouter({ projectId: "project.actual", flowId: "flow.actual", router: { routerId: "router.actual", flowId: "flow.actual", rules: [rule("disabled", 1, "disabled", true), rule("missed", 2, "active", false), rule("matched", 3, "active", true), neverRead] }, subflows: [target], currentStateSummary: { ready: true }, rerouteSource, now });
  expect(result.selectedSubflow).toBe(target);
  expect(result.selectedSubflow?.graph).toBe(target.graph);
  expect(result).toEqual({ status: "running", selectedSubflow: target, decision: { decisionId: "route-decision.router.actual.0", routerId: "router.actual", selectedRuleId: "matched", selectedSubflowId: "target.actual", rejectedRuleIds: ["disabled", "missed"], decidedAt: 0, metadata: { evaluationCount: 3, evaluations: [
    { ruleId: "disabled", matched: false, reason: "Rule is not active.", targetSubflowId: "target.actual" },
    { ruleId: "missed", matched: false, reason: "state.ready equals expected value: false.", targetSubflowId: "target.actual" },
    { ruleId: "matched", matched: true, reason: "state.ready equals expected value: true.", targetSubflowId: "target.actual" }
  ], rerouteSource } }, evaluations: [
    { ruleId: "disabled", matched: false, reason: "Rule is not active.", targetSubflowId: "target.actual" },
    { ruleId: "missed", matched: false, reason: "state.ready equals expected value: false.", targetSubflowId: "target.actual" },
    { ruleId: "matched", matched: true, reason: "state.ready equals expected value: true.", targetSubflowId: "target.actual" }
  ], diagnostics: [] });
  expect(result.decision.metadata?.rerouteSource).toBe(rerouteSource);
  expect(now).toHaveBeenCalledTimes(1);
});

it.each([
  { name: "no fallback", fallback: undefined, message: "No active route matched and no active fallback subflow is configured.", used: false },
  { name: "default fail", fallback: { kind: "fail" as const }, message: "No route matched and router fallback is configured to fail.", used: true },
  { name: "empty fail message", fallback: { kind: "fail" as const, message: "" }, message: "No active route matched and no active fallback subflow is configured.", used: false },
  { name: "configured fail", fallback: { kind: "fail" as const, message: "Configured failure." }, message: "Configured failure.", used: true }
])("preserves exact failure/fallback omission and truthiness: $name", ({ fallback, message, used }) => {
  const now = vi.fn(() => 123);
  const result = runExecutableRouter({ projectId: "project.actual", flowId: "flow.actual", router: { routerId: "router.actual", flowId: "flow.actual", rules: [], ...(fallback ? { fallback } : {}) }, subflows: [], now });
  expect(result).toEqual({ status: "failed", selectedSubflow: null, decision: { decisionId: "route-decision.router.actual.123", routerId: "router.actual", fallbackUsed: used, rejectedRuleIds: [], decidedAt: 123, metadata: { evaluationCount: 0, evaluations: [], diagnostics: [{ severity: "error", code: "router.no_route", message }] } }, evaluations: [], diagnostics: [{ severity: "error", code: "router.no_route", message }] });
  expect(now).toHaveBeenCalledTimes(1);
});

it("keeps compile diagnostics on failure without reading conditions and still takes exactly one clock reading", () => {
  const now = vi.fn(() => 7);
  const rule: ExecutableRouteRule = { ruleId: "rule.missing", order: 1, status: "active", target: { kind: "subflow", subflowId: "target.missing" }, get condition(): AutomationConditionExpression { throw new Error("condition read for invalid plan"); } };
  const result = runExecutableRouter({ projectId: "project.actual", flowId: "flow.actual", router: { routerId: "router.actual", flowId: "flow.actual", rules: [rule] }, subflows: [], now });
  expect(result.evaluations).toEqual([]);
  expect(result.diagnostics.map(item => item.code)).toEqual(["router.rule_missing_target"]);
  expect(result.decision.metadata?.diagnostics).toEqual(result.diagnostics);
  expect(result.decision.metadata?.diagnostics).not.toBe(result.diagnostics);
  expect(result.decision.decidedAt).toBe(7);
  expect(now).toHaveBeenCalledTimes(1);
});

it("uses only an active fallback target and preserves the default wall clock", () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(91);
  try {
    const target = { subflowId: "target.actual", status: "active" as const };
    const input = { projectId: "project.actual", flowId: "flow.actual", router: { routerId: "router.actual", flowId: "flow.actual", rules: [], fallback: { kind: "subflow" as const, subflowId: target.subflowId } } };
    const result = runExecutableRouter({ ...input, subflows: [target] });
    expect(result).toMatchObject({ status: "running", selectedSubflow: target, decision: { fallbackUsed: true, selectedSubflowId: target.subflowId, decidedAt: 91 } });
    expect(result.selectedSubflow).toBe(target);
    expect(result.decision).not.toHaveProperty("selectedRuleId");
    expect(runExecutableRouter({ ...input, subflows: [{ ...target, status: "disabled" as const }] })).toMatchObject({ status: "failed", selectedSubflow: null, decision: { fallbackUsed: false } });
    expect(now).toHaveBeenCalledTimes(2);
  } finally { now.mockRestore(); }
});

it("bounds metadata while retaining full evaluations, exact reasons and state provenance without raw values", () => {
  const target = { subflowId: "target.actual", status: "active" as const };
  const rules: ExecutableRouteRule[] = Array.from({ length: 18 }, (_, index) => ({ ruleId: `rule.${index}`, order: index, status: "active", target: { kind: "subflow", subflowId: target.subflowId }, condition: { signalPath: `state.${"long".repeat(100)}.${index}`, operator: "exists" } }));
  const paths = Array.from({ length: 20 }, (_, index) => `state.path.${index}`), unavailable = "u".repeat(350);
  const result = runExecutableRouter({ projectId: "project.actual", flowId: "flow.actual", router: { routerId: "router.actual", flowId: "flow.actual", rules }, subflows: [target], currentStateSummary: { secret: "RAW-STATE-SENTINEL" }, stateSource: { observed: false, paths, unavailable }, now: () => 1 });
  expect(result.evaluations).toHaveLength(18);
  expect(result.evaluations[0]!.reason.length).toBeGreaterThan(300);
  expect(result.decision.metadata).toEqual({ evaluationCount: 18, evaluations: result.evaluations.slice(0, 16).map(item => ({ ...item, reason: item.reason.slice(0, 300) })), routeState: { observed: false, paths: paths.slice(0, 16), unavailable: unavailable.slice(0, 300) }, diagnostics: result.diagnostics });
  expect(JSON.stringify(result.decision.metadata)).not.toContain("RAW-STATE-SENTINEL");
  expect(result.decision.rejectedRuleIds).toEqual(rules.map(rule => rule.ruleId));
});
