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
    // Every input it declares is read (`../callable-target.ts`, t581).
    "  step: type the query",
    "    node: web.dom.type",
    "    selector: .search",
    `    text: $input.${change.input ?? "query"}`,
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

  // The plan the project supervisor writes carries no success check (t569): proposing one is the builder's.
  it("takes the builder's own success check as its subflow's when the scope has none", async () => {
    const proposed = [{ fact: "text", op: "contains", value: "Elsewhere", target: { handle: "t8" } }];
    const fromPlan = await controller().submit(jsonPlan([subflow("find_listing", { metadata: { "fluxiq.successCheck": proposed } })]));
    if (!fromPlan.ok) throw new Error(JSON.stringify(fromPlan.check.feedback));
    expect(fromPlan.proposal.subflows[0]!.metadata?.["fluxiq.successCheck"]).toEqual(proposed);
    const fromScript = await controller().submit(script([...OPEN, "done when: text t8 contains \"Elsewhere\""]));
    if (!fromScript.ok) throw new Error(JSON.stringify(fromScript.check.feedback));
    expect(fromScript.proposal.subflows[0]!.metadata?.["fluxiq.successCheck"]).toEqual([expect.objectContaining({ fact: "text", op: "contains", value: "Elsewhere" })]);
    // A callable subflow's, inside its own part before its first step, as the submit tool tells the builder.
    const lines = callable();
    lines.splice(lines.findIndex((line) => line.startsWith("  step:")), 0, "  done when: text t8 contains \"Elsewhere\"");
    const fromPart = await controller(testScope({ interface: interfaceOf })).submit(script(lines));
    if (!fromPart.ok) throw new Error(JSON.stringify(fromPart.check.feedback));
    expect(fromPart.proposal.subflows.find((entry) => entry.key === "find_listing")!.metadata?.["fluxiq.successCheck"]).toEqual([expect.objectContaining({ fact: "text", op: "contains", value: "Elsewhere" })]);
    // And none proposed is none carried.
    const none = await controller().submit(script([...OPEN]));
    if (!none.ok) throw new Error(JSON.stringify(none.check.feedback));
    expect(none.proposal.subflows[0]!.metadata?.["fluxiq.successCheck"]).toBeUndefined();
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

  // A8 bigbox (t581): the refusal's `previous` was Core's probe, and two builders resent its lines.
  it("shows a refused callable subflow the script it sent, never the probe Core checked", async () => {
    const lines = callable();
    // A press that declares nothing it causes: the probe's own checks refuse it.
    lines.splice(lines.indexOf("end"), 0, "  step: press the sort", "    node: web.dom.click", "    selector: .sort");
    const sent = script(lines);
    const refused = await controller(testScope({ interface: interfaceOf })).submit(sent);
    if (refused.ok) throw new Error("expected a refusal");
    expect(refused.check.issueCodes).not.toContain("subflow.scope_refused");
    expect(refused.check.feedback?.previous).toBe(sent.flow);
    expect(JSON.stringify(refused.check.feedback)).not.toContain("subflow-probe-call");
  });

  // A8 bigbox (t581): revision 4 of a store-switching subflow read a list and switched nothing.
  it("refuses a revision that drops the lasting act an accepted revision of its brief did, and keeps refusing none to a brief that never did one", async () => {
    const act = ["step: choose the listing", "  node: web.dom.click", "  selector: .choose", "  consequences: modify_existing"];
    const scoped = controller();
    const first = await scoped.submit(script([...OPEN, ...act]));
    expect(first.ok, JSON.stringify(first)).toBe(true);
    const dropped = await scoped.submit(script([...OPEN, ...callPart(), ...part()]));
    if (dropped.ok) throw new Error("expected a refusal");
    expect(dropped.check.issueCodes).toEqual(["subflow.lasting_act_dropped"]);
    expect(JSON.stringify(dropped.check.feedback)).toContain("did a lasting act (modify_existing)");
    // The act kept, the revision stands.
    expect((await scoped.submit(script([...OPEN, ...act, "step: open the listings again", "  node: web.browser.navigate", "  url: https://listings.test/all"]))).ok).toBe(true);
    // A brief whose revisions never did one is asked for none.
    const reading = controller();
    expect((await reading.submit(script([...OPEN]))).ok).toBe(true);
    expect((await reading.submit(script([...OPEN, ...callPart(), ...part()]))).ok).toBe(true);
  });

  // A8 bigbox (t581): later subflows declared `storeName`, as the plan gave it, and none of their steps read it.
  it("refuses a callable part that declares an input none of its lines reads, naming it, and counts a fact or a call that gives it on as a read", async () => {
    const scope = testScope({ interface: interfaceOf });
    const unread = callable().filter((line) => !line.includes("$input.query") && line !== "  step: type the query" && line !== "    node: web.dom.type" && line !== "    selector: .search");
    const refused = await controller(scope).submit(script(unread));
    if (refused.ok) throw new Error("expected a refusal");
    expect(refused.check.issueCodes).toEqual(["subflow.input_unread"]);
    expect(refused.check.feedback).toMatchObject({ issues: [{ code: "subflow.input_unread", path: "flow.line.3", message: expect.stringContaining("The input \"query\" at line 3 is declared, and no line of this part reads it.") }] });
    // Read by a `done when:` fact.
    const fact = [...unread];
    fact.splice(fact.indexOf("  step: open the listings"), 0, "  done when: value t8 is $input.query");
    const byFact = await controller(scope).submit(script(fact));
    expect(byFact.ok, JSON.stringify(byFact)).toBe(true);
    // Given on to a part it calls, which reads it as its own.
    const given = unread.map((line) => line === "  step: run subflow narrow" ? "  step: run narrow\n    call: narrow\n    query: $input.query" : line)
      .map((line) => line === "part narrow: narrow the listing" ? "part narrow: narrow the listing\n  input: query" : line)
      .map((line) => line === "    consequences: none" ? "    consequences: none\n  step: type it\n    node: web.dom.type\n    selector: .search\n    text: $input.query" : line);
    const byCall = await controller(scope).submit(script(given));
    expect(byCall.ok, JSON.stringify(byCall)).toBe(true);
    // A longer name that starts with it is no read of it.
    const longer = unread.map((line) => line === "    url: https://listings.test/all" ? "    url: $input.queryText" : line);
    expect(await codes(controller(scope).submit(script(longer)))).toContain("subflow.input_unread");
  });

  // A8 launch 7 (t594): a first builder bound its output to a click's success port, a route that hands on no value.
  it("refuses a callable part's output bound to a step's success or failure port, with the way out of ending blocked", async () => {
    const scope = testScope({ interface: interfaceOf });
    const press = ["  step press: press the filter", "    node: web.dom.click", "    selector: .filter", "    consequences: none"];
    const bound = (binding: string) => {
      const lines = callable({ output: binding });
      lines.splice(lines.indexOf("end"), 0, ...press);
      return lines;
    };
    for (const port of ["success", "failed"]) {
      const refused = await controller(scope).submit(script(bound(`count = $step.press.${port}`)));
      if (refused.ok) throw new Error(`expected a refusal for ${port}`);
      expect(refused.check.issueCodes, port).toEqual(["subflow.output_not_a_value"]);
      const said = String(((refused.check.feedback?.issues as JsonObject[] | undefined)?.[0])?.message);
      expect(said).toContain(`The output "count" is bound to the ${port === "success" ? "success" : "failure"} port "${port}"`);
      expect(said).toContain("end the brief blocked and name the output, so the plan can change.");
    }
    // A value the step makes stands.
    const kept = await controller(scope).submit(script(bound("count = $step.rows.records")));
    expect(kept.ok, JSON.stringify(kept)).toBe(true);
  });

  // A8 launch 7 (t594): a dependent part asked a lasting act, and every submission pressed with `consequences: none`.
  it("refuses a submission that declares no lasting act when its brief's parts ask for one, and asks nothing of a brief whose parts do not", async () => {
    const asking = testScope({ parts: [{ partId: "p2", sourceId: "instruction.1", text: "Save the listing to the shortlist", lastingActs: ["create_new"] }] });
    const refused = await controller(asking).submit(script([...OPEN, ...callPart(), ...part()]));
    if (refused.ok) throw new Error("expected a refusal");
    expect(refused.check.issueCodes).toEqual(["subflow.lasting_act_missing"]);
    const said = JSON.stringify(refused.check.feedback);
    expect(said).toContain("ask for a lasting act (create_new), and no step of this submission declares one");
    expect(said).toContain("a subflow before it did it: end the brief blocked and say so");
    // Declared on the step that does it -- in whatever class the builder judges it -- the submission stands.
    const act = ["step: save it", "  node: web.dom.click", "  selector: .save", "  consequences: modify_existing"];
    expect((await controller(asking).submit(script([...OPEN, ...act]))).ok).toBe(true);
    // Parts that ask for none, or carry no acts at all, are asked nothing.
    expect((await controller(testScope({ parts: [{ partId: "p1", sourceId: "instruction.1", text: "Find the listings on the listings page", lastingActs: [] }] })).submit(script([...OPEN]))).ok).toBe(true);
    expect((await controller().submit(script([...OPEN]))).ok).toBe(true);
  });

  it("refuses a scope whose own key is a sibling's", () => {
    expect(() => new AutomationStudioSubflowScopedSubmissionController({ scope: testScope({ subflowKey: "checkout" }), siblings: [...SIBLINGS], submission: testSubmission() })).toThrow("subflow.scope_invalid");
  });
});
