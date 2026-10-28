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
});
