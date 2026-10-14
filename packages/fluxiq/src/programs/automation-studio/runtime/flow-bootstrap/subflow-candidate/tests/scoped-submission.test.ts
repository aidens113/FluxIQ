import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioSubflowScopedSubmissionController, AUTOMATION_STUDIO_SUBFLOW_SCOPE_REFUSED_CODE, type AutomationStudioSubflowScope } from "../index.ts";
import { parseAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapSubflow } from "../../plan/index.ts";
import { OPEN, SIBLINGS, callPart, part, script, testScope, testSubmission } from "./subflow-fixture.ts";

const interfaceOf = { inputs: [{ id: "query", name: "query", valueType: { kind: "unknown" as const }, required: true as const }], outputs: [{ id: "count", name: "count", valueType: { kind: "unknown" as const } }] };
const successCheck = [{ fact: "text", op: "contains", value: "Listings", target: { handle: "t8" } }] as unknown as NonNullable<AutomationStudioSubflowScope["successCheck"]>;

function controller(scope: AutomationStudioSubflowScope = testScope()) {
  return new AutomationStudioSubflowScopedSubmissionController({ scope, siblings: [...SIBLINGS], submission: testSubmission() });
}

/** A JSON plan of one target and whatever else, router as given. */
function jsonPlan(subflows: JsonObject[], router: JsonObject = { name: "Find", rules: [], fallback: { kind: "subflow", targetSubflowKey: "find_listing" } }): JsonObject {
  return { summary: "Find the listings", plan: { schemaVersion: "0.1", router, subflows } };
}

/** A callable subflow as its part: given `query`, handing back `count`, calling one helper. */
function callable(change: { input?: string; output?: string | undefined } = {}): string[] {
  const output = "output" in change ? change.output : "count = $step.rows.records";
  return [
    "flow: Find the listings",
    "part find_listing: find the listings",
    `  input: ${change.input ?? "query"}`,
    ...(output === undefined ? [] : [`  output: ${output}`]),
    "  step: open the listings",
    "    node: web.browser.navigate",
    "    url: https://listings.test/all",
    "  step: run subflow narrow",
    "  step rows: read the rows",
    "    node: web.dom.extract_list",
    "    extractList: extraction.1",
    "    extractList.minItems: 0",
    "end",
    ...part()
  ];
}

/** The subflows each Call Subflow step of a subflow names. */
function callsOf(subflow: AutomationStudioFlowBootstrapSubflow): unknown[] {
  return subflow.nodes.filter((node) => node.definitionId === "builtin.control.call-subflow").map((node) => node.parameters?.subflowId);
}

/** The plan parser's errors for a plan of these subflows: the re-keyed keys and rewritten calls still parse. */
function planIssues(subflows: readonly AutomationStudioFlowBootstrapSubflow[]): string[] {
  const plan = { schemaVersion: "0.1", router: { name: "Probe", rules: [], fallback: { kind: "subflow", targetSubflowKey: subflows[0]!.key } }, subflows };
  return parseAutomationStudioFlowBootstrapPlan(plan).issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.code}:${issue.path ?? ""}`);
}

function navigate(key = "n1"): JsonObject {
  return { key, definitionId: "web.output.browser-navigate", definitionVersion: "1.0.0", parameters: { url: "https://listings.test/all" } };
}

function subflow(key: string, extra: JsonObject = {}): JsonObject {
  return { key, name: key, role: "primary", nodes: [navigate()], edges: [], ...extra };
}

async function codes(submitted: Promise<Awaited<ReturnType<AutomationStudioSubflowScopedSubmissionController["submit"]>>>): Promise<readonly string[]> {
  const answer = await submitted;
  if (answer.ok) throw new Error(`expected a refusal, got revision ${answer.proposal.revision}`);
  return answer.check.issueCodes;
}

describe("a subflow builder's scoped submission", () => {
  it("accepts a router-run subflow and the part it calls, the part re-keyed under it, carrying the plan's success check", async () => {
    const scoped = controller(testScope({ successCheck }));
    const answer = await scoped.submit(script([...OPEN, ...callPart(), ...part()]));
    expect(answer.ok, JSON.stringify(answer)).toBe(true);
    if (!answer.ok) return;
    const [target, helper] = answer.proposal.subflows;
    expect(answer.proposal.scope).toEqual({ buildId: "build.1", briefId: "brief-1", planDigest: "plan.digest.1", subflowKey: "find_listing" });
    expect(answer.proposal.subflows.map((entry) => entry.key)).toEqual(["find_listing", "find_listing-narrow"]);
    expect(target!.interface).toBeUndefined();
    expect(target!.metadata?.["fluxiq.successCheck"]).toEqual(successCheck);
    expect(callsOf(target!)).toEqual(["find_listing-narrow"]);
    expect(helper!.nodes.map((node) => node.definitionId)).toEqual(["web.output.dom-click"]);
    expect(planIssues(answer.proposal.subflows), JSON.stringify(answer.proposal.subflows)).toEqual([]);
    expect(scoped.matches({ revision: answer.proposal.revision, digest: answer.proposal.digest })).toBe(true);
    expect(scoped.latest()?.digest).toBe(answer.proposal.digest);
  });

  it("accepts a callable subflow written as its part, outputs bound, its helper re-keyed and the call to it rewritten", async () => {
    const scoped = controller(testScope({ interface: interfaceOf }));
    const answer = await scoped.submit(script(callable()));
    expect(answer.ok, JSON.stringify(answer)).toBe(true);
    if (!answer.ok) return;
    const [target, helper] = answer.proposal.subflows;
    // The call the probe appended to run the part is no part of the proposal.
    expect(answer.proposal.subflows.map((entry) => entry.key)).toEqual(["find_listing", "find_listing-narrow"]);
    expect(target!.interface?.inputs).toEqual(interfaceOf.inputs);
    expect(target!.interface?.outputs).toEqual([{ ...interfaceOf.outputs[0], metadata: { binding: { $state: { path: "$node.s3.records" } } } }]);
    expect(callsOf(target!)).toEqual(["find_listing-narrow"]);
    expect(helper!.nodes.map((node) => node.definitionId)).toEqual(["web.output.dom-click"]);
    expect(planIssues(answer.proposal.subflows), JSON.stringify(answer.proposal.subflows)).toEqual([]);
  });

  it("renames a router-run entry's derived dataset ids under the scope's key, as a helper part's are", async () => {
    const read = ["step: read the rows", "  node: web.dom.extract_list", "  extractList: extraction.1", "  extractList.minItems: 0", "  recordOutput.label: Titles", "  recordOutput.schema: title"];
    const answer = await controller().submit(script([...OPEN, ...read, ...callPart(), ...part()]));
    expect(answer.ok, JSON.stringify(answer)).toBe(true);
    if (!answer.ok) return;
    const datasets = answer.proposal.subflows.flatMap((entry) => entry.nodes.flatMap((node) => Object.values(node.parameters ?? {}).flatMap((value) => {
      const id = value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject).datasetId : undefined;
      return typeof id === "string" ? [{ subflow: entry.key, node: node.key, id }] : [];
    })));
    // The script writes its entry as `main`, so authoring derived `titles-main-s2`; the proposal keys it under the scope.
    expect(datasets).toEqual([{ subflow: "find_listing", node: "s2", id: "titles-find_listing-s2" }]);
  });

  it("refuses a callable subflow's unbound, renamed or extra output, its mismatched inputs, and steps outside its part", async () => {
    const scope = testScope({ interface: interfaceOf });
    expect(await codes(controller(scope).submit(script(callable({ output: undefined }))))).toEqual(["subflow.output_unbound"]);
    expect(await codes(controller(scope).submit(script(callable({ output: "total = $step.rows.records" }))))).toEqual(["subflow.interface_output_mismatch", "subflow.output_unbound"]);
    expect(await codes(controller(scope).submit(script(callable({ input: "term" }))))).toEqual(["subflow.interface_input_mismatch"]);
    expect(await codes(controller(scope).submit(script([...OPEN, ...callable()])))).toEqual(["subflow.steps_outside_part"]);
    expect(await codes(controller(scope).submit(script([...OPEN])))).toEqual(["subflow.steps_outside_part", "subflow.target_part_missing"]);
    // The JSON plan reader keeps no part interface, so a callable subflow is a script.
    expect(await codes(controller(scope).submit(jsonPlan([subflow("find_listing")])))).toEqual(["subflow.script_required"]);
  });

  it("refuses a part whose re-keyed name would be a sibling's", async () => {
    const scoped = new AutomationStudioSubflowScopedSubmissionController({ scope: testScope(), siblings: [...SIBLINGS, "find_listing-narrow"], submission: testSubmission() });
    expect(await codes(scoped.submit(script([...OPEN, ...callPart(), ...part()])))).toEqual(["subflow.part_key_collision"]);
  });

  it("refuses a `when:` line, and the router rule it makes", async () => {
    const refused = await codes(controller().submit(script([...OPEN, "subflow late: a notice stands in front", "  when: state.page.dialog exists", "  step: close it", "    node: web.dom.click", "    selector: .close", "    consequences: none", "end"])));
    expect(refused).toEqual(expect.arrayContaining(["subflow.when_refused", "subflow.router_rule_refused"]));
  });

  it("refuses a router rule in a JSON plan", async () => {
    const rule = { key: "r1", name: "Late", targetSubflowKey: "find_listing", routeTags: ["late"], condition: { type: "fact", path: "state.page.dialog", operator: "exists" } };
    const refused = await codes(controller().submit(jsonPlan([subflow("find_listing")], { name: "Find", rules: [rule], fallback: { kind: "subflow", targetSubflowKey: "find_listing" } })));
    expect(refused).toContain("subflow.router_rule_refused");
  });

  it("refuses a subflow that is neither the scope's nor a part it calls", async () => {
    expect(await codes(controller().submit(jsonPlan([subflow("find_listing"), subflow("stray", { role: "utility" })])))).toEqual(["subflow.foreign_subflow_refused"]);
    // A sibling's subflow written as the target is another brief's.
    expect(await codes(controller().submit(jsonPlan([subflow("checkout")], { name: "Find", rules: [], fallback: { kind: "subflow", targetSubflowKey: "checkout" } })))).toEqual(["subflow.foreign_subflow_refused"]);
  });

  it("refuses a part keyed as a sibling of the structure plan, or as the scope's own subflow", async () => {
    expect(await codes(controller().submit(script([...OPEN, ...callPart("checkout"), ...part("checkout")])))).toEqual(["subflow.part_key_collision"]);
    expect(await codes(controller().submit(script([...OPEN, ...callPart("find_listing"), ...part("find_listing")])))).toEqual(["subflow.part_key_collision"]);
  });

  it("refuses an interface on a subflow the router runs", async () => {
    expect(await codes(controller().submit(jsonPlan([subflow("find_listing", { interface: interfaceOf })])))).toEqual(["subflow.interface_changed"]);
  });

  it("refuses any change to the scope's success check", async () => {
    const scope = testScope({ successCheck });
    const other = [{ fact: "text", op: "contains", value: "Elsewhere", target: { handle: "t8" } }];
    expect(await codes(controller(scope).submit(jsonPlan([subflow("find_listing", { metadata: { "fluxiq.successCheck": other } })])))).toEqual(["subflow.success_check_changed"]);
    // A script's `done when:` for the steps outside every block is that subflow's success check.
    expect(await codes(controller(scope).submit(script([...OPEN, "done when: text t8 contains \"Elsewhere\""])))).toEqual(["subflow.success_check_changed"]);
  });

  it("says the refusal under its own code and clears the standing proposal", async () => {
    const scoped = controller();
    const accepted = await scoped.submit(script([...OPEN]));
    expect(accepted.ok).toBe(true);
    const refused = await scoped.submit(jsonPlan([subflow("find_listing"), subflow("stray", { role: "utility" })]));
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.check.feedback).toMatchObject({ code: AUTOMATION_STUDIO_SUBFLOW_SCOPE_REFUSED_CODE, issues: [{ code: "subflow.foreign_subflow_refused", path: "plan.subflows.1" }] });
    expect(scoped.latest()).toBeUndefined();
  });

  it("runs the existing completion check on the probe, with every refusal named by its line", async () => {
    const refused = await controller().submit(script([...OPEN, "step: press nothing known", "  node: web.dom.click", "  selector: .x"]));
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.check.issueCodes.length).toBeGreaterThan(0);
    expect(refused.check.issueCodes).not.toContain("subflow.scope_refused");
  });

  it("never matches another brief's receipt, for the same submission", async () => {
    const first = controller();
    const second = controller(testScope({ briefId: "brief-2" }));
    const a = await first.submit(script([...OPEN]));
    const b = await second.submit(script([...OPEN]));
    if (!a.ok || !b.ok) throw new Error("both should be accepted");
    expect(a.proposal.revision).toBe(b.proposal.revision);
    expect(a.proposal.digest).not.toBe(b.proposal.digest);
    expect(first.matches({ revision: b.proposal.revision, digest: b.proposal.digest })).toBe(false);
    expect(second.matches({ revision: a.proposal.revision, digest: a.proposal.digest })).toBe(false);
  });

  it("refuses a scope whose own key is a sibling's", () => {
    expect(() => new AutomationStudioSubflowScopedSubmissionController({ scope: testScope({ subflowKey: "checkout" }), siblings: [...SIBLINGS], submission: testSubmission() })).toThrow("subflow.scope_invalid");
  });
});
