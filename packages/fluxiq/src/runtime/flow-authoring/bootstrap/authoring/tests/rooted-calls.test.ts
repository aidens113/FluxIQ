import { describe, expect, it } from "vitest";
import { acceptAutomationStudioFlowBootstrapResult } from "../index.ts";
import { validateAutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { stateNodeRegistryFixture } from "../../plan/tests/index.ts";

const registry = stateNodeRegistryFixture([]);
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };

const SCRIPT = [
  "flow: Inspect a queue",
  "step first: run the grouped check",
  "  call: outer",
  "step again: repeat the shared check",
  "  call: shared",
  "part outer: group a check",
  "  step nested: run the shared check",
  "    call: shared",
  "end",
  "part shared: wait for readiness",
  "  step pause: wait briefly",
  "    node: builtin.timing.wait",
  "    duration: 1",
  "    unit: milliseconds",
  "end"
];

describe("script and canonical helper reachability", () => {
  it("accepts repeated and nested calls without extra Router entries for helpers", () => {
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: SCRIPT.join("\n") }, registry, resolution });
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
    expect(accepted.plan.router.rules).toEqual([]);
    expect(accepted.plan.subflows.map((subflow) => subflow.key)).toEqual(["main", "outer", "shared"]);
    const canonical = validateAutomationStudioFlowBootstrapPlan({ plan: structuredClone(accepted.plan), registry, resolution });
    expect(canonical.issues).toEqual([]);
    expect(canonical.ok).toBe(true);
  });

  it("refuses the same disconnected helper dependency in the canonical form", () => {
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: SCRIPT.join("\n") }, registry, resolution });
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
    const canonical = structuredClone(accepted.plan);
    const main = canonical.subflows[0]!;
    main.nodes = [{ key: "done", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }];
    main.edges = [];
    const refused = validateAutomationStudioFlowBootstrapPlan({ plan: canonical, registry, resolution });
    expect(refused.ok).toBe(false);
    expect(refused.issues.filter((issue) => issue.code === "bootstrap.subflow_unreachable")).toHaveLength(2);
  });

  it("keeps unknown script calls refused instead of treating a name as a saved helper", () => {
    const refused = acceptAutomationStudioFlowBootstrapResult({ result: { flow: "flow: Inspect a queue\nstep first: run a check\n  call: foreign" }, registry, resolution });
    expect(refused.ok).toBe(false);
  });
});
