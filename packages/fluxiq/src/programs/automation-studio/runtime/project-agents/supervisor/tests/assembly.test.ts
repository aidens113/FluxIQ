import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapSubflow } from "../../../flow-bootstrap/plan/index.ts";
import type { AutomationStudioSubflowProposal } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioProjectStructurePlan, automationStudioProjectTaskSpec, type AutomationStudioProjectStructurePlan } from "../../contracts/index.ts";
import { automationStudioProjectAssembly } from "../index.ts";

const port = (id: string) => ({ id, name: id, valueType: { kind: "unknown" as const } });
const check = { "fluxiq.successCheck": [{ fact: "saved", op: "exists" as const }] };

function structure(subflows: AutomationStudioFlowBootstrapSubflow[]): AutomationStudioProjectStructurePlan {
  const spec = { parts: [{ id: "p1", quote: { sourceId: "s", text: "x" }, goalFacts: [], lastingActs: [] }], notAsked: [] };
  const taskSpecDigest = automationStudioProjectTaskSpec.digest(spec);
  const plan = { schemaVersion: "0.1" as const, router: { name: "R", rules: [], fallback: { kind: "subflow" as const, targetSubflowKey: subflows[0]!.key } }, subflows };
  const partOf = Object.fromEntries(subflows.map((subflow, index) => [subflow.key, index === 0 ? [] : ["p1"]]));
  return { taskSpecDigest, plan, partOf, digest: automationStudioProjectStructurePlan.digest({ taskSpecDigest, plan, partOf }) };
}

const main: AutomationStudioFlowBootstrapSubflow = { key: "main", name: "Main", role: "primary", nodes: [], edges: [], metadata: check };
const part = (key: string, inputs: string[], outputs: string[]): AutomationStudioFlowBootstrapSubflow => ({ key, name: key, role: "utility", nodes: [], edges: [], interface: { inputs: inputs.map(port), outputs: outputs.map(port) }, metadata: check });

function proposal(plan: AutomationStudioProjectStructurePlan, subflow: AutomationStudioFlowBootstrapSubflow, extra: AutomationStudioFlowBootstrapSubflow[] = []): AutomationStudioSubflowProposal {
  const body = { ...subflow, nodes: [{ key: "n1", definitionId: "web.output.browser-navigate", definitionVersion: "1.0.0", parameters: { url: "https://library.test" } }] };
  return { scope: { buildId: "b", briefId: `brief-${subflow.key}`, planDigest: plan.digest, subflowKey: subflow.key }, revision: 1, digest: "d".repeat(64), subflows: [body, ...extra], summary: "s", changedPaths: [] };
}

describe("assembly", () => {
  it("writes the router-run subflow as calls in dependency order, each input bound to the latest earlier output of its name", () => {
    const parts = [part("hold", ["titles"], ["shelf"]), part("find", ["author"], ["titles"]), part("note", ["shelf", "titles"], [])];
    const plan = structure([main, ...parts]);
    const proposals = new Map(parts.map((subflow) => [subflow.key, proposal(plan, subflow)]));
    const assembled = automationStudioProjectAssembly({ structure: plan, proposals, predecessors: new Map([["hold", ["find"]], ["note", ["hold"]], ["find", []]]) });
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    const composed = assembled.assembled.plan.subflows[0]!;
    expect(assembled.assembled.composed).toEqual({ subflowKey: "main", calls: ["find", "hold", "note"] });
    expect(composed.nodes.map((node) => node.parameters?.inputs)).toEqual([
      { author: { $state: { path: "author" } } },
      { titles: { $state: { path: "$node.s1.titles" } } },
      { shelf: { $state: { path: "$node.s2.shelf" } }, titles: { $state: { path: "$node.s1.titles" } } }
    ]);
    expect(composed.edges.map((edge) => [edge.source.nodeKey, edge.target.nodeKey])).toEqual([["s1", "s2"], ["s2", "s3"]]);
    expect(composed.metadata).toEqual({ ...check, requires: ["flow.subflow-calls@1"] });
    expect(assembled.assembled.plan.metadata).toEqual({ requires: ["flow.subflow-calls@1"] });
    expect(assembled.assembled.flowInputs).toEqual([{ subflowKey: "find", input: "author" }]);
  });

  it("uses a router-run subflow's own proposal and writes no calls for it", () => {
    const plan = structure([main]);
    const assembled = automationStudioProjectAssembly({ structure: plan, proposals: new Map([["main", proposal(plan, main)]]), predecessors: new Map() });
    expect(assembled.ok && assembled.assembled.composed).toBe(undefined);
    expect(assembled.ok && assembled.assembled.plan.subflows.map((subflow) => subflow.key)).toEqual(["main"]);
  });

  it("refuses a missing proposal, one for another plan, two router-run subflows without one, a circle and a key collision", () => {
    const find = part("find", ["author"], ["titles"]);
    const hold = part("hold", ["titles"], []);
    const plan = structure([main, find, hold]);
    const missing = automationStudioProjectAssembly({ structure: plan, proposals: new Map([["find", proposal(plan, find)]]), predecessors: new Map() });
    expect(!missing.ok && missing.issues.map((issue) => [issue.code, issue.subflowKey])).toEqual([["project.assemble_proposal_missing", "hold"]]);
    const stale = proposal(plan, hold);
    stale.scope.planDigest = "0".repeat(64);
    const old = automationStudioProjectAssembly({ structure: plan, proposals: new Map([["find", proposal(plan, find)], ["hold", stale]]), predecessors: new Map() });
    expect(!old.ok && old.issues.map((issue) => issue.code)).toEqual(["project.assemble_proposal_stale"]);
    const two = structure([main, { ...main, key: "other" }, find]);
    const ambiguous = automationStudioProjectAssembly({ structure: two, proposals: new Map([["find", proposal(two, find)]]), predecessors: new Map() });
    expect(!ambiguous.ok && ambiguous.issues.map((issue) => issue.code)).toEqual(["project.assemble_main_ambiguous", "project.assemble_main_ambiguous"]);
    const both = new Map([["find", proposal(plan, find)], ["hold", proposal(plan, hold)]]);
    const circle = automationStudioProjectAssembly({ structure: plan, proposals: both, predecessors: new Map([["find", ["hold"]], ["hold", ["find"]]]) });
    expect(!circle.ok && circle.issues.map((issue) => issue.code)).toEqual(["project.assemble_cycle"]);
    const colliding = new Map([["find", proposal(plan, find, [{ key: hold.key, name: hold.name, role: hold.role, nodes: [], edges: [] }])], ["hold", proposal(plan, hold)]]);
    const collision = automationStudioProjectAssembly({ structure: plan, proposals: colliding, predecessors: new Map() });
    expect(!collision.ok && collision.issues.map((issue) => issue.code)).toEqual(["project.assemble_key_collision"]);
  });
});
