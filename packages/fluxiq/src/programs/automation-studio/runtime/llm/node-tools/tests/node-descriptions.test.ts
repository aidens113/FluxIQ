// One build's described-node memory: the ids an evidence decision is shown in
// full, in the order they were first described, each once (t235).

import { describe, expect, it, vi } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { automationStudioActionPermissionDenied } from "../../../action-permissions/index.ts";
import type { AutomationStudioHarnessOptionImplementation } from "../../harness-options/index.ts";
import { automationStudioLlmRunNodeDescribingFailures } from "../describing-failures.ts";
import { automationStudioLlmNodeDescriptions } from "../node-descriptions.ts";

const resolution = { scope: { kind: "global" as const } };

describe("the described-node memory", () => {
  it("starts empty and keeps first-described order, each node once", () => {
    const memory = automationStudioLlmNodeDescriptions({ resolution });
    expect(memory.ids()).toEqual([]);
    expect(memory.describe(["builtin.logic.or", "builtin.logic.and", "builtin.logic.or"])).toEqual({ described: ["builtin.logic.or", "builtin.logic.and"], alreadyDescribed: [], unknown: [] });
    expect(memory.describe(["builtin.logic.and", "builtin.logic.not"])).toEqual({ described: ["builtin.logic.not"], alreadyDescribed: ["builtin.logic.and"], unknown: [] });
    expect(memory.ids()).toEqual(["builtin.logic.or", "builtin.logic.and", "builtin.logic.not"]);
  });

  it("names an id the catalog does not hold as unknown and never remembers it", () => {
    const memory = automationStudioLlmNodeDescriptions({ resolution });
    expect(memory.describe(["web.output.nowhere", "builtin.logic.and"])).toEqual({ described: ["builtin.logic.and"], alreadyDescribed: [], unknown: ["web.output.nowhere"] });
    expect(memory.ids()).toEqual(["builtin.logic.and"]);
    expect(memory.has("web.output.nowhere")).toBe(false);
    expect(memory.definition("web.output.nowhere")).toBeUndefined();
  });

  it("gives the catalog's own entry for a node, described or not", () => {
    const memory = automationStudioLlmNodeDescriptions({ resolution });
    const entry = memory.definition("builtin.logic.and");
    expect(entry?.id).toBe("builtin.logic.and");
    expect(entry?.parameters.map((parameter) => parameter.id)).toEqual(["emptyBehavior"]);
    expect(memory.has("builtin.logic.and")).toBe(false);
  });

  it("builds the catalog once, on first use, not when the memory is made", () => {
    const registry = new AutomationStudioNodeRegistry();
    const list = vi.spyOn(registry, "list");
    const memory = automationStudioLlmNodeDescriptions({ registry, resolution });
    expect(list).not.toHaveBeenCalled();
    memory.describe(["builtin.logic.and"]);
    memory.describe(["builtin.logic.or"]);
    memory.definition("builtin.logic.not");
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("is per build: a second memory starts empty", () => {
    const first = automationStudioLlmNodeDescriptions({ resolution });
    first.describe(["builtin.logic.and"]);
    expect(automationStudioLlmNodeDescriptions({ resolution }).ids()).toEqual([]);
  });
});

// t280: a node's definition reaches the model without the model asking. Across
// 23 live runs `core.describe_nodes` was called in 2; lane D ran the list read
// 10-16 times per build without its definition (`run-mux6nxst-c9bca37c`,
// `run-muwao5n4-44977b2a`), because only a call that failed described its node.
// Every run the model makes now describes its node, at no cost of a decision.
// t289-G (W11): the call that first describes a node names it under
// `describedNodes` on its own result, where the request shows its definition,
// so a describe never changes the request in front of the evidence window.
describe("a node the model runs is described by running it", () => {
  const AND = "builtin.logic.and";
  function wrapped(answer: Awaited<ReturnType<AutomationStudioHarnessOptionImplementation>>) {
    const memory = automationStudioLlmNodeDescriptions({ resolution });
    const implementation = vi.fn<AutomationStudioHarnessOptionImplementation>(async () => answer);
    const call = automationStudioLlmRunNodeDescribingFailures(implementation, memory);
    const run = (value: Record<string, unknown>) => call({
      projectId: "p.1", flowId: "f.1", callId: "c.1", optionId: "core.run_node", value: value as never, permission: automationStudioActionPermissionDenied
    });
    return { memory, implementation, run };
  }

  it("names a first, successful run's node on its result, and leaves every later run of it untouched", async () => {
    const answer = { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, rows: 2 }, effectApplied: false };
    const { memory, implementation, run } = wrapped(answer);
    expect(await run({ node: AND, parameters: { emptyBehavior: "true" }, consequences: [] })).toEqual({ ...answer, evidence: { ok: true, rows: 2, describedNodes: [AND] } });
    expect(answer.evidence).toEqual({ ok: true, rows: 2 });
    expect(implementation).toHaveBeenCalledTimes(1);
    expect(memory.ids()).toEqual([AND]);
    // A second run adds nothing: each node once, in the order first run.
    expect(await run({ node: "builtin.logic.or", parameters: {}, consequences: [] })).toEqual({ ...answer, evidence: { ok: true, rows: 2, describedNodes: ["builtin.logic.or"] } });
    expect(await run({ node: AND, parameters: {}, consequences: [] })).toBe(answer);
    expect(memory.ids()).toEqual([AND, "builtin.logic.or"]);
  });

  it("describes nothing when the result cannot name it, so the head never gains a node mid-build", async () => {
    // A result that is not an object, or one whose domain already wrote the key.
    for (const answer of [["a", "list"], { ok: true, describedNodes: "the domain's own" }]) {
      const { memory, run } = wrapped(answer as never);
      expect(await run({ node: AND, parameters: {}, consequences: [] })).toBe(answer);
      expect(memory.ids()).toEqual([]);
    }
  });

  it("describes nothing for a call that threw, and still throws: its next run describes it", async () => {
    const memory = automationStudioLlmNodeDescriptions({ resolution });
    let fail = true;
    const call = automationStudioLlmRunNodeDescribingFailures(async () => {
      if (fail) throw new Error("page gone");
      return { ok: true };
    }, memory);
    const run = () => call({ projectId: "p.1", flowId: "f.1", callId: "c.1", optionId: "core.run_node", value: { node: AND, parameters: {}, consequences: [] } as never, permission: automationStudioActionPermissionDenied });
    await expect(run()).rejects.toThrow("page gone");
    expect(memory.ids()).toEqual([]);
    fail = false;
    expect(await run()).toEqual({ ok: true, describedNodes: [AND] });
    expect(memory.ids()).toEqual([AND]);
  });

  it("describes a written step's node too, since writing it is using it", async () => {
    const { memory, run } = wrapped({ ok: true, code: "core.run_node.written" });
    await run({ node: AND, parameters: {}, consequences: [], write: true });
    expect(memory.ids()).toEqual([AND]);
  });

  it("names a refused first run's node on its result, and points a later refusal at the definition", async () => {
    const { memory, run } = wrapped({ ok: false, code: "node_failed" });
    expect(await run({ node: AND, parameters: { selector: "#go" }, consequences: [] })).toEqual({
      ok: false, code: "node_failed", describedNodes: [AND], undeclaredParameters: ["selector"]
    });
    expect(memory.ids()).toEqual([AND]);
    expect(await run({ node: AND, parameters: { selector: "#go" }, consequences: [] })).toEqual({
      ok: false, code: "node_failed", definition: `${AND} is under describedNodes, earlier in this request`, undeclaredParameters: ["selector"]
    });
  });

  it("leaves the loop's own replays and unknown nodes out", async () => {
    const { memory, run } = wrapped({ ok: true });
    await run({ node: AND, parameters: {}, consequences: [], replay: "verify" });
    await run({ node: "web.output.nowhere", parameters: {}, consequences: [] });
    expect(memory.ids()).toEqual([]);
  });
});
