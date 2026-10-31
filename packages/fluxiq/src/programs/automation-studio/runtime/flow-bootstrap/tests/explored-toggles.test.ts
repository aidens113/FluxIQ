// t775: the build's record of the explored presses the domain answered as a
// toggle, as its permission wrapper keeps it from every call that ran.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowBootstrapActionPermissions } from "../action-permissions.ts";
import { AutomationStudioExploredToggles } from "../explored-toggles.ts";

const PRESS = { node: "domain.demo.press", parameters: { target: { handle: "t1" } }, consequences: ["modify_existing"] };
const answer = (outputs: JsonObject | undefined, extra: JsonObject = {}): JsonObject => ({
  kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, ...(outputs ? { outputs } : {}),
  draft: { actionId: "domain.demo.press", ranWith: { node: "domain.demo.press", parameters: { target: { selector: "#setting" } } } }, ...extra
});

describe("the explored toggles record", () => {
  it("keeps actual paired evidence and drops only an invalid optional pre-state", () => {
    const toggles = new AutomationStudioExploredToggles();
    const signature = { state: "s.on" };
    const beforeSignature = { state: "s.off" };
    toggles.explored({ toolId: "core.run_node", value: PRESS }, answer({ toggle: { signature, beforeSignature } }));
    toggles.explored({ toolId: "core.run_node", value: PRESS }, answer({ toggle: { signature, beforeSignature: {} } }));
    toggles.explored({ toolId: "core.run_node", value: PRESS }, answer({ toggle: { signature, beforeSignature: { state: "x".repeat(4_100) } } }));
    expect(toggles.list().map((record) => record.beforeSignature)).toEqual([beforeSignature, undefined, undefined]);
    beforeSignature.state = "changed.after.recording";
    expect(toggles.list()[0]!.beforeSignature).toEqual({ state: "s.off" });
  });

  it("keeps the press's node, written handle, resolved target, signature and the node that sets the state", () => {
    const toggles = new AutomationStudioExploredToggles();
    toggles.explored({ callId: "c1", toolId: "core.run_node", value: PRESS }, answer({ toggle: { signature: { state: "s.on" }, idempotentWith: "domain.demo.set_state" } }));
    expect(toggles.list()).toEqual([{ callId: "c1", node: "domain.demo.press", handles: ["t1"], target: { selector: "#setting" }, signature: { state: "s.on" }, idempotentWith: "domain.demo.set_state" }]);
  });

  it("reads the toggle the web domain writes on the press's own answer", () => {
    const toggles = new AutomationStudioExploredToggles();
    toggles.explored({ toolId: "core.run_node", value: PRESS }, answer(undefined, { evidence: { ok: true, toggle: { signature: { state: "s.on" } } } }));
    expect(toggles.list()).toEqual([{ node: "domain.demo.press", handles: ["t1"], target: { selector: "#setting" }, signature: { state: "s.on" } }]);
  });

  it("keeps nothing for another tool, a refused call, or a toggle answer that is not well formed", () => {
    const toggles = new AutomationStudioExploredToggles();
    const toggle = { toggle: { signature: { state: "s.on" } } };
    toggles.explored({ toolId: "demo.look", value: PRESS }, answer(toggle));
    toggles.explored({ toolId: "core.run_node", value: PRESS }, answer(toggle, { evidence: { ok: false } }));
    toggles.explored({ toolId: "core.run_node", value: PRESS }, answer(undefined));
    toggles.explored({ toolId: "core.run_node", value: PRESS }, answer({ toggle: { signature: {} } }));
    toggles.explored({ toolId: "core.run_node", value: PRESS }, answer({ toggle: { signature: "s.on" } }));
    toggles.explored({ toolId: "core.run_node", value: PRESS }, { looked: true });
    expect(toggles.list()).toEqual([]);
    // A malformed `idempotentWith` is dropped and the toggle kept.
    toggles.explored({ toolId: "core.run_node", value: PRESS }, answer({ toggle: { signature: { state: "s.on" }, idempotentWith: "not a node id" } }));
    expect(toggles.list()).toEqual([{ node: "domain.demo.press", handles: ["t1"], target: { selector: "#setting" }, signature: { state: "s.on" } }]);
  });

  it("is told every call the build's permission wrapper ran", async () => {
    const permissions = automationStudioFlowBootstrapActionPermissions({
      permittedConsequences: ["modify_existing"], instructionIds: [],
      executeTool: async () => answer({ toggle: { signature: { state: "s.on" } } })
    });
    await permissions.executeTool({ callId: "c9", toolId: "core.run_node", value: PRESS });
    expect(permissions.exploredToggles.list()).toMatchObject([{ callId: "c9", node: "domain.demo.press", signature: { state: "s.on" } }]);
  });

  it("writes into a record it is given, so two gates of one build share it, and keeps its own otherwise", async () => {
    const shared = new AutomationStudioExploredToggles();
    const gate = (record?: AutomationStudioExploredToggles) => automationStudioFlowBootstrapActionPermissions({
      permittedConsequences: ["modify_existing"], instructionIds: [], ...(record ? { exploredToggles: record } : {}),
      executeTool: async () => answer({ toggle: { signature: { state: "s.on" } } })
    });
    const first = gate(shared);
    const second = gate(shared);
    await first.executeTool({ callId: "c1", toolId: "core.run_node", value: PRESS });
    expect(second.exploredToggles).toBe(shared);
    expect(second.exploredToggles.list()).toMatchObject([{ callId: "c1" }]);
    expect(gate().exploredToggles.list()).toEqual([]);
  });
});

describe("the explored toggles record from a trial (t787)", () => {
  const attempt = (extra: Record<string, unknown> = {}) => ({
    attemptId: "a1", nodeId: "node.bootstrap.b1.primary.s6", definitionId: "domain.demo.press", startedAt: 0, status: "succeeded",
    inputs: {}, outputs: { toggle: { signature: { state: "s.on" } } }, effects: [], ...extra
  }) as unknown as Parameters<AutomationStudioExploredToggles["trial"]>[0][number];

  it("keeps richer paired evidence after a legacy singleton and deduplicates the whole transition", () => {
    const toggles = new AutomationStudioExploredToggles();
    const signature = { state: "s.on" };
    const beforeSignature = { state: "s.off" };
    toggles.trial([attempt(), attempt({ outputs: { result: { toggle: { signature, beforeSignature } } } }), attempt({ outputs: { toggle: { beforeSignature, signature } } })]);
    expect(toggles.list().map((record) => ({ signature: record.signature, beforeSignature: record.beforeSignature }))).toEqual([
      { signature, beforeSignature: undefined }, { signature, beforeSignature }
    ]);
  });

  it("records the toggle a trial pass's attempt answered, under the trial node, once however many passes", () => {
    const toggles = new AutomationStudioExploredToggles();
    toggles.trial([attempt(), attempt({ attemptId: "a2" }), attempt({ attemptId: "a3", outputs: { result: { toggle: { signature: { state: "s.on" }, idempotentWith: "domain.demo.set_state" } } }, nodeId: "node.bootstrap.b1.primary.s7" })]);
    expect(toggles.list()).toEqual([
      { node: "domain.demo.press", handles: [], trialNodes: ["node.bootstrap.b1.primary.s6"], signature: { state: "s.on" } },
      { node: "domain.demo.press", handles: [], trialNodes: ["node.bootstrap.b1.primary.s7"], signature: { state: "s.on" }, idempotentWith: "domain.demo.set_state" }
    ]);
  });

  // t792: the step a trial press is tied to is known by the parameters its node ran with, never by its key.
  it("keeps the parameters each trial node ran with, Core's ensureState taken off, and none for a node the graph does not show", () => {
    const toggles = new AutomationStudioExploredToggles();
    const graph = { nodes: [
      { id: "node.bootstrap.b1.primary.s6", parameterValues: { target: { selector: "#pin" }, ensureState: { state: "s.on" } } },
      { id: "node.bootstrap.b1.primary.s7" }
    ] };
    toggles.trial([attempt(), attempt({ attemptId: "a2", nodeId: "node.bootstrap.b1.primary.s7" }), attempt({ attemptId: "a3", nodeId: "node.bootstrap.b1.primary.s8" })], graph);
    expect(toggles.list().map((press) => [press.trialNodes, press.trialParameters])).toEqual([
      [["node.bootstrap.b1.primary.s6"], { target: { selector: "#pin" } }],
      [["node.bootstrap.b1.primary.s7"], {}],
      [["node.bootstrap.b1.primary.s8"], undefined]
    ]);
    // The same node id written as another step in a later revision's trial is another press, kept beside the first.
    toggles.trial([attempt()], { nodes: [{ id: "node.bootstrap.b1.primary.s6", parameterValues: { target: { selector: "#star" } } }] });
    expect(toggles.list().filter((press) => press.trialNodes?.[0] === "node.bootstrap.b1.primary.s6").map((press) => press.trialParameters)).toEqual([{ target: { selector: "#pin" } }, { target: { selector: "#star" } }]);
  });

  it("records nothing for a failed or skipped attempt or one with no well-formed toggle answer", () => {
    const toggles = new AutomationStudioExploredToggles();
    toggles.trial([attempt({ status: "failed" }), attempt({ skipped: { reason: "already_in_state", code: "x" } }), attempt({ outputs: {} }), attempt({ outputs: { toggle: { signature: {} } } })]);
    expect(toggles.list()).toEqual([]);
  });
});
