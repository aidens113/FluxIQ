// The model always sees the script of its latest accepted revision, and never
// takes a refused script for its current one (t498).
//
// Live run `run-mv6ff44s-01def7f6`: every decision is a fresh request, and an
// accepted submission came back as a revision, a digest and changed paths. The
// only script left in context was the refused revision 3, handed back as
// `previous` and called "the script you just sent". After revision 4 was
// accepted, the model sent revision 3 word for word three times and the repeat
// guard ended the build. These tests replay that sequence through the real loop
// and read what each decision was shown.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopDecision } from "../../../llm/evidence-loop.ts";
import { runAutomationStudioFlowCandidateAuthoringLoop } from "../index.ts";
import { refusalTestSubmission } from "./refusal-domain-fixture.ts";

type Entry = { callId: string; toolId: string; value: unknown };

/** A recipe archive: open it, read a page, and whatever `extra` lines follow. */
function script(extra: string[]): string {
  return [
    "flow: Every quick recipe",
    "step: open the archive", "  node: web.browser.navigate", "  url: https://recipes.test/archive",
    "step rows: read the recipes", "  node: web.dom.extract_list", `  extractList: {"item": ".recipe", "fields": {"title": ".title"}}`,
    ...extra
  ].join("\n");
}
const press = (label: string, extra: string[] = []) => [`step ${label}: press ${label}`, "  node: web.dom.click", `  selector: .${label}`, "  consequences: none", ...extra];

const REV_1 = script([]);
const REV_2 = script(press("older"));
/** Refused: an `only after:` naming a step that is not optional. */
const REV_3 = script([...press("older"), ...press("notice", ["  only after: older"])]);
const REV_4 = script([...press("notice", ["  optional: yes"]), ...press("older")]);

const submit = (callId: string, flow: string): AutomationStudioLlmEvidenceLoopDecision => ({ kind: "tool_call", toolId: "core.submit_candidate", callId, input: { summary: "recipes", flow } });
const look: AutomationStudioLlmEvidenceLoopDecision = { kind: "tool_call", toolId: "demo.look", callId: "look", input: {} };

/** What each decision was shown, the decisions run in order. */
async function shown(decisions: AutomationStudioLlmEvidenceLoopDecision[]): Promise<Entry[][]> {
  const seen: Entry[][] = [];
  let index = 0;
  await runAutomationStudioFlowCandidateAuthoringLoop({
    submission: refusalTestSubmission(),
    loop: {
      tools: [{ toolId: "demo.look", effect: "observe", description: "Look", inputSchema: { type: "object" } }], maxIterations: decisions.length + 2, maxToolCalls: decisions.length + 2,
      unusableDecisions: { maxConsecutive: decisions.length + 2, maxInARow: decisions.length + 2, stalled: ({ issueCodes }) => Object.assign(new Error("stalled"), { issueCodes }) },
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { looked: true }, effectApplied: false, stateDigests: { before: "page.archive", after: "page.archive" } }),
      decide: async ({ evidence }) => {
        seen.push(evidence.map((entry) => structuredClone(entry)));
        const decision = decisions[index++];
        if (!decision) throw new Error("script exhausted");
        return decision;
      }
    }
  }).catch(() => undefined);
  return seen;
}

const submitted = (evidence: readonly Entry[], callId: string) => evidence.find((entry) => entry.callId === callId && entry.toolId === "core.submit_candidate")?.value as JsonObject;

describe("the script of the latest accepted revision", () => {
  it("is shown after accepted revision 2 and refused revision 3, labelled current, and revision 3 is labelled refused and superseded", async () => {
    const seen = await shown([submit("submit.1", REV_1), submit("submit.2", REV_2), submit("submit.3", REV_3), look, look]);
    const decision = seen[3]!;
    const rev1 = submitted(decision, "submit.1");
    const rev2 = submitted(decision, "submit.2");
    const rev3 = submitted(decision, "submit.3");
    // Revision 2: its whole script, labelled the current Flow by its number and digest.
    expect(rev2).toMatchObject({ ok: true, revision: 2, script: REV_2 });
    expect(String(rev2.scriptIs)).toContain(`Revision 2 (digest ${String(rev2.digest)}) is your current Flow`);
    // Revision 1 is not a second current script.
    expect(rev1).not.toHaveProperty("script");
    expect(rev1).toMatchObject({ supersededBy: "submit.2" });
    // Revision 3: refused, and superseded by revision 2 as the Flow to edit.
    expect(rev3).toMatchObject({ ok: false, revision: 3, current: { revision: 2, digest: rev2.digest, call: "submit.2" } });
    expect(String(rev3.scriptIs)).toContain("This submission was refused and is no revision");
    expect(String(rev3.scriptIs)).toContain("superseded by revision 2, your current Flow, whose whole script is under call submit.2");
    // Never "the script you sent" as if it were the current one.
    expect(JSON.stringify(rev3)).not.toMatch(/script you (just )?sent/u);
    // Only one script is labelled current.
    expect(decision.filter((entry) => typeof (entry.value as JsonObject | undefined)?.script === "string")).toHaveLength(1);
  });

  it("supersedes revision 2's script and refused revision 3's once revision 4 is accepted, and shows revision 4 whole", async () => {
    const seen = await shown([submit("submit.1", REV_1), submit("submit.2", REV_2), submit("submit.3", REV_3), submit("submit.4", REV_4), look, look]);
    const decision = seen[4]!;
    const rev2 = submitted(decision, "submit.2");
    const rev3 = submitted(decision, "submit.3");
    const rev4 = submitted(decision, "submit.4");
    expect(rev4).toMatchObject({ ok: true, revision: 4, script: REV_4 });
    expect(rev2).toMatchObject({ supersededBy: "submit.4" });
    expect(rev2).not.toHaveProperty("script");
    expect(rev3).toMatchObject({ ok: false, supersededBy: "submit.4" });
    expect(rev3).not.toHaveProperty("scriptIs");
    expect(rev3).not.toHaveProperty("current");
    expect(rev3.diagnostics).not.toHaveProperty("previous");
    // The refused script's text is nowhere in the decision.
    expect(JSON.stringify(decision)).not.toContain("only after: older");
  });

  it("keeps each stub unchanged from the decision it was written in, so a request stays a prefix of the next until a new revision is accepted", async () => {
    const seen = await shown([submit("submit.1", REV_1), submit("submit.2", REV_2), submit("submit.3", REV_3), look, look]);
    // The submissions' entries, as each decision was shown them: the history and budget ride after the evidence.
    const submissions = (decision: readonly Entry[]) => decision.filter((entry) => entry.toolId === "core.submit_candidate");
    expect(submissions(seen[4]!)).toEqual(submissions(seen[3]!));
    expect(submissions(seen[3]!)).toHaveLength(3);
  });

  it("hands back the refused script to correct when nothing was accepted before it", async () => {
    const seen = await shown([submit("submit.1", REV_3), look]);
    const rev1 = submitted(seen[1]!, "submit.1");
    expect(rev1).toMatchObject({ ok: false });
    expect(rev1).not.toHaveProperty("current");
    expect((rev1.diagnostics as JsonObject).previous).toBe(REV_3);
  });

  it("supersedes a refused script that came before any accepted revision once one is accepted", async () => {
    const seen = await shown([submit("submit.1", REV_3), submit("submit.2", REV_2), look, look]);
    const refused = submitted(seen[2]!, "submit.1");
    expect(refused).toMatchObject({ ok: false, supersededBy: "submit.2" });
    expect(refused.diagnostics).not.toHaveProperty("previous");
    expect(submitted(seen[2]!, "submit.2")).toMatchObject({ ok: true, script: REV_2 });
  });
});
