// t772 (w2): the notes Core adds beside a call that landed outside a brief. A call that names an act under `undoes` is the
// undo a trial refusal demands, in any role; and no note forbids a step the brief's parts may require.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../../llm/index.ts";
import { automationStudioProjectBuildBriefTold as told } from "../index.ts";

type Call = Parameters<AutomationStudioLlmEvidenceLoopInput["executeTool"]>[0];

type Said = Parameters<typeof told>[1];
const base: Said = { start: undefined, entry: undefined, permittedActs: [], arrived: false };

function loopReturning(evidence: JsonObject) {
  return { executeTool: async (..._args: unknown[]) => ({ kind: "llm_evidence_tool_execution" as const, evidence, effectApplied: true, targetsUnchanged: false }) };
}
const call = (value: JsonObject): Call => ({ callId: "c1", toolId: "core.run_node", value });
const outsideOf = async (said: Said, value: JsonObject) => {
  const ran = await told(loopReturning({ ok: true }), said).executeTool(call(value)) as { evidence: Record<string, unknown> };
  return ran.evidence.outsideBrief as { note: string } | undefined;
};

describe("outsideBrief notes (t772)", () => {
  it("never go to a call naming an act under undoes, in a build brief or a reset", async () => {
    const value = { undoes: "act-1", consequences: ["modify_existing"] };
    expect(await outsideOf(base, value)).toBeUndefined();
    expect(await outsideOf({ ...base, role: "reset" }, value)).toBeUndefined();
  });

  it("never tell a build to write no step or not to do it again, and say the act stays on the site, the trial is judged by the change from just before it, and who can amend the plan", async () => {
    const note = (await outsideOf(base, { consequences: ["modify_existing"] }))!.note;
    expect(note).not.toContain("do not do it again");
    expect(note).not.toContain("Write no step");
    expect(note).not.toContain("undone before a trial");
    expect(note).toContain("stays on the site");
    expect(note).toContain("change from what was there just before");
    expect(note).toContain("project.amend_plan");
  });

  it("keeps the reset note saying to undo only the listed acts", async () => {
    const note = (await outsideOf({ ...base, role: "reset" }, { consequences: ["modify_existing"] }))!.note;
    expect(note).toContain("outside this reset");
    expect(note).not.toContain("do not do it again");
  });
});
