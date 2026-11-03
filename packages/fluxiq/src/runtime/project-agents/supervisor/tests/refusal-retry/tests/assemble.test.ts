// `project.assemble` refused until the briefs it needs came back, then sent again word for word, through the real loop and its
// real repeat guard (`../../../../../llm/repeat-guard/outcomes.ts`). A refused look is a failed call on its page, and the supervisor's
// own tools report no page, so after one look the refused assemble stayed refused however many briefs came back. A lending library.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../../../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../../index.ts";
import { planInput, project, subflow, taskSpecInput } from "../../supervisor-fixture.ts";
import { FIND, HOLD, brief, call, dispatch, end, supervise } from "../../supervisor-script.ts";

const look = call("web.page.read", { look: 1 });
const onThePage: AutomationStudioLlmEvidenceLoopInput["executeTool"] = async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true, shown: "the catalogue" }, effectApplied: false, targetsUnchanged: true, stateDigests: { before: "page.one", after: "page.one" } });
const PLAN = planInput([
  subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }),
  subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"], after: ["find_titles"] })
], taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]]));
const FIND_BRIEF = brief("find_titles", ["p1"]);
const HOLD_BRIEF = brief("place_hold", ["p2"], ["find_titles"], { permittedActs: ["create_new"] });
const repeats = (shown: ReadonlyArray<{ value: unknown }>) => shown.filter((entry) => (entry.value as JsonObject | null)?.code === "llm_evidence_loop.repeat_refused");
const assembles = (shown: ReadonlyArray<{ toolId: string; value: unknown }>) => shown.filter((entry) => entry.toolId === IDS.assemble).map((entry) => entry.value as JsonObject);

describe("project.assemble refused", () => {
  it("told to send the briefs it needs, the identical assemble runs once they came back", async () => {
    const run = await supervise([look, call(IDS.writePlan, PLAN), dispatch([FIND_BRIEF]), call(IDS.assemble), dispatch([HOLD_BRIEF]), call(IDS.assemble), end("blocked")], project(), { executeTool: onThePage });
    const [refused, assembled] = assembles(run.shown);
    expect(refused).toMatchObject({ ok: false, code: "project.assemble_refused", instruction: GUIDANCE.refusals.assembleRefused });
    expect(repeats(run.shown)).toEqual([]);
    expect(assembled).toMatchObject({ ok: true, status: "draft" });
  });

  it("with nothing changed, the identical assemble is refused unrun", async () => {
    const run = await supervise([look, call(IDS.writePlan, PLAN), dispatch([FIND_BRIEF]), call(IDS.assemble), call("web.page.read", { look: 2 }), call(IDS.assemble), end("blocked")], project(), { executeTool: onThePage });
    expect(assembles(run.shown)).toHaveLength(1);
    expect(repeats(run.shown)).toHaveLength(1);
  });
});
