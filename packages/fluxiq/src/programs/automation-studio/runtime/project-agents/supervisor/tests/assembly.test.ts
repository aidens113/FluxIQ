import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapSubflow } from "../../../flow-bootstrap/plan/index.ts";
import { automationStudioSubflowRekeyedParts, type AutomationStudioSubflowProposal } from "../../../flow-bootstrap/subflow-candidate/index.ts";
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

  it("refuses a missing proposal, one for another subflow, two router-run subflows without one, a circle and a key collision", () => {
    const find = part("find", ["author"], ["titles"]);
    const hold = part("hold", ["titles"], []);
    const plan = structure([main, find, hold]);
    const missing = automationStudioProjectAssembly({ structure: plan, proposals: new Map([["find", proposal(plan, find)]]), predecessors: new Map() });
    expect(!missing.ok && missing.issues.map((issue) => [issue.code, issue.subflowKey])).toEqual([["project.assemble_proposal_missing", "hold"]]);
    const other = automationStudioProjectAssembly({ structure: plan, proposals: new Map([["find", proposal(plan, find)], ["hold", proposal(plan, find)]]), predecessors: new Map() });
    expect(!other.ok && other.issues.map((issue) => [issue.code, issue.subflowKey])).toEqual([["project.assemble_proposal_stale", "hold"]]);
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

  it("assembles a proposal the plan in force kept from an earlier plan, and refuses one from an earlier plan it did not keep (t590)", () => {
    const find = part("find", ["author"], ["titles"]);
    const hold = part("hold", ["titles"], []);
    const plan = structure([main, find, hold]);
    const kept = proposal(plan, find);
    kept.scope.planDigest = "0".repeat(64);
    const proposals = new Map([["find", kept], ["hold", proposal(plan, hold)]]);
    const assembled = automationStudioProjectAssembly({ structure: plan, proposals, predecessors: new Map([["hold", ["find"]]]), kept: new Map([["find", "0".repeat(64)]]) });
    expect(assembled.ok && assembled.assembled.composed).toEqual({ subflowKey: "main", calls: ["find", "hold"] });
    for (const told of [undefined, new Map([["find", "1".repeat(64)]]), new Map([["hold", "0".repeat(64)]])]) {
      const refused = automationStudioProjectAssembly({ structure: plan, proposals, predecessors: new Map(), kept: told });
      expect(!refused.ok && refused.issues.map((issue) => [issue.code, issue.subflowKey])).toEqual([["project.assemble_proposal_stale", "find"]]);
    }
  });

  describe("step and dataset ids across briefs", () => {
    const read = (key: string, datasetId: string) => ({ key, definitionId: "test.read-list", definitionVersion: "1.0.0", parameters: { output: { datasetId, schema: { schemaVersion: "0.1", fields: [] }, writeMode: "append" } } });
    // Both builders named a helper `narrow` with a read step, and authoring derived its dataset id from the step id `narrow-s1`.
    const narrow: AutomationStudioFlowBootstrapSubflow = { key: "narrow", name: "Narrow", role: "utility", nodes: [read("s1", "titles-narrow-s1")], edges: [] };
    const find = part("find", ["author"], ["titles"]);
    const hold = part("hold", ["titles"], []);
    const plan = structure([main, find, hold]);
    const withParts = (subflow: AutomationStudioFlowBootstrapSubflow, parts: AutomationStudioFlowBootstrapSubflow[]) => {
      const made = proposal(plan, subflow);
      made.subflows = automationStudioSubflowRekeyedParts(made.subflows[0]!, parts);
      return made;
    };
    const ids = (subflows: readonly AutomationStudioFlowBootstrapSubflow[]) => subflows.flatMap((subflow) => subflow.nodes.map((node) => ({ step: `${subflow.key}-${node.key}`, dataset: (node.parameters?.output as { datasetId?: string } | undefined)?.datasetId })));

    it("assembles two briefs that both named a helper `narrow` with distinct step and dataset ids", () => {
      const assembled = automationStudioProjectAssembly({ structure: plan, proposals: new Map([["find", withParts(find, [narrow])], ["hold", withParts(hold, [narrow])]]), predecessors: new Map([["hold", ["find"]]]) });
      expect(assembled.ok).toBe(true);
      if (!assembled.ok) return;
      const all = ids(assembled.assembled.plan.subflows);
      expect(new Set(all.map((id) => id.step)).size).toBe(all.length);
      const datasets = all.flatMap((id) => (id.dataset ? [id.dataset] : []));
      expect(datasets).toEqual(["titles-find-narrow-s1", "titles-hold-narrow-s1"]);
    });

    it("refuses a dataset id two briefs both wrote, naming both briefs", () => {
      const own = { ...narrow, nodes: [read("s1", "titles")] };
      const assembled = automationStudioProjectAssembly({ structure: plan, proposals: new Map([["find", withParts(find, [own])], ["hold", withParts(hold, [own])]]), predecessors: new Map() });
      expect(!assembled.ok && assembled.issues.map((issue) => [issue.code, issue.subflowKey])).toEqual([["project.assemble_dataset_id_collision", "hold-narrow"]]);
      const message = assembled.ok ? "" : assembled.issues[0]!.message;
      expect(message).toContain('brief "brief-find"');
      expect(message).toContain('brief "brief-hold"');
    });

    it("refuses a step id two briefs' subflows both derive, naming both briefs", () => {
      const first = proposal(plan, find);
      first.subflows[0]!.nodes[0]!.key = "x-s1";
      const second = withParts(hold, [{ key: "x", name: "X", role: "utility", nodes: [{ key: "s1", definitionId: "test.note", definitionVersion: "1.0.0" }], edges: [] }]);
      // find's node `x-s1` derives the step id `find-x-s1`, and so does node `s1` of hold's part once keyed `find-x`.
      second.subflows[1]!.key = "find-x";
      const assembled = automationStudioProjectAssembly({ structure: plan, proposals: new Map([["find", first], ["hold", second]]), predecessors: new Map() });
      expect(!assembled.ok && assembled.issues.map((issue) => [issue.code, issue.subflowKey])).toEqual([["project.assemble_step_id_collision", "find-x"]]);
      const message = assembled.ok ? "" : assembled.issues[0]!.message;
      expect(message).toContain('brief "brief-find"');
      expect(message).toContain('brief "brief-hold"');
    });

    it("lets one brief's own subflows share a dataset", () => {
      const own = { ...narrow, nodes: [read("s1", "titles")] };
      const made = withParts(find, [own]);
      made.subflows[0]!.nodes = [read("n1", "titles")];
      const assembled = automationStudioProjectAssembly({ structure: plan, proposals: new Map([["find", made], ["hold", proposal(plan, hold)]]), predecessors: new Map() });
      expect(assembled.ok).toBe(true);
    });

    it("assembles two router-run entries that two briefs both wrote as `main`, each renamed under its own key", () => {
      const first: AutomationStudioFlowBootstrapSubflow = { key: "by_author", name: "By author", role: "primary", nodes: [], edges: [], metadata: check };
      const second: AutomationStudioFlowBootstrapSubflow = { key: "by_shelf", name: "By shelf", role: "primary", nodes: [], edges: [], metadata: check };
      const entries = structure([first, second]);
      const written = (subflow: AutomationStudioFlowBootstrapSubflow) => {
        const made = proposal(entries, subflow);
        const entry = { ...made.subflows[0]!, nodes: [read("s1", "titles-main-s1")] };
        made.subflows = automationStudioSubflowRekeyedParts(entry, [], { targetWrittenKey: "main" });
        return made;
      };
      const assembled = automationStudioProjectAssembly({ structure: entries, proposals: new Map([["by_author", written(first)], ["by_shelf", written(second)]]), predecessors: new Map() });
      expect(assembled.ok, JSON.stringify(assembled)).toBe(true);
      if (!assembled.ok) return;
      expect(ids(assembled.assembled.plan.subflows).map((id) => id.dataset)).toEqual(["titles-by_author-s1", "titles-by_shelf-s1"]);
      const unrenamed = (subflow: AutomationStudioFlowBootstrapSubflow) => {
        const made = proposal(entries, subflow);
        made.subflows = [{ ...made.subflows[0]!, nodes: [read("s1", "titles-main-s1")] }];
        return made;
      };
      const refused = automationStudioProjectAssembly({ structure: entries, proposals: new Map([["by_author", unrenamed(first)], ["by_shelf", unrenamed(second)]]), predecessors: new Map() });
      expect(!refused.ok && refused.issues.map((issue) => issue.code)).toEqual(["project.assemble_dataset_id_collision"]);
    });
  });
});

// t593, A8 bigbox `run-mv8c7unr-42a8456d`: the whole trial ran the assembled Flow on the page the last subflow trial left.
describe("the assembled Flow's arrival", () => {
  const arrival = { key: "arrival", definitionId: "web.output.browser-navigate", definitionVersion: "1.0.0", parameters: { url: "https://library.test/" }, outputActionId: "browser.navigate", consequences: [] };

  it("opens the router-run subflow assembly writes, so a run of the saved Flow starts where its subflows were built", () => {
    const parts = [part("find", [], ["titles"]), part("hold", ["titles"], [])];
    const plan = structure([main, ...parts]);
    const proposals = new Map(parts.map((subflow) => [subflow.key, proposal(plan, subflow)]));
    const assembled = automationStudioProjectAssembly({ structure: plan, proposals, predecessors: new Map([["hold", ["find"]]]), arrival });
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    const [composed, ...called] = assembled.assembled.plan.subflows;
    // The first step is the arrival, and it goes on to the first call.
    expect(composed!.nodes[0]).toEqual(arrival);
    expect(composed!.nodes.slice(1).map((node) => node.key)).toEqual(["s1", "s2"]);
    expect(composed!.edges.map((edge) => [edge.source.nodeKey, edge.source.portId, edge.target.nodeKey])).toEqual([["arrival", "success", "s1"], ["s1", "success", "s2"]]);
    // A part it calls begins where the call before it leaves the site, so it never arrives.
    expect(called.flatMap((subflow) => subflow.nodes.map((node) => node.definitionId))).toEqual(["web.output.browser-navigate", "web.output.browser-navigate"]);
    expect(called.every((subflow) => !subflow.nodes.some((node) => node.key === "arrival"))).toBe(true);
    expect(assembled.assembled.composed).toEqual({ subflowKey: "main", calls: ["find", "hold"] });
  });

  it("goes after a proposed router-run subflow's Start, and leaves one that already opens with it as it was", () => {
    const plan = structure([main]);
    const started: AutomationStudioSubflowProposal = { ...proposal(plan, main), subflows: [{ ...main, nodes: [{ key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" }, { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }], edges: [{ key: "start_end", source: { nodeKey: "start", portId: "next" }, target: { nodeKey: "end", portId: "in" } }] }] };
    const assembled = automationStudioProjectAssembly({ structure: plan, proposals: new Map([["main", started]]), predecessors: new Map(), arrival });
    const subflow = assembled.ok ? assembled.assembled.plan.subflows[0]! : undefined;
    expect(subflow?.nodes.map((node) => node.key)).toEqual(["start", "end", "arrival"]);
    expect(subflow?.edges.map((edge) => [edge.source.nodeKey, edge.source.portId, edge.target.nodeKey])).toEqual([["start", "next", "arrival"], ["arrival", "success", "end"]]);

    const arriving: AutomationStudioSubflowProposal = { ...proposal(plan, main), subflows: [{ ...main, nodes: [{ ...arrival, key: "go" }], edges: [] }] };
    const unchanged = automationStudioProjectAssembly({ structure: plan, proposals: new Map([["main", arriving]]), predecessors: new Map(), arrival });
    expect(unchanged.ok && unchanged.assembled.plan.subflows[0]!.nodes.map((node) => node.key)).toEqual(["go"]);
  });

  it("refuses when the domain names an arrival the registry cannot give, and writes none when there is no arrival", () => {
    const find = part("find", [], []);
    const plan = structure([main, find]);
    const proposals = new Map([["find", proposal(plan, find)]]);
    const refused = automationStudioProjectAssembly({ structure: plan, proposals, predecessors: new Map(), arrival: null });
    expect(!refused.ok && refused.issues.map((issue) => issue.code)).toEqual(["project.assemble_arrival_unavailable"]);
    const none = automationStudioProjectAssembly({ structure: plan, proposals, predecessors: new Map() });
    expect(none.ok && none.assembled.plan.subflows[0]!.nodes.map((node) => node.key)).toEqual(["s1"]);
  });
});
