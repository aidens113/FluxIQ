// Layering of a declaration and a run's overrides, and the digests.
import { describe, expect, it } from "vitest";
import { resolveFluxNodeOverrides, type FluxNodeOverrides } from "../index.ts";

const declared: FluxNodeOverrides = {
  prompts: { "core.efficiency": { mode: "append", text: "A" }, "judge.question": { mode: "replace", text: "Q" }, "core.list_authoring": { mode: "append", text: "L" } },
  judgeCriteria: ["one", "two"],
  tools: { "core.run_flow": { mode: "replace", text: "F" }, "web.screenshot": { mode: "append", text: "S" } },
  models: { explore: "m-explore", judge: "m-judge" },
  deadlines: { llmCallMs: 20_000, personWaitMs: 5_000, modelSilence: { baseMs: 2_000, capMs: 30_000 } },
  retryWaits: { backoffMs: [100], perNodeMs: 1_000 },
  pace: { minStepGapMs: 100 }
};

describe("resolveFluxNodeOverrides", () => {
  it("resolves nothing to empty groups", async () => {
    const { overrides } = await resolveFluxNodeOverrides(undefined, undefined);
    expect(overrides).toEqual({ prompts: {}, judgeCriteria: [], tools: {}, models: {}, deadlines: {}, retryWaits: {}, pace: {} });
  });

  it("lets a run's prompt and tool entry replace the declared one whole, and default drops it", async () => {
    const { overrides } = await resolveFluxNodeOverrides(declared, {
      prompts: { "core.efficiency": { mode: "replace", text: "R" }, "judge.question": { mode: "default" }, "core.decision_output": { mode: "append", text: "D" } },
      tools: { "core.run_flow": { mode: "default" }, "web.screenshot": { mode: "append", text: "S2" } }
    });
    expect(overrides.prompts).toEqual({ "core.efficiency": { mode: "replace", text: "R" }, "core.list_authoring": { mode: "append", text: "L" }, "core.decision_output": { mode: "append", text: "D" } });
    expect(overrides.tools).toEqual({ "web.screenshot": { mode: "append", text: "S2" } });
  });

  it("replaces judge criteria as an array, and [] clears them", async () => {
    expect((await resolveFluxNodeOverrides(declared, { judgeCriteria: ["x"] })).overrides.judgeCriteria).toEqual(["x"]);
    expect((await resolveFluxNodeOverrides(declared, { judgeCriteria: [] })).overrides.judgeCriteria).toEqual([]);
    expect((await resolveFluxNodeOverrides(declared, {})).overrides.judgeCriteria).toEqual(["one", "two"]);
  });

  it("merges models, deadlines, retry waits and pace leaf by leaf", async () => {
    const { overrides } = await resolveFluxNodeOverrides(declared, {
      models: { judge: "m2", repair: "m-repair" },
      deadlines: { llmCallMs: 10_000, modelSilence: { capMs: 9_000 } },
      retryWaits: { perRunMs: 7 },
      pace: {}
    });
    expect(overrides.models).toEqual({ explore: "m-explore", judge: "m2", repair: "m-repair" });
    expect(overrides.deadlines).toEqual({ llmCallMs: 10_000, personWaitMs: 5_000, modelSilence: { baseMs: 2_000, capMs: 9_000 } });
    expect(overrides.retryWaits).toEqual({ backoffMs: [100], perNodeMs: 1_000, perRunMs: 7 });
    expect(overrides.pace).toEqual({ minStepGapMs: 100 });
  });

  it("gives a stable digest, however keys are ordered, and a different one when anything changes", async () => {
    const a = await resolveFluxNodeOverrides(declared, undefined);
    expect(a.digest).toMatch(/^[a-f0-9]{64}$/u);
    const reordered: FluxNodeOverrides = { pace: declared.pace, tools: declared.tools, judgeCriteria: declared.judgeCriteria, prompts: declared.prompts, models: declared.models, deadlines: declared.deadlines, retryWaits: declared.retryWaits };
    expect((await resolveFluxNodeOverrides(reordered, undefined)).digest).toBe(a.digest);
    expect((await resolveFluxNodeOverrides(declared, { pace: { minStepGapMs: 101 } })).digest).not.toBe(a.digest);
  });

  it("makes the judge digest follow only judge sections and criteria", async () => {
    const a = await resolveFluxNodeOverrides(declared, undefined);
    const other = await resolveFluxNodeOverrides(declared, { pace: { minStepGapMs: 999 }, prompts: { "core.efficiency": { mode: "append", text: "changed" } } });
    expect(other.judgeDigest).toBe(a.judgeDigest);
    expect(other.digest).not.toBe(a.digest);
    expect((await resolveFluxNodeOverrides(declared, { judgeCriteria: ["new"] })).judgeDigest).not.toBe(a.judgeDigest);
    expect((await resolveFluxNodeOverrides(declared, { prompts: { "judge.question": { mode: "append", text: "z" } } })).judgeDigest).not.toBe(a.judgeDigest);
  });
});
