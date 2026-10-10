// What the nodes of a Flow assembled from a candidate script are named (t398).
// The editor and the chat name a node by its `label`; a script's steps had
// none, so each read "One step" and each handler "Handler". A written step is
// named by what it says it does, a handler by the situation it handles, its
// end by what happens after, and a part's Subflow by what the part does. A
// node Core derived -- a join, a loop -- is named by nothing written.
import { describe, expect, it } from "vitest";
import { savedFlowValidation, stateNodeRegistryFixture, webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = stateNodeRegistryFixture(webDomainNodeDefinitionsFixture(), resolution);

function topologyOf(lines: readonly string[]) {
  const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: lines.join("\n") }, registry, resolution });
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues, null, 2));
  const saved = savedFlowValidation(accepted.plan, registry, resolution);
  expect(saved.errors).toEqual([]);
  return { plan: accepted.plan, topology: saved.topology! };
}

const open = ["flow: Renew a library loan", "step: open the account", "  node: web.browser.navigate", "  url: https://library.test/account"];
const read = ["step loans: read the loans", "  node: web.dom.extract_list", "  extractList: extraction.1", "  extractList.minItems: 0"];

describe("the names a written script gives its nodes", () => {
  it("names each step by what it says it does, and a handler by its situation and its end by what follows", () => {
    const { topology } = topologyOf([
      ...open,
      ...read,
      "  on retry for loans: a slow-down notice covers the list",
      "    when: dialog alertdialog \"Please wait\"",
      "    step: close the notice",
      "      node: web.dom.click",
      "      selector: #t30",
      "      consequences: none",
      "    then: carry on",
      "  end"
    ]);
    const main = topology.subflows[0]!.graphFlow;
    const named = main.nodes.map((node) => [node.definitionId, node.label]);
    expect(named).toHaveLength(5);
    expect(named).toEqual(expect.arrayContaining([
      ["web.output.browser-navigate", "open the account"],
      ["web.output.dom-extract_list", "read the loans"],
      ["builtin.control.handler", "a slow-down notice covers the list"],
      ["web.output.dom-click", "close the notice"],
      ["builtin.control.handler-end", "Then carry on"]
    ]));
  });

  it("names a part's Subflow by what the part does, and the call by its step", () => {
    const { topology } = topologyOf([
      ...open,
      "step renew: renew the loan",
      "  call: renewal",
      "part renewal: renew one loan at the desk",
      ...read.map((line) => `  ${line}`),
      "end"
    ]);
    expect(topology.subflows.map((entry) => entry.subflow.name)).toEqual(["Main", "renew one loan at the desk"]);
    expect(topology.subflows[0]!.graphFlow.nodes.map((node) => node.label)).toEqual(["open the account", "renew the loan"]);
    expect(topology.subflows[1]!.graphFlow.nodes.map((node) => node.label)).toEqual(["read the loans"]);
  });

  it("names a whole-automation handler in the recovery Subflow the same way", () => {
    const { topology } = topologyOf([...open, ...read, "on before everywhere: a session-timeout notice", "  when: visible t70", "  step stay: stay signed in", "    node: web.dom.click", "    selector: #t71", "    consequences: none", "  then: carry on", "end"]);
    const recovery = topology.subflows.find((entry) => entry.subflow.role === "recovery")!.graphFlow;
    expect(recovery.nodes.map((node) => node.label)).toEqual(["a session-timeout notice", "stay signed in", "Then carry on"]);
  });

  it("leaves a node Core derived unnamed", () => {
    const { topology } = topologyOf([...open, "step: accept the cookies", "  node: web.dom.click", "  selector: #t5", "  consequences: none", "  optional: yes", "step: press next", "  node: web.dom.click", "  selector: #t6", "  consequences: none"]);
    const nodes = topology.subflows[0]!.graphFlow.nodes;
    expect(nodes.filter((node) => node.definitionId === "builtin.control.merge").map((node) => node.label)).toEqual([undefined]);
    expect(nodes.filter((node) => node.definitionId !== "builtin.control.merge").map((node) => node.label)).toEqual(["open the account", "accept the cookies", "press next"]);
  });
});
