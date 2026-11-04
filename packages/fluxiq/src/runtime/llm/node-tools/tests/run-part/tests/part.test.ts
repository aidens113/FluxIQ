// Covers runtime/llm/node-tools/run/part.ts: the tool as the loop offers it, and its one
// path to the runner, the gate and the ledger.
import { describe, expect, it, vi } from "vitest";
import { automationStudioFlowBootstrapActionPermissions } from "../../../../../flow-authoring/bootstrap/index.ts";
import type { AutomationStudioSiteResetCalls, AutomationStudioSiteResetExplored } from "../../../../../flow-authoring/bootstrap/site-reset/index.ts";
import { AutomationStudioHarnessOptionRegistry } from "../../../../harness-options/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID, automationStudioLlmRunPartBundle, type AutomationStudioLlmRunPartAnswer, type AutomationStudioLlmRunPartPort } from "../../../run/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";

type Act = { step: number };
const RAN: AutomationStudioLlmRunPartAnswer<Act> = { runId: "run.1", status: "succeeded", outputs: { found: 3 }, classes: [], landed: [], partId: "part.a", version: 2 };

function harness(run: AutomationStudioLlmRunPartPort<Act>["run"]) {
  const done = new Set<string>();
  const landed = vi.fn();
  const bundle = automationStudioLlmRunPartBundle({ port: { run, landed }, done });
  const call = bundle.implementations[AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID]!;
  const permission = vi.fn(async () => ({ permitted: true as const }));
  const send = async (value: Record<string, unknown>) => await call({ projectId: "p", flowId: "f", callId: "c", optionId: AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID, value: value as JsonObject, permission }) as AutomationStudioLlmEvidenceToolExecutionResult;
  return { bundle, send, landed, permission, done };
}

describe("core.run_part", () => {
  it("is offered through the harness registry as a tool that can act", () => {
    const { bundle } = harness(async () => RAN);
    const registry = new AutomationStudioHarnessOptionRegistry();
    registry.register(bundle);
    const loop = registry.evidenceLoopBinding({ projectId: "p", flowId: "f" }, { scope: { kind: "global" }, runtimeCapabilities: [], permissions: [], allowSideEffectsWithoutPolicy: true });
    expect(loop.tools.find((tool) => tool.toolId === AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID)).toMatchObject({ effect: "mutate" });
  });

  it("describes itself in generic words, under the length a provider accepts", () => {
    const { bundle } = harness(async () => RAN);
    const { description } = bundle.options[0]!;
    expect(description.length).toBeLessThan(1500);
    expect(description).not.toMatch(/cart|job|photo|shop|store|product|flight|post|listing|market/iu);
  });

  it("hands the model what the part handed back and where it stopped, never its steps", async () => {
    const { send } = harness(async () => ({ ...RAN, status: "stopped", stoppedAt: { stepLabel: "Dom click", reason: "The page changed." }, outputs: {} }));
    const result = await send({ partId: "part.a" });
    expect(result.evidence).toEqual({ ok: false, status: "stopped", outputs: {}, acts: [], stoppedAt: { step: "Dom click", reason: "The page changed." } });
    expect(result.resultCode).toBe("core.run_part.stopped");
  });

  it("answers a refusal as an ordinary answer that says nothing happened", async () => {
    const { send, landed } = harness(async () => ({ refused: "part.not_at_start", message: "The page is not where this part starts." }));
    expect(await send({ partId: "part.a" })).toEqual({
      kind: "llm_evidence_tool_execution",
      evidence: { ok: false, code: "part.not_at_start", instruction: "The page is not where this part starts." },
      effectApplied: false, targetsUnchanged: true, resultCode: "part.not_at_start"
    });
    expect(landed).not.toHaveBeenCalled();
  });

  it.each([
    [{}], [{ partId: "" }], [{ partId: 3 }], [{ partId: "part.a", version: 0 }], [{ partId: "part.a", version: 1.5 }], [{ partId: "part.a", inputs: [] }], [{ partId: "part.a", extra: true }]
  ])("refuses an argument it cannot read, with nothing run: %j", async (value) => {
    const run = vi.fn(async () => RAN);
    const { send } = harness(run);
    expect((await send(value)).resultCode).toBe("part.input_invalid");
    expect(run).not.toHaveBeenCalled();
  });

  it("passes the loop's own permission check to the runner, with exactly what the model asked", async () => {
    const run = vi.fn<AutomationStudioLlmRunPartPort<Act>["run"]>(async () => RAN);
    const { send, permission } = harness(run);
    await send({ partId: "part.a", version: 2, inputs: { query: "shoes" } });
    expect(run.mock.calls[0]![0]).toMatchObject({ projectId: "p", partId: "part.a", version: 2, inputs: { query: "shoes" } });
    expect(run.mock.calls[0]![0].permission).toBe(permission);
  });

  it("gives the build's ledger each act that landed, and refuses the same run a second time", async () => {
    const acts: Act[] = [{ step: 1 }, { step: 2 }];
    const run = vi.fn<AutomationStudioLlmRunPartPort<Act>["run"]>(async (input) => input.repeated({ partId: "part.a", version: 2 })
      ? { refused: "part.repeat_refused", message: "Already done in this build." }
      : { ...RAN, classes: ["create_new"], landed: acts });
    const { send, landed } = harness(run);
    expect((await send({ partId: "part.a", inputs: { a: 1, b: 2 } })).evidence).toMatchObject({ ok: true, acts: ["create_new"] });
    expect(landed).toHaveBeenCalledTimes(1);
    expect(landed).toHaveBeenCalledWith(acts, "run.1");
    expect((await send({ partId: "part.a", inputs: { b: 2, a: 1 } })).resultCode).toBe("part.repeat_refused");
    expect(landed).toHaveBeenCalledTimes(1);
    // Other values are another run: nothing says they repeat anything.
    expect((await send({ partId: "part.a", inputs: { a: 9, b: 2 } })).resultCode).toBe("core.run_part.ran");
  });

  it("does not count a run that landed nothing as done", async () => {
    const run = vi.fn<AutomationStudioLlmRunPartPort<Act>["run"]>(async (input) => input.repeated({ partId: "part.a", version: 2 }) ? { refused: "part.repeat_refused", message: "" } : RAN);
    const { send } = harness(run);
    await send({ partId: "part.a" });
    expect((await send({ partId: "part.a" })).resultCode).toBe("core.run_part.ran");
  });

  it("through the build's real gate: a lasting step is put to it, and the ledger is not told the call was an act of its own", async () => {
    const explored: AutomationStudioSiteResetExplored[] = [];
    const siteReset = {
      claim: () => ({ kind: "none" }),
      target: () => ({ kind: "admit", allowed: [], on: {} }),
      explored: (call: AutomationStudioSiteResetExplored) => { explored.push(call); }
    } as unknown as AutomationStudioSiteResetCalls;
    const seen: unknown[] = [];
    const acts: Act[] = [{ step: 1 }];
    const run = vi.fn<AutomationStudioLlmRunPartPort<Act>["run"]>(async (input) => {
      seen.push(await input.permission({ consequences: ["move_money"], control: { name: "a step" }, verb: "run", effect: "mutate" }));
      seen.push(await input.permission({ consequences: ["create_new"], control: { name: "a step" }, verb: "run", effect: "mutate" }));
      return { ...RAN, classes: ["create_new"], landed: acts };
    });
    const { bundle, landed } = harness(run);
    const implementation = bundle.implementations[AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID]!;
    const gate = automationStudioFlowBootstrapActionPermissions({
      permittedConsequences: ["create_new"], instructionIds: [], siteReset,
      executeTool: async (call) => await implementation({ projectId: "p", flowId: "f", optionId: call.toolId, callId: call.callId, value: call.value, permission: call.permission! })
    });
    const answer = await gate.executeTool({ callId: "c", toolId: AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID, value: { partId: "part.a" } });
    expect((answer as AutomationStudioLlmEvidenceToolExecutionResult).resultCode).toBe("core.run_part.ran");
    expect(seen).toEqual([{ permitted: false, missing: ["move_money"], requestId: expect.any(String) }, { permitted: true }]);
    expect(landed).toHaveBeenCalledTimes(1);
    expect(landed).toHaveBeenCalledWith(acts, "run.1");
    expect(explored).toHaveLength(1);
    expect(explored[0]).toMatchObject({ toolId: AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID, landed: true, declared: { effect: "observe", consequences: [] } });
  });
});
