// The model's notes for the next attempt: allowed by the schema, screened, kept on the state, and
// never changing a verdict or reaching the judge.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowLessSummary } from "../../../../../../runtime/result-verification/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_COMPLETION_SCHEMA, automationStudioAnswerFirstCompletionCheck } from "../index.ts";

const purse: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0]["purse"] = { keepBackForJudging: () => undefined };

function made(verdict: "yes" | "no") {
  const summaries: AutomationStudioFlowLessSummary[] = [];
  const check = automationStudioAnswerFirstCompletionCheck({
    instructions: "List the books on loan",
    rows: async () => ({ datasetId: "dataset.1", totalRows: 1, truncated: false, columns: [{ id: "title", label: "Title" }], rows: [{ title: "Atlas" }] }),
    acts: () => [],
    endView: async () => undefined,
    witnesses: () => ({}),
    judge: async (summary) => {
      summaries.push(summary);
      return { verdict, reason: "because", checkedWhat: "the list" };
    },
    purse,
    say: () => undefined
  });
  return { check, summaries };
}

describe("completion notes", () => {
  it("are optional strings on the schema, which stays closed", () => {
    const schema = AUTOMATION_STUDIO_ANSWER_FIRST_COMPLETION_SCHEMA as { properties: Record<string, { properties?: Record<string, { type: string; description: string }>; additionalProperties?: boolean; description: string }>; required: string[]; additionalProperties: boolean };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["summary"]);
    expect(Object.keys(schema.properties.notes!.properties!)).toEqual(["worked", "failed", "quirks"]);
    expect(schema.properties.notes!.additionalProperties).toBe(false);
    expect(schema.properties.notes!.description).toMatch(/next attempt at this same task/);
    expect(schema.properties.notes!.description).toMatch(/no secrets/i);
  });

  it("are kept screened on the state and do not change a yes", async () => {
    const { check, summaries } = made("yes");
    const out = await check.check({ summary: "got it", notes: { worked: "the loans tab", quirks: "x".repeat(900), failed: "" } });
    expect(out).toEqual({ ok: true });
    expect(check.check.length).toBe(1);
    expect(check.state.achieved).toBe(true);
    expect(check.state.notes?.worked).toBe("the loans tab");
    expect(check.state.notes?.quirks).toHaveLength(600);
    expect(check.state.notes?.failed).toBeUndefined();
    expect(JSON.stringify(summaries)).not.toContain("the loans tab");
  });

  it("do not change a no, and a check without notes keeps none", async () => {
    const { check } = made("no");
    const out = await check.check({ summary: "got it", notes: { failed: "the search box" } });
    expect(out.ok).toBe(false);
    expect(check.state.notes).toEqual({ failed: "the search box" });
    const plain = made("yes");
    await plain.check.check({ summary: "got it" });
    expect(plain.check.state.notes).toBeUndefined();
  });
});
