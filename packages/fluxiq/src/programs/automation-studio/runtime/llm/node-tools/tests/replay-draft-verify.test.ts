// A dry run over a draft with a lasting step: that step is checked, every
// other step is run again, in order.
//
// Decision D1 (2026-09-30). Run 21 (`run-muntufao-7b7bc04a`): the dry run
// replayed a save-for-later press twice and moved both of a person's cart
// lines to the saved list. A step that declares a lasting consequence is now
// sent `replay: "verify"` with where it found the page, and the host checks it
// without acting. t193-wH (`run-munri5gr-94d7f8a0`): a store already chosen
// leaves no button to choose it with, and that is its effect being in place,
// not a broken step.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import { automationStudioFlowDraftReplayClearedCode, automationStudioNodeReplayStatus, replayAutomationStudioFlowDraft } from "../index.ts";

const CART = { location: "https://store.test/cart" };
const SAVED = { location: "https://store.test/saved" };

const step = (position: number, node: string, consequences: string[], options: { effect?: "observe" | "mutate"; from?: JsonObject } = {}): AutomationStudioFlowDraftStep => ({
  position,
  iteration: position,
  actionId: node,
  toolId: "core.run_node",
  input: { node, parameters: {}, consequences },
  ranWith: { node, parameters: { selector: `#s${position}` }, consequences },
  effect: options.effect ?? "mutate",
  effectApplied: true,
  disposition: "kept",
  proposes: true,
  replay: { from: options.from ?? CART, ...(options.effect === "observe" ? { produced: { records: 2 } } : {}) }
});

/** Open the cart, save a line for later (which stays on the cart page), read the cart. */
const STAYS = [
  step(1, "node.open_cart", []),
  step(2, "node.save_for_later", ["modify_existing"]),
  step(3, "node.read_cart", [], { effect: "observe" })
];

/** The same, but the save led to the saved list, where the read happens. */
const MOVES = [
  step(1, "node.open_cart", []),
  step(2, "node.save_for_later", ["modify_existing"]),
  step(3, "node.read_saved", [], { effect: "observe", from: SAVED })
];

type Answer = { code: string; effectApplied?: boolean };

/** An executor that records what it was asked for and answers per kind. */
function host(answers: { verify?: Answer; step?: (value: JsonObject) => Answer } = {}) {
  const calls: JsonObject[] = [];
  const executeTool = vi.fn(async ({ value }: { value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    calls.push(value);
    const answered = value.replay === "reset"
      ? { code: "core.replay.replayed", effectApplied: true }
      : value.replay === "verify"
        ? answers.verify ?? { code: "core.replay.verified", effectApplied: false }
        : answers.step?.(value) ?? { code: "core.replay.replayed", effectApplied: true };
    return { kind: "llm_evidence_tool_execution", evidence: { said: answered.code }, effectApplied: answered.effectApplied ?? false, resultCode: answered.code };
  });
  return { calls, executeTool };
}

const replay = (steps: AutomationStudioFlowDraftStep[], executeTool: ReturnType<typeof host>["executeTool"]) =>
  replayAutomationStudioFlowDraft({ steps, attempt: 1, maxEvidenceBytes: 10_000, executeTool });

const readFails = (node: string) => (value: JsonObject): Answer => (value.node === node ? { code: "core.replay.changed" } : { code: "core.replay.replayed", effectApplied: true });

describe("a dry run over a draft with a lasting step", () => {
  it("sends verify for the lasting step, with where it found the page, and replay for the rest, in order", async () => {
    const { calls, executeTool } = host();
    const replayed = await replay(STAYS, executeTool);
    expect(calls.map((value) => value.replay)).toEqual(["reset", "step", "verify", "step"]);
    expect(calls[2]).toEqual({ node: "node.save_for_later", parameters: { selector: "#s2" }, consequences: ["modify_existing"], replay: "verify", from: CART });
    expect(replayed.verdict.ok).toBe(true);
    expect(replayed.verdict.outcomes.map((outcome) => [outcome.step, outcome.status, outcome.mode ?? "replay"])).toEqual([
      [1, "replayed", "replay"], [2, "replayed", "verify"], [3, "replayed", "replay"]
    ]);
    expect(replayed.verdict.outcomes[1]?.resultCode).toBe("core.replay.verified");
  });

  it("refuses a lasting step whose target the host could not verify, or that is gone from another page", async () => {
    for (const code of ["core.replay.failed", "core.replay.unreproducible"]) {
      const { executeTool } = host({ verify: { code } });
      const replayed = await replay(STAYS, executeTool);
      expect(replayed.verdict.ok, code).toBe(false);
      expect(replayed.verdict.outcomes[1], code).toMatchObject({ status: code.split(".").pop(), mode: "verify" });
    }
  });

  it("passes a lasting step whose effect is already in place, and withholds nothing from the steps after it", async () => {
    const { executeTool } = host({ verify: { code: "core.replay.present" }, step: readFails("node.read_saved") });
    const replayed = await replay(MOVES, executeTool);
    expect(replayed.verdict.outcomes[1]).toMatchObject({ status: "replayed", mode: "verify", resultCode: "core.replay.present" });
    // The effect was there, so the read after it has failed on its own account.
    expect(replayed.verdict.outcomes[2]?.withheldBy).toBeUndefined();
    expect(replayed.verdict.ok).toBe(false);
  });

  it("does not refuse a later step for a withheld move, and says so", async () => {
    const { executeTool } = host({ step: readFails("node.read_saved") });
    const replayed = await replay(MOVES, executeTool);
    expect(replayed.verdict.ok).toBe(true);
    expect(replayed.verdict.outcomes[2]).toMatchObject({ status: "changed", withheldBy: 2 });
  });

  it("excuses nothing after a verified step that did not move the target: the site already holds its effect", async () => {
    const { executeTool } = host({ step: readFails("node.read_cart") });
    const replayed = await replay(STAYS, executeTool);
    expect(replayed.verdict.ok).toBe(false);
    expect(replayed.verdict.outcomes[2]?.withheldBy).toBeUndefined();
  });

  it("reads a check's passing answers as a pass only for a check", () => {
    expect(automationStudioNodeReplayStatus("core.replay.verified", "verify")).toBe("replayed");
    expect(automationStudioNodeReplayStatus("core.replay.present", "verify")).toBe("replayed");
    expect(automationStudioNodeReplayStatus("core.replay.verified")).toBe("failed");
    expect(automationStudioNodeReplayStatus("core.replay.present", "replay")).toBe("failed");
  });

  it("answers a check a person cleared as verified, not replayed", () => {
    expect(automationStudioFlowDraftReplayClearedCode({ replay: "verify" })).toBe("core.replay.verified");
    expect(automationStudioFlowDraftReplayClearedCode({ replay: "step" })).toBe("core.replay.replayed");
  });
});

describe("the loop's gate over a lasting step", () => {
  it("never replays the lasting press, and shows the verdict as verified", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "c1", toolId: "core.run_node", input: { node: "node.broken", parameters: {}, consequences: [] } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "c2", toolId: "core.run_node", input: { node: "node.save_for_later", parameters: {}, consequences: ["modify_existing"] } })
      .mockResolvedValue({ kind: "complete", result: { summary: "done" } });
    const dispatched: string[] = [];
    const shown = new Map<string, JsonObject>();
    const executeTool = vi.fn(async ({ callId, value }: { callId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
      if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
      if (value.replay === "verify") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, resultCode: "core.replay.verified" };
      if (value.replay === "step") {
        dispatched.push(String(value.node));
        // The first dry run fails the step before the lasting one, so its
        // refusal is shown and a reader can see the lasting step beside it.
        const failed = callId.startsWith("dryrun.1.");
        return { kind: "llm_evidence_tool_execution", evidence: { page: "after" }, effectApplied: !failed, resultCode: failed ? "core.replay.failed" : "core.replay.replayed" };
      }
      dispatched.push(`explore:${String(value.node)}`);
      const node = String(value.node);
      return {
        kind: "llm_evidence_tool_execution",
        evidence: { page: "start" },
        effectApplied: true,
        draft: { actionId: node, input: value, ranWith: { node, parameters: { selector: `#${node}` }, consequences: value.consequences as string[] }, effect: "mutate", proposes: true, replay: { from: CART } }
      };
    });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [{ toolId: "core.run_node", description: "Run a node.", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true }],
      decide: vi.fn(async (request: { evidence: ReadonlyArray<{ callId: string; toolId: string; value: unknown }> }) => {
        for (const entry of request.evidence) if (entry.toolId === "core.dry_run") shown.set(entry.callId, entry.value as JsonObject);
        return decide(request);
      }),
      executeTool, maxIterations: 8, maxToolCalls: 8, minToolCalls: 1,
      unusableDecisions: { maxConsecutive: 4, stalled: () => new Error("stalled") }
    });
    // The save ran once, while exploring, and never again.
    expect(dispatched.filter((entry) => entry.includes("save_for_later"))).toEqual(["explore:node.save_for_later"]);
    expect(result.ok).toBe(true);
    expect(result.steps[1]?.replayed).toMatchObject({ mode: "verify", resultCode: "core.replay.verified" });
    const first = shown.get("core.dry_run.1");
    expect(first).toBeDefined();
    const lines = (first!.steps as JsonObject[]).map((entry) => [entry.actionId, entry.replayed]);
    expect(lines).toEqual([["node.broken", "failed"], ["node.save_for_later", "verified"]]);
    expect(executeTool.mock.calls.map(([call]) => call.value.replay)).toEqual([undefined, undefined, "reset", "step", "verify", "reset", "step", "verify"]);
  });
});
