// The state-aware statements of a Flow script (t388, contract C12): a part a
// step calls, a block's other entries, checkpoints, handlers and the page facts
// they test. What is checked is the plan each assembles to -- the parts as
// Subflows, the call nodes, each handler's registration, body and end, the
// entry and checkpoint metadata, and what the Flow requires -- and that the
// plan passes the plan validator, so the graph shape is one a Flow can be
// built from. Each refusal names the script line it is about.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { type AutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapSubflow } from "../../plan/index.ts";
import { savedFlowValidation, stateNodeRegistryFixture, webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, automationStudioFlowBootstrapIssuePlace, parseAutomationStudioFlowScript } from "../index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import { assertAutomationStudioFlowBootstrapPlanHandlesResolved, resolveAutomationStudioFlowBootstrapPlanParameters } from "../../../llm/index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = stateNodeRegistryFixture(webDomainNodeDefinitionsFixture(), resolution);

function accept(lines: readonly string[], library: AutomationStudioNodeRegistry = registry) {
  return acceptAutomationStudioFlowBootstrapResult({ result: { flow: lines.join("\n") }, registry: library, resolution });
}

/** The accepted plan, failing the test with every error when there is none. */
function planOf(lines: readonly string[]): AutomationStudioFlowBootstrapPlan {
  const accepted = accept(lines);
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues, null, 2));
  expect(accepted.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  // Held to the plan validator, then saved as the Flow apply writes and held to the Flow's own validation (C4).
  expect(savedFlowValidation(accepted.plan, registry, resolution).errors).toEqual([]);
  return accepted.plan;
}

/** Each edge of a Subflow as `source.port -> target`. */
function wiring(subflow: AutomationStudioFlowBootstrapSubflow): string[] {
  return subflow.edges.map((edge) => `${edge.source.nodeKey}.${edge.source.portId} -> ${edge.target.nodeKey}`);
}

/** The refusals of a script: each code with the line it names and the step the locator places it at. */
function refusals(lines: readonly string[], library?: AutomationStudioNodeRegistry): Array<{ code: string; line?: number; step?: string }> {
  const accepted = accept(lines, library);
  expect(accepted.ok).toBe(false);
  return accepted.issues.filter((issue) => issue.severity === "error").map((issue) => {
    const place = automationStudioFlowBootstrapIssuePlace(accepted.locator, issue.path);
    return { code: issue.code, ...(place?.line === undefined ? {} : { line: place.line }), ...(place?.step === undefined ? {} : { step: place.step }) };
  });
}

const open = ["flow: Renew a library loan", "step: open the account", "  node: web.browser.navigate", "  url: https://library.test/account"];
const read = (label: string) => [`step ${label}: read the loans`, "  node: web.dom.extract_list", "  extractList: extraction.1", "  extractList.minItems: 0"];
const press = (label: string, target = "t3") => [`step ${label}: press ${label}`, "  node: web.dom.click", `  selector: #${target}`, "  consequences: none"];

describe("reading the state-aware lines", () => {
  it("keeps a handler inside the block it is written in: its `end` returns there, not to the main sequence", () => {
    const { script, issues } = parseAutomationStudioFlowScript([
      "part renewal: renew one loan",
      "  step first: press first",
      "  on retry for first: a notice",
      "    when: exists t1",
      "    step: close it",
      "    then: carry on",
      "  end",
      "  step second: press second",
      "end",
      "step outside: press outside"
    ].join("\n"));
    expect(issues).toEqual([]);
    expect(script.blocks.map((block) => [block.label, block.steps.map((step) => step.label ?? step.description)])).toEqual([
      [undefined, ["outside"]],
      ["renewal", ["first", "second"]],
      [":on1", ["close it"]]
    ]);
    expect(script.blocks[2]!.handler).toEqual({ event: "retry", scope: "for first", situation: "a notice", then: { text: "carry on", line: 6 }, parent: 1, line: 3 });
    expect(script.blocks[2]!.when).toEqual([{ text: "exists t1", line: 4 }]);
  });

  it("gives `when:` lines to the `start at:` above them, until a step starts", () => {
    const { script } = parseAutomationStudioFlowScript(["step a: press a", "start at: b", "when: exists t1", "when: absent t2", "step b: press b", "done when: exists t3"].join("\n"));
    const [main] = script.blocks;
    expect(main!.entries).toEqual([{ step: "b", when: [{ text: "exists t1", line: 3 }, { text: "absent t2", line: 4 }], line: 2 }]);
    expect(main!.when).toBeUndefined();
    expect(main!.done).toEqual([{ text: "exists t3", line: 6 }]);
  });

  it("still reads `then:` outside a handler, and in one when it says no next move, as a step; and `output:` with no `=` as the output action", () => {
    const { script } = parseAutomationStudioFlowScript([
      "then: press go",
      "  output: web.dom.click",
      "on fail for x: something",
      "  then: close the panel",
      "  then: give up",
      "end"
    ].join("\n"));
    expect(script.blocks[0]!.steps[0]).toMatchObject({ description: "press go", entries: [{ key: "output", lines: ["web.dom.click"], line: 2 }] });
    expect(script.blocks[1]!.steps.map((step) => step.description)).toEqual(["close the panel"]);
    expect(script.blocks[1]!.handler!.then).toEqual({ text: "give up", line: 5 });
  });
});

describe("a part a step calls", () => {
  const part = [
    "part renewal: renew one loan",
    "  input: card",
    "  output: loans = $step.loans.records",
    "  step: type the card number",
    "    node: web.dom.type",
    "    selector: #t1",
    "    text: $input.card",
    ...read("loans").map((line) => `  ${line}`),
    "end"
  ];

  it("becomes its own Subflow with its interface, run by the call node the step becomes", () => {
    const plan = planOf([
      ...open,
      "step renew: renew the loan",
      "  call: renewal",
      "  card: $input.card = 4417",
      "step: say what is due",
      "  node: web.dom.type",
      "  selector: #t9",
      "  text: $step.renew.loans",
      ...part
    ]);
    expect(plan.subflows.map((subflow) => [subflow.key, subflow.role])).toEqual([["main", "primary"], ["renewal", "utility"]]);
    const [main, renewal] = plan.subflows;
    expect(main!.nodes.map((node) => node.definitionId)).toEqual(["web.output.browser-navigate", "builtin.control.call-subflow", "web.output.dom-type"]);
    expect(main!.nodes[1]!.parameters).toEqual({
      subflowId: "renewal",
      inputs: { card: { $state: { path: "card", fallback: 4417 } } },
      outputs: { loans: "loans" }
    });
    // The caller reads the part's output off the call node, by the call step's label.
    expect(main!.nodes[2]!.parameters?.text).toEqual({ $state: { path: "$node.s2.loans" } });
    expect(wiring(main!)).toEqual(["s1.success -> s2", "s2.success -> s3"]);
    // Inside the part, `$input.card` is the part's own input, needing no test value; nothing else crosses in.
    expect(renewal!.nodes[0]!.parameters?.text).toEqual({ $state: { path: "card" } });
    expect(renewal!.interface).toEqual({
      inputs: [{ id: "card", name: "card", valueType: { kind: "unknown" }, required: true }],
      outputs: [{ id: "loans", name: "loans", valueType: { kind: "unknown" }, metadata: { binding: { $state: { path: "$node.s2.records" } } } }]
    });
    // The router never runs a part: it is no rule's target and not the fallback.
    expect(plan.router.rules).toEqual([]);
    expect(plan.router.fallback).toEqual({ kind: "subflow", targetSubflowKey: "main" });
    expect(plan.metadata).toEqual({ requires: ["flow.subflow-calls@1"] });
    expect(main!.metadata).toEqual({ requires: ["flow.subflow-calls@1"] });
  });

  it("reads `step: run subflow <part>` as the same call, rather than ignoring it", () => {
    const plan = planOf([...open, "step: run subflow renewal", ...part.filter((line) => !line.includes("input: card")).map((line) => line.replace("$input.card", "4417"))]);
    expect(plan.subflows[0]!.nodes[1]!).toMatchObject({ definitionId: "builtin.control.call-subflow", parameters: { subflowId: "renewal", inputs: {} } });
  });

  it("refuses a call to no part, to a situation, beside a node, with a stray or missing input, and a part that calls itself", () => {
    expect(refusals([...open, "step: renew", "  call: nowhere"])).toEqual([{ code: "flow_script.unknown_block", line: 6, step: "renew" }]);
    expect(refusals([...open, "step: renew", "  call: late", "subflow late: a late notice", "  when: state.page.dialog exists", ...press("close"), "end"]))
      .toEqual([{ code: "flow_script.call_situation", line: 6, step: "renew" }]);
    expect(refusals([...open, "step: renew", "  node: web.dom.click", "  call: renewal", ...part]).map((issue) => issue.code)).toContain("flow_script.call_misplaced");
    expect(refusals([...open, "step: renew", "  call: renewal", "  card: 4417", "  colour: red", ...part]))
      .toEqual([{ code: "flow_script.call_unknown_input", line: 8, step: "renew" }]);
    expect(refusals([...open, "step: renew", "  call: renewal", ...part])).toEqual([{ code: "flow_script.call_input_missing", line: 6, step: "renew" }]);
    expect(refusals([...open, "step: renew", "  call: loop", "part loop: go round", "  step: again", "    call: loop", "end"]).map((issue) => issue.code))
      .toContain("flow_script.call_cycle");
  });

  it("refuses an interface on a block no step calls, a malformed name, and an output no step of the part gives", () => {
    expect(refusals([...open, "input: card"])).toEqual([{ code: "flow_script.part_interface_invalid", line: 5, step: "open the account" }]);
    expect(refusals([...open, "step: renew", "  call: renewal", "  item: 1", ...part.map((line) => line.replace("input: card", "input: item"))]).map((issue) => issue.code))
      .toContain("flow_script.part_interface_invalid");
    const outside = refusals([...open, "step: renew", "  call: renewal", "  card: 1", ...part.map((line) => line.replace("$step.loans.records", "$row.title"))]);
    expect(outside).toEqual([{ code: "flow_script.part_interface_invalid", line: 10, step: "renew one loan" }]);
  });

  it("refuses a part's step that reads an input the part does not declare", () => {
    const codes = refusals([...open, "step: renew", "  call: renewal", "  card: 1", ...part.map((line) => line.replace("$input.card", "$input.pin = 9"))]);
    expect(codes).toEqual([expect.objectContaining({ code: "flow_script.invalid_binding" })]);
  });

  it("is refused at the call line when the library offers no Call Subflow", () => {
    // Core's built-ins and the web library: the handler nodes, and no Call Subflow yet (R1-call-subflow).
    const library = new AutomationStudioNodeRegistry();
    for (const definition of webDomainNodeDefinitionsFixture()) library.register(definition);
    expect(refusals([...open, "step: renew", "  call: renewal", "  card: 1", ...part], library).map((issue) => [issue.code, issue.line]))
      .toContainEqual(["flow_script.call_unavailable", 6]);
  });
});

describe("a handler", () => {
  const notice = [
    "  on retry for loans: a slow-down notice covers the list",
    "    when: dialog alertdialog \"Please wait\"",
    "    step: close the notice",
    "      node: web.dom.click",
    "      selector: #t30",
    "      consequences: none",
    "    then: carry on",
    "  end"
  ];

  it("becomes a registration whose body leads through its steps to its end, beside the block's own steps", () => {
    const plan = planOf([...open, ...read("loans"), ...notice, ...press("next")]);
    const main = plan.subflows[0]!;
    expect(main.nodes.map((node) => `${node.key} ${node.definitionId}`)).toEqual([
      "s1 web.output.browser-navigate", "s2 web.output.dom-extract_list", "s3 web.output.dom-click",
      "h1-s1 builtin.control.handler", "h1-s2 web.output.dom-click", "h1-s3 builtin.control.handler-end"
    ]);
    // The `end` of a handler returns to its block: the press after it is the block's next step.
    expect(wiring(main)).toEqual(["s1.success -> s2", "s2.success -> s3", "h1-s1.body -> h1-s2", "h1-s2.success -> h1-s3"]);
    expect(main.nodes[3]!.parameters).toEqual({
      event: "retry",
      scope: { kind: "nodes", nodeIds: ["s2"] },
      when: [{ fact: "dialog", op: "visible", target: { kind: "dialog", role: "alertdialog", name: "Please wait" } }],
      order: 1,
      // No `done when:`: the notice being gone is the proof, read off its `when:`.
      completionCheck: [{ fact: "dialog", op: "absent", target: { kind: "dialog", role: "alertdialog", name: "Please wait" } }],
      maxRuns: 1
    });
    expect(main.nodes[5]!.parameters).toEqual({ disposition: "resume", checkpointId: "", outputs: {} });
    expect(plan.metadata).toEqual({ requires: ["flow.handlers@1", "web.facts@1"] });
  });

  it("reads `go to` a checkpoint, `use` after a failure with a known alternative, and `give up`", () => {
    const plan = planOf([
      ...open,
      ...read("loans").slice(0, 1), "  checkpoint: yes", ...read("loans").slice(1),
      "step renew: renew the loan",
      "  call: renewal",
      "on fail for renew: the renewal desk refused",
      "  step other: renew by the reading-room desk",
      "    call: desk",
      "  then: use loans = $step.other.loans",
      "end",
      "on next for loans: the list is a page of adverts",
      "  when: exists t44",
      "  then: go to loans",
      "end",
      "on fail for loans: the list never came",
      "  then: give up",
      "end",
      "part renewal: renew at the desk",
      "  output: loans = $step.done.records",
      ...read("done").map((line) => `  ${line}`),
      "end",
      "part desk: renew at the reading room",
      "  output: loans = $step.done2.records",
      ...read("done2").map((line) => `  ${line}`),
      "end"
    ]);
    const main = plan.subflows[0]!;
    expect(main.nodes.find((node) => node.key === "s2")!.metadata).toEqual({ "fluxiq.checkpoint": { id: "loans", requires: [] } });
    const ends = main.nodes.filter((node) => node.definitionId === "builtin.control.handler-end").map((node) => node.parameters);
    expect(ends).toEqual([
      { disposition: "resolve", checkpointId: "", outputs: { loans: { $state: { path: "$node.h1-s2.loans" } } } },
      { disposition: "route", checkpointId: "loans", outputs: {} },
      { disposition: "unhandled", checkpointId: "", outputs: {} }
    ]);
    const registrations = main.nodes.filter((node) => node.definitionId === "builtin.control.handler").map((node) => node.parameters);
    expect(registrations.map((parameters) => [parameters?.event, parameters?.scope, parameters?.order])).toEqual([
      ["fail", { kind: "nodes", nodeIds: ["s3"] }, 1],
      ["before_next", { kind: "nodes", nodeIds: ["s2"] }, 2],
      ["fail", { kind: "nodes", nodeIds: ["s2"] }, 3]
    ]);
    // The alternative is a call to another part inside the handler's body.
    expect(main.nodes.find((node) => node.key === "h1-s2")!.parameters).toMatchObject({ subflowId: "desk" });
    expect(plan.subflows.map((subflow) => subflow.key)).toEqual(["main", "renewal", "desk"]);
    expect(plan.metadata?.requires).toEqual(["flow.handlers@1", "flow.subflow-calls@1", "web.facts@1"]);
  });

  it("written everywhere, registers in the Flow's recovery Subflow with automation scope", () => {
    const plan = planOf([...open, ...read("loans"), "on before everywhere: a session-timeout notice", "  when: visible t70", ...press("stay", "t71").map((line) => `  ${line}`), "  then: carry on", "end"]);
    const recovery = plan.subflows.find((subflow) => subflow.role === "recovery")!;
    expect(recovery.key).toBe("recovery");
    expect(recovery.nodes.map((node) => node.definitionId)).toEqual(["builtin.control.handler", "web.output.dom-click", "builtin.control.handler-end"]);
    expect(recovery.nodes[0]!.parameters).toMatchObject({ event: "before", scope: { kind: "automation" }, completionCheck: [{ fact: "absent", op: "absent", target: { handle: "t70" } }] });
    expect(plan.router.fallback).toEqual({ kind: "subflow", targetSubflowKey: "main" });
  });

  it("refuses a scope, a then and a missing check, each at its line, and a library with no handler nodes at the handler", () => {
    const handler = (lines: string[]) => refusals([...open, ...read("loans"), ...lines]);
    expect(handler(["on retry for nowhere: a notice", "  when: exists t1", "  then: carry on", "end"])).toEqual([{ code: "flow_script.handler_invalid", line: 9, step: "a notice" }]);
    expect(handler(["on fail for loans: no list", "  then: carry on", "end"])).toEqual([{ code: "flow_script.handler_then_invalid", line: 10, step: "no list" }]);
    expect(handler(["on fail for loans: no list", "end"])).toEqual([{ code: "flow_script.handler_then_invalid", line: 9, step: "no list" }]);
    expect(handler(["on retry for loans: a notice", "  then: use loans = 1", "end"])).toEqual([{ code: "flow_script.handler_then_invalid", line: 10, step: "a notice" }]);
    expect(handler(["on fail for loans: no list", "  then: go to loans", "end"])).toEqual([{ code: "flow_script.handler_then_invalid", line: 10, step: "no list" }]);
    expect(handler(["on retry for loans: a notice", "  when: text t1 contains \"wait\"", "  then: carry on", "end"])).toEqual([{ code: "flow_script.handler_check_missing", line: 9, step: "a notice" }]);
    expect(handler(["on retry for loans: a notice", "  when: somewhere t1", "  then: carry on", "end"])).toEqual([{ code: "flow_script.fact_invalid", line: 10, step: "a notice" }]);
    // The web library alone, with none of Core's built-ins: no handler nodes.
    const library = new AutomationStudioNodeRegistry(webDomainNodeDefinitionsFixture());
    expect(refusals([...open, ...read("loans"), "on fail for loans: no list", "  then: give up", "end"], library)).toEqual([{ code: "flow_script.handler_unavailable", line: 9, step: "no list" }]);
  });

  it("is told apart from a branch: `on <port>: go to` stays a branch", () => {
    const read = parseAutomationStudioFlowScript([...open, ...press("first"), "  on failed: go to other", ...press("other")].join("\n"));
    expect(read.script.blocks).toHaveLength(1);
    expect(read.script.blocks[0]!.steps[1]!.branches).toEqual([{ port: "failed", target: "other", line: 9 }]);
  });
});

describe("a block's other entries and its checkpoints", () => {
  it("writes `start at:` with its facts as the step's entry, in the order written, with the inputs it reads", () => {
    const plan = planOf([
      ...open,
      "start at: search",
      "when: exists t4",
      "when: text t2 contains \"Signed in\"",
      ...press("sign-in"),
      "step search: search for the title",
      "  node: web.dom.type",
      "  selector: #t4",
      "  text: $input.title = Gardening",
      "  checkpoint: yes"
    ]);
    const node = plan.subflows[0]!.nodes.find((candidate) => candidate.key === "s3")!;
    expect(node.metadata).toEqual({
      "fluxiq.checkpoint": { id: "search", requires: ["title"] },
      "fluxiq.entry": {
        id: "search",
        order: 1,
        when: [{ fact: "exists", op: "exists", target: { handle: "t4" } }, { fact: "text", op: "contains", value: "Signed in", target: { handle: "t2" } }],
        requires: ["title"]
      }
    });
    expect(plan.metadata).toEqual({ requires: ["web.facts@1"] });
  });

  it("refuses an entry naming no step, the first step, one with no when, and a checkpoint inside a repeat, each at its line", () => {
    expect(refusals([...open, "start at: nowhere", "when: exists t1", ...press("go")])).toEqual([{ code: "flow_script.entry_invalid", line: 5, step: "open the account" }]);
    expect(refusals([...open, "start at: go", ...press("go")])).toEqual([{ code: "flow_script.entry_invalid", line: 5, step: "open the account" }]);
    expect(refusals([...open, ...read("loans"), "step each: press each", "  node: web.dom.click", "  selector: #t3", "  consequences: none", "  repeat over: loans", "  checkpoint: yes"]))
      .toEqual([{ code: "flow_script.checkpoint_invalid", line: 14, step: "press each" }]);
    expect(refusals([...open, ...press("go"), "  checkpoint: perhaps"])).toEqual([{ code: "flow_script.checkpoint_invalid", line: 9, step: "press go" }]);
  });

  it("keeps a situation block's `when:` as the router's condition, unchanged", () => {
    const plan = planOf([...open, "subflow late: a late notice", "  when: state.page.dialog exists", ...press("close").map((line) => `  ${line}`), "end"]);
    expect(plan.router.rules).toHaveLength(1);
    expect(plan.router.rules[0]!.condition).toBeDefined();
    expect(plan.metadata).toBeUndefined();
  });

  it("writes a block's `done when:` as its success check", () => {
    const plan = planOf([...open, ...press("go"), "done when: text t8 contains \"Renewed\""]);
    expect(plan.subflows[0]!.metadata).toEqual({ "fluxiq.successCheck": [{ fact: "text", op: "contains", value: "Renewed", target: { handle: "t8" } }], requires: ["web.facts@1"] });
  });

  // A hand-authored or test Flow names a fact's element by a locator the host interprets (t402).
  const located = [
    ...open,
    "start at: go",
    "when: visible at \"#renew-form\"",
    "when: exists t4",
    ...press("go"),
    "done when: text at \".notice[data-kind='ok']\" contains \"Renewed\"",
    "done when: count at \"li.loan\" is 0"
  ];
  const locatedEntry = [{ fact: "visible", op: "visible", target: { locator: "#renew-form" } }, { fact: "exists", op: "exists", target: { handle: "t4" } }];
  const locatedCheck = [
    { fact: "text", op: "contains", value: "Renewed", target: { locator: ".notice[data-kind='ok']" } },
    { fact: "count", op: "count", value: 0, target: { locator: "li.loan" } }
  ];
  const entryOf = (plan: AutomationStudioFlowBootstrapPlan) => plan.subflows[0]!.nodes.find((node) => node.metadata?.["fluxiq.entry"])!.metadata!["fluxiq.entry"]!.when;

  it("writes a fact naming its element by `at` as a locator target, beside a handle fact unchanged", () => {
    const plan = planOf(located);
    expect(entryOf(plan)).toEqual(locatedEntry);
    expect(plan.subflows[0]!.metadata!["fluxiq.successCheck"]).toEqual(locatedCheck);
  });

  it("leaves a locator target alone through bootstrap's handle resolution", async () => {
    const asked: JsonObject[] = [];
    type Binding = NonNullable<Parameters<typeof resolveAutomationStudioFlowBootstrapPlanParameters>[0]["binding"]>;
    const resolvePlanNodeParameters: NonNullable<Binding["resolvePlanNodeParameters"]> = (input) => {
      asked.push(input.parameters);
      return { status: "resolved" as const, parameters: JSON.parse(JSON.stringify(input.parameters).replace(/\{"handle":"([^"]+)"\}/gu, "\"#$1\"")) as JsonObject };
    };
    const resolved = await resolveAutomationStudioFlowBootstrapPlanParameters({ plan: planOf(located), projectId: "project.one", flowId: "flow.one", binding: { resolvePlanNodeParameters }, handlesIssued: true, permissionFor: () => async () => ({ permitted: true as const }) });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(asked.length).toBeGreaterThan(0);
    expect(JSON.stringify(asked)).not.toContain("locator");
    expect(entryOf(resolved.plan)).toEqual(locatedEntry);
    expect(resolved.plan.subflows[0]!.metadata!["fluxiq.successCheck"]).toEqual(locatedCheck);
    expect(() => assertAutomationStudioFlowBootstrapPlanHandlesResolved(resolved.plan)).not.toThrow();
  });

  it("refuses an empty locator, and `at` with no quoted locator, at its line", () => {
    expect(refusals([...open, ...press("go"), "done when: exists at \"\""]).map(({ code, line }) => ({ code, line }))).toEqual([{ code: "flow_script.fact_invalid", line: 9 }]);
    expect(refusals([...open, ...press("go"), "done when: visible at #renew-form"]).map(({ code, line }) => ({ code, line }))).toEqual([{ code: "flow_script.fact_invalid", line: 9 }]);
  });
});
