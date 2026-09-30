// A dry run over a draft with a lasting step: that step is verified, every
// other step is run again, in order.
//
// Decision D1 (t174, 2026-09-30). Run 21 (`run-muntufao-7b7bc04a`): the dry
// run replayed a save-for-later press twice and moved both of a person's cart
// lines to the saved list. A step that declares a lasting consequence is now
// sent `replay: "verify"`, and the host checks it without acting.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import { automationStudioFlowDraftReplayClearedCode, replayAutomationStudioFlowDraft } from "../index.ts";

const FROM = { location: "https://store.test/cart" };

const step = (position: number, node: string, consequences: string[], effect: "observe" | "mutate" = "mutate"): AutomationStudioFlowDraftStep => ({
  position,
  iteration: position,
  actionId: node,
  toolId: "core.run_node",
  input: { node, parameters: {}, consequences },
  ranWith: { node, parameters: { selector: `#s${position}` }, consequences },
  effect,
  effectApplied: true,
  disposition: "kept",
  proposes: true,
  replay: { from: FROM, ...(effect === "observe" ? { produced: { records: 2 } } : {}) }
});

const DRAFT = [
  step(1, "node.open_cart", []),
  step(2, "node.save_for_later", ["modify_existing"]),
  step(3, "node.read_saved", [], "observe")
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

describe("a dry run over a draft with a lasting step", () => {
  it("sends verify for the lasting step and replay for the rest, in order", async () => {
    const { calls, executeTool } = host();
    const replay = await replayAutomationStudioFlowDraft({ steps: DRAFT, attempt: 1, asked: new Set(), maxEvidenceBytes: 10_000, executeTool });
    expect(calls.map((value) => value.replay)).toEqual(["reset", "step", "verify", "step"]);
    // The verify carries what the Flow runs the step with, so the host can
    // resolve the same target, and the declaration it was chosen for.
    expect(calls[2]).toEqual({ node: "node.save_for_later", parameters: { selector: "#s2" }, consequences: ["modify_existing"], replay: "verify" });
    expect(replay.verdict.ok).toBe(true);
    expect(replay.verdict.outcomes.map((outcome) => [outcome.step, outcome.status, outcome.mode ?? "replay"])).toEqual([
      [1, "replayed", "replay"], [2, "replayed", "verify"], [3, "replayed", "replay"]
    ]);
    expect(replay.verdict.outcomes[1]?.resultCode).toBe("core.replay.verified");
  });

  it("refuses a lasting step whose target the host could not verify", async () => {
    const { executeTool } = host({ verify: { code: "core.replay.failed" } });
    const replay = await replayAutomationStudioFlowDraft({ steps: DRAFT, attempt: 1, asked: new Set(), maxEvidenceBytes: 10_000, executeTool });
    expect(replay.verdict.ok).toBe(false);
    expect(replay.verdict.outcomes[1]).toMatchObject({ status: "failed", mode: "verify" });
  });

  it("does not refuse a later step for the effect it withheld, and says so", async () => {
    const { executeTool } = host({ step: (value) => (value.node === "node.read_saved" ? { code: "core.replay.changed" } : { code: "core.replay.replayed", effectApplied: true }) });
    const replay = await replayAutomationStudioFlowDraft({ steps: DRAFT, attempt: 1, asked: new Set(), maxEvidenceBytes: 10_000, executeTool });
    expect(replay.verdict.ok).toBe(true);
    expect(replay.verdict.outcomes[2]).toMatchObject({ status: "changed", withheldBy: 2 });
  });

  it("judges later steps as usual when the lasting step's effect was already there", async () => {
    // A target that is gone after the reset is what an effect the site already
    // holds looks like -- the line was saved while exploring. Nothing was
    // withheld, so a later step that fails has failed.
    const { executeTool } = host({
      verify: { code: "core.replay.unreproducible" },
      step: (value) => (value.node === "node.read_saved" ? { code: "core.replay.changed" } : { code: "core.replay.replayed", effectApplied: true })
    });
    const replay = await replayAutomationStudioFlowDraft({ steps: DRAFT, attempt: 1, asked: new Set(["2:node.save_for_later"]), maxEvidenceBytes: 10_000, executeTool });
    expect(replay.verdict.ok).toBe(false);
    expect(replay.verdict.outcomes[2]?.withheldBy).toBeUndefined();
  });

  it("answers a verify a person cleared as verified, not replayed", () => {
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
        // refusal is shown and a reader can see the lasting step beside it,
        // verified. (A step failing *after* a verified one would not refuse.)
        const failed = callId.startsWith("dryrun.1.");
        return { kind: "llm_evidence_tool_execution", evidence: { page: "after" }, effectApplied: !failed, resultCode: failed ? "core.replay.failed" : "core.replay.replayed" };
      }
      dispatched.push(`explore:${String(value.node)}`);
      const node = String(value.node);
      return {
        kind: "llm_evidence_tool_execution",
        evidence: { page: "start" },
        effectApplied: true,
        draft: { actionId: node, input: value, ranWith: { node, parameters: { selector: `#${node}` }, consequences: value.consequences as string[] }, effect: "mutate", proposes: true, replay: { from: FROM } }
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
    const steps = (first!.steps as JsonObject[]).map((entry) => [entry.actionId, entry.replayed]);
    expect(steps).toEqual([["node.broken", "failed"], ["node.save_for_later", "verified"]]);
    expect(executeTool.mock.calls.map(([call]) => call.value.replay)).toEqual([undefined, undefined, "reset", "step", "verify", "reset", "step", "verify"]);
  });
});
