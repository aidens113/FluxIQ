// The model always sees the script of its latest accepted revision, never
// takes a refused script for its current one, and is told which revision is
// current exactly once (t498, t501, t503).
//
// Live run `run-mv6ff44s-01def7f6`: every decision is a fresh request, and an
// accepted submission came back as a revision, a digest and changed paths. The
// only script left in context was the refused revision 3, handed back as
// `previous` and called "the script you just sent". After revision 4 was
// accepted, the model sent revision 3 word for word three times and the repeat
// guard ended the build.
//
// Live run `run-mv6lgqi6-4bfab2e1` (lane C round 17): every accepted script was
// written "is your current Flow" and never rewritten (t501, for the cache), so
// decision 0051 was shown four scripts each calling itself current, and a
// refusal saying "Submit again from revision 4's script" after revision 5 was
// accepted. It sent revision 4's script three times.
//
// These tests replay those sequences through the real loop and read what each
// decision was shown.
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
const REV_5 = script([...press("notice", ["  optional: yes"]), ...press("older"), ...press("newer")]);

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
const currentFlow = (evidence: readonly Entry[]) => evidence.filter((entry) => entry.toolId === "core.current_flow");
/**
 * Any wording that says something is the current Flow: what every accepted
 * entry and every refusal said of itself before t503, and the refusal's
 * "that revision is your current Flow". Only core.current_flow may say it.
 */
const CALLED_CURRENT = /is your current Flow|your current Flow,|current Flow until/u;

/** That exactly one entry names the current Flow, that it is Core's, last before the history, and that it names `call`'s revision. */
function namesCurrentOnce(evidence: readonly Entry[], call: string): JsonObject {
  const naming = evidence.filter((entry) => CALLED_CURRENT.test(JSON.stringify(entry.value)));
  expect(naming.map((entry) => entry.toolId)).toEqual(["core.current_flow"]);
  const [current] = currentFlow(evidence);
  const value = current!.value as JsonObject;
  const accepted = submitted(evidence, call);
  expect(value).toMatchObject({ revision: accepted.revision, digest: accepted.digest, call });
  expect(String(value.instruction)).toContain(`Revision ${String(accepted.revision)} (digest ${String(accepted.digest)}) is your current Flow`);
  // Last of the window: only Core's notes rewritten every request (history, budget) follow it.
  const after = evidence.slice(evidence.indexOf(current!) + 1);
  expect(after.every((entry) => entry.toolId === "core.evidence_history" || entry.toolId === "core.budget")).toBe(true);
  // No script is labelled current by itself, and no submission keeps the key a refusal once named it by.
  for (const entry of evidence.filter((one) => one.toolId === "core.submit_candidate")) {
    const own = entry.value as JsonObject;
    expect(String(own.scriptIs ?? ""), entry.callId).not.toMatch(/current|Submit again from/u);
    expect(own, entry.callId).not.toHaveProperty("current");
    expect(own, entry.callId).not.toHaveProperty("supersedes");
  }
  return value;
}

describe("the script of the latest accepted revision", () => {
  it("is shown after accepted revision 2 and refused revision 3, labelled by revision, and named current once, by Core", async () => {
    const seen = await shown([submit("submit.1", REV_1), submit("submit.2", REV_2), submit("submit.3", REV_3), look, look]);
    const decision = seen[3]!;
    const rev1 = submitted(decision, "submit.1");
    const rev2 = submitted(decision, "submit.2");
    const rev3 = submitted(decision, "submit.3");
    // Revision 2: its whole script, labelled by its number and digest, as accepted.
    expect(rev2).toMatchObject({ ok: true, revision: 2, script: REV_2 });
    expect(String(rev2.scriptIs)).toBe(`Revision 2 (digest ${String(rev2.digest)}), as Core accepted it: script is its whole text.`);
    // Revision 1 stays whole, as first sent: no earlier entry is rewritten.
    expect(rev1).toMatchObject({ ok: true, revision: 1, script: REV_1 });
    expect(rev1).not.toHaveProperty("supersededBy");
    // Revision 3: refused, naming the revision that was latest when it was sent.
    expect(rev3).toMatchObject({ ok: false, revision: 3, latestAcceptedWhenSent: { revision: 2, digest: rev2.digest, call: "submit.2" } });
    expect(String(rev3.scriptIs)).toContain("This submission was refused and is no revision");
    expect(String(rev3.scriptIs)).toContain("When it was sent, the latest revision Core had accepted was revision 2, whose whole script is under call submit.2");
    // Never "the script you sent" as if it were the current one.
    expect(JSON.stringify(rev3)).not.toMatch(/script you (just )?sent/u);
    namesCurrentOnce(decision, "submit.2");
  });

  it("leaves revision 2's script and refused revision 3's as sent once revision 4 is accepted, and names revision 4 current", async () => {
    const seen = await shown([submit("submit.1", REV_1), submit("submit.2", REV_2), submit("submit.3", REV_3), submit("submit.4", REV_4), look, look]);
    const decision = seen[4]!;
    expect(submitted(decision, "submit.4")).toMatchObject({ ok: true, revision: 4, script: REV_4 });
    // The earlier submissions are exactly what the decision before revision 4 was shown.
    const before = seen[3]!;
    for (const callId of ["submit.1", "submit.2", "submit.3"]) expect(submitted(decision, callId), callId).toEqual(submitted(before, callId));
    expect(submitted(decision, "submit.3")).toMatchObject({ ok: false, revision: 3, latestAcceptedWhenSent: { revision: 2, call: "submit.2" } });
    expect(JSON.stringify(decision)).not.toContain("supersededBy");
    namesCurrentOnce(before, "submit.2");
    namesCurrentOnce(decision, "submit.4");
  });

  it("replays round 17: after revisions 1 to 3, a refusal while 3 stood, and a newer revision, exactly one entry names the newest current", async () => {
    // The run's shape: revisions accepted in turn, a submission refused while the third stood (0044 named it "Submit again from"), then a newer one accepted.
    const seen = await shown([submit("submit.1", REV_1), submit("submit.2", REV_2), submit("submit.3", REV_4), submit("submit.4", REV_3), submit("submit.5", REV_5), look, look]);
    const decision = seen[5]!;
    expect(submitted(decision, "submit.4")).toMatchObject({ ok: false, latestAcceptedWhenSent: { revision: 3, call: "submit.3" } });
    expect(submitted(decision, "submit.5")).toMatchObject({ ok: true, revision: 5, script: REV_5 });
    // Four scripts are in the evidence, and only Core's entry says which is current.
    expect(decision.filter((entry) => entry.toolId === "core.submit_candidate" && (entry.value as JsonObject).script !== undefined)).toHaveLength(4);
    namesCurrentOnce(decision, "submit.5");
    // At every decision once something was accepted, one naming, of the latest accepted call.
    const latest = ["submit.1", "submit.2", "submit.3", "submit.3", "submit.5", "submit.5"];
    expect(seen.length).toBeGreaterThan(latest.length);
    for (let index = 1; index <= latest.length; index += 1) namesCurrentOnce(seen[index]!, latest[index - 1]!);
    expect(currentFlow(seen[0]!)).toHaveLength(0);
  });

  it("keeps each stub unchanged from the decision it was written in, so a request stays a prefix of the next until a new revision is accepted", async () => {
    const seen = await shown([submit("submit.1", REV_1), submit("submit.2", REV_2), submit("submit.3", REV_3), look, look]);
    // The submissions' entries, as each decision was shown them: the history and budget ride after the evidence.
    const submissions = (decision: readonly Entry[]) => decision.filter((entry) => entry.toolId === "core.submit_candidate");
    expect(submissions(seen[4]!)).toEqual(submissions(seen[3]!));
    expect(submissions(seen[3]!)).toHaveLength(3);
  });

  it("never rewrites an entry already shown when a new revision is accepted, so each request's evidence is a byte prefix of the next", async () => {
    const seen = await shown([submit("submit.1", REV_1), submit("submit.2", REV_2), submit("submit.3", REV_3), submit("submit.4", REV_4), submit("submit.5", REV_4), submit("submit.6", REV_5), look, look]);
    const evidence = (decision: readonly Entry[]) => decision.filter((entry) => !entry.toolId.startsWith("core.") || entry.toolId === "core.submit_candidate");
    for (let index = 1; index < seen.length; index += 1) {
      const earlier = evidence(seen[index - 1]!);
      expect(JSON.stringify(evidence(seen[index]!).slice(0, earlier.length)), `decision ${index + 1}`).toBe(JSON.stringify(earlier));
    }
  });

  it("hands back the refused script to correct when nothing was accepted before it, and names nothing current", async () => {
    const seen = await shown([submit("submit.1", REV_3), look]);
    const rev1 = submitted(seen[1]!, "submit.1");
    expect(rev1).toMatchObject({ ok: false });
    expect(rev1).not.toHaveProperty("latestAcceptedWhenSent");
    expect((rev1.diagnostics as JsonObject).previous).toBe(REV_3);
    expect(currentFlow(seen[1]!)).toHaveLength(0);
  });

  it("leaves a refused script that came before any accepted revision as sent once one is accepted", async () => {
    const seen = await shown([submit("submit.1", REV_3), submit("submit.2", REV_2), look, look]);
    const refused = submitted(seen[2]!, "submit.1");
    expect(refused).toEqual(submitted(seen[1]!, "submit.1"));
    expect((refused.diagnostics as JsonObject).previous).toBe(REV_3);
    expect(refused).not.toHaveProperty("supersededBy");
    expect(submitted(seen[2]!, "submit.2")).toMatchObject({ ok: true, script: REV_2 });
    namesCurrentOnce(seen[2]!, "submit.2");
  });
});
