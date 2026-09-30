// The dry-run gate replays a draft once per version of it (lane t195, run
// `run-muntu7in-e3dd1972`: one unchanged draft completed fourteen times, 401 of
// the build's 537 seconds spent replaying it, and the build ran out of time).
import { describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES } from "../replay.ts";
import { automationStudioFlowDraftDryRunGate } from "../dry-run-gate.ts";

function step(position: number, target: string): AutomationStudioFlowDraftStep {
  return {
    position,
    id: `d${position}`,
    iteration: position,
    callId: `call.${position}`,
    actionId: "web.output.dom-click",
    toolId: "core.run_node",
    input: { node: "web.output.dom-click", parameters: { target } },
    ranWith: { node: "web.output.dom-click", parameters: { target } },
    replay: { from: { url: "https://shop.test/" } },
    effect: "mutate",
    effectApplied: true,
    disposition: "kept"
  } as AutomationStudioFlowDraftStep;
}

/** A page on which the step pressing `#gone` no longer replays, as a Confirm already pressed does not. */
function gate(steps: AutomationStudioFlowDraftStep[]) {
  const executeTool = vi.fn(async ({ value }: { value: JsonObject }): Promise<JsonValue> => {
    const resultCode = value.replay === "reset"
      ? AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.replayed
      : (value.parameters as { target?: string } | undefined)?.target === "#gone" ? AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.failed : AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.replayed;
    return { kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: true, resultCode } as unknown as JsonValue;
  });
  const shown: string[] = [];
  const targetMoved = vi.fn();
  const dryRun = automationStudioFlowDraftDryRunGate({
    enabled: true,
    steps,
    executeTool,
    accountEvidence: () => 1,
    showEvidence: (entry) => shown.push(entry.callId),
    targetMoved
  });
  return { dryRun, executeTool, shown, targetMoved };
}

describe("the dry run of a draft completed again unchanged", () => {
  it("is replayed twice, then refused from what those replays found without a third", async () => {
    const steps = [step(1, "#open"), step(2, "#gone")];
    const run = gate(steps);

    const first = await run.dryRun();
    const second = await run.dryRun();
    expect(run.executeTool).toHaveBeenCalledTimes(6);
    const third = await run.dryRun();
    const fourth = await run.dryRun();

    expect(first).toMatchObject({ issueCodes: expect.arrayContaining(["core.replay.failed"]) });
    expect([second, third, fourth]).toEqual([first, first, first]);
    expect(run.executeTool).toHaveBeenCalledTimes(6);
    expect(run.targetMoved).toHaveBeenCalledTimes(2);
    expect(run.shown.at(-1)).toMatch(/\.again$/u);
  });

  it("is judged again, not replayed, when a routing word makes the failing step one the Flow does not always run", async () => {
    const steps = [step(1, "#open"), step(2, "#gone")];
    const run = gate(steps);
    await run.dryRun();
    await run.dryRun();

    steps[1]!.routing = { kind: "optional" };
    expect(await run.dryRun()).toBeUndefined();
    expect(run.executeTool).toHaveBeenCalledTimes(6);
  });

  it("is replayed again once the steps themselves change", async () => {
    const steps = [step(1, "#open"), step(2, "#gone")];
    const run = gate(steps);
    await run.dryRun();

    steps[1] = step(2, "#there");
    expect(await run.dryRun()).toBeUndefined();
    expect(run.executeTool).toHaveBeenCalledTimes(6);
  });
});
