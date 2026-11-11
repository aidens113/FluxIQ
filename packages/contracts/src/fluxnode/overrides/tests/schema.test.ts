// The overrides schema: what it accepts and every named refusal.
import { describe, expect, it } from "vitest";
import { FLUXNODE_CORE_TOOL_POLICIES, FLUXNODE_PROMPT_SECTIONS, fluxNodeOverridesSchema } from "../index.ts";

function codes(value: unknown): string[] {
  const parsed = fluxNodeOverridesSchema.safeParse(value);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => {
    const code = issue.code === "custom" && typeof issue.params?.["code"] === "string" ? issue.params["code"] : issue.code;
    return `${issue.path.length === 0 ? "" : `/${issue.path.join("/")}`} ${code}`;
  });
}

describe("fluxNodeOverridesSchema", () => {
  it("accepts every group, and nothing at all", () => {
    expect(codes({})).toEqual([]);
    expect(
      codes({
        prompts: { "core.efficiency": { mode: "replace", text: "Be brief." }, "domain.instructions": { mode: "append", text: "Never reload." }, "judge.question": { mode: "default" } },
        judgeCriteria: ["Every row has a price."],
        tools: { "core.run_flow": { mode: "replace", text: "Runs forward." }, "core.run_node": { mode: "append", text: "Careful." }, "web.screenshot": { mode: "append", text: "Only when asked." } },
        models: { explore: "claude-haiku-5-5", judge: "claude-sonnet-5-5" },
        deadlines: { llmCallMs: 30_000, judgeMs: 60_000, personWaitMs: 60_000, modelSilence: { baseMs: 2_000, capMs: 30_000 } },
        retryWaits: { backoffMs: [100, 500], perNodeMs: 10_000, perRunMs: 60_000 },
        pace: { minStepGapMs: 250 }
      })
    ).toEqual([]);
  });

  it("has every section the design lists, with the locked and append-only ones", () => {
    expect(Object.keys(FLUXNODE_PROMPT_SECTIONS)).toHaveLength(22);
    for (const id of ["core.output_rules", "core.person_limits", "judge.fields", "judge.order", "core.runtime_patch_consequences"]) expect(FLUXNODE_PROMPT_SECTIONS[id]?.policy).toBe("locked");
    for (const id of ["domain.instructions", "explorer.role.landed", "core.supplementary_recordings", "core.reusable_context", "core.in_run_repair"]) expect(FLUXNODE_PROMPT_SECTIONS[id]?.policy).toBe("append_only");
    expect(FLUXNODE_CORE_TOOL_POLICIES["core.run_node"]).toBe("append_only");
  });

  it("refuses any entry on a locked section", () => {
    expect(codes({ prompts: { "core.output_rules": { mode: "append", text: "x" } } })).toEqual(["/prompts/core.output_rules overrides.section_locked"]);
    expect(codes({ prompts: { "judge.fields": { mode: "default" } } })).toEqual(["/prompts/judge.fields overrides.section_locked"]);
    expect(codes({ prompts: { "core.runtime_patch_consequences": { mode: "replace", text: "x" } } })).toEqual(["/prompts/core.runtime_patch_consequences overrides.section_locked"]);
  });

  it("refuses a replace on an append-only section but takes an append", () => {
    for (const id of ["domain.instructions", "explorer.role.landed", "core.supplementary_recordings", "core.reusable_context", "core.in_run_repair"]) {
      expect(codes({ prompts: { [id]: { mode: "replace", text: "x" } } })).toEqual([`/prompts/${id} overrides.section_append_only`]);
      expect(codes({ prompts: { [id]: { mode: "append", text: "x" } } })).toEqual([]);
    }
  });

  it("refuses a replace on core.run_node and on a tool Core does not list", () => {
    expect(codes({ tools: { "core.run_node": { mode: "replace", text: "x" } } })).toEqual(["/tools/core.run_node overrides.tool_append_only"]);
    expect(codes({ tools: { "web.screenshot": { mode: "replace", text: "x" } } })).toEqual(["/tools/web.screenshot overrides.tool_append_only"]);
  });

  it("names an unknown section, and a safety-word id as safety_not_overridable", () => {
    expect(codes({ prompts: { "core.nothing": { mode: "append", text: "x" } } })).toEqual(["/prompts/core.nothing overrides.unknown_section"]);
    expect(codes({ prompts: { "core.permission_rules": { mode: "append", text: "x" } } })).toEqual(["/prompts/core.permission_rules overrides.safety_not_overridable"]);
  });

  it("names a safety-word property at any depth, instead of an unknown key", () => {
    expect(codes({ scope: { acts: [] } })).toEqual(["/scope overrides.safety_not_overridable"]);
    expect(codes({ pace: { minStepGapMs: 1, captchaWait: 5 } })).toEqual(["/pace/captchaWait overrides.safety_not_overridable"]);
    expect(codes({ deadlines: { modelSilence: { secretMs: 1 } } })).toEqual(["/deadlines/modelSilence/secretMs overrides.safety_not_overridable"]);
    expect(codes({ prompts: { "core.efficiency": { mode: "append", text: "x", redactions: true } } })).toEqual(["/prompts/core.efficiency/redactions overrides.safety_not_overridable"]);
  });

  it("leaves a safety-word tool id alone, and reports other unknown keys as unknown", () => {
    expect(codes({ tools: { "web.screenshot": { mode: "append", text: "x" } } })).toEqual([]);
    expect(codes({ tools: { "web.screen_grab": { mode: "append", text: "x" } } })).toEqual([]);
    expect(codes({ pace: { speed: 1 } })).toEqual(["/pace unrecognized_keys"]);
    expect(codes({ other: 1 })).toEqual([" unrecognized_keys"]);
  });

  it("refuses total text over 32,000 characters, and accepts exactly 32,000", () => {
    const entry = (n: number) => ({ mode: "replace" as const, text: "a".repeat(n) });
    const big = { prompts: { "core.efficiency": entry(8000), "core.list_authoring": entry(8000), "core.decision_output": entry(8000), "core.evidence_decision": entry(8000) } };
    expect(codes(big)).toEqual([]);
    expect(codes({ ...big, judgeCriteria: ["x"] })).toEqual([" overrides.too_large"]);
  });

  it("holds each field to its bounds", () => {
    expect(codes({ deadlines: { llmCallMs: 46_000 } })).toEqual(["/deadlines/llmCallMs too_big"]);
    expect(codes({ models: { explore: "bad model" } })).toEqual(["/models/explore invalid_string"]);
    expect(codes({ judgeCriteria: Array.from({ length: 21 }, () => "x") })).toEqual(["/judgeCriteria too_big"]);
    expect(codes({ retryWaits: { backoffMs: [] } })).toEqual(["/retryWaits/backoffMs too_small"]);
    expect(codes({ prompts: { "core.efficiency": { mode: "append", text: "a".repeat(4001) } } })).toEqual(["/prompts/core.efficiency/text too_big"]);
  });
});
