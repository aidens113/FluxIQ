// @fluxiq-test-group real-sql
// A later attempt carrying an undeclared act whose before was never read is judged on Core's own note, never on
// evidence the host cannot read (t1043).
//
// Run `run-mww6euuw-ecdb20f8`: attempt 1 pressed a control undeclared, and the page changed a line by itself during
// the press, so the press's answer said a line reads otherwise. Core carried the act into attempt 2 (`changedState`,
// `runtime/answer-first/act-record/seed.ts`). Attempt 1 read no before side (no lasting act was declared), so attempt
// 2's before side was Core's note that none is held (`../witnesses.ts`). The note went through the web projector as
// page state, which named it `web_judge.evidence_unrecognized`, and attempt 2's judge said yes and was held unsure with
// no way out. Through the real service, the real engine and a scripted model, at a lending library, with a projector
// that refuses anything it does not know, as the web one does. Provider-free.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioJudgeEvidenceProjector, AutomationStudioLlmTaskRequest } from "../../../../../../runtime/llm/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_BEFORE_WORDS as WORDS } from "../index.ts";
import { complete, RENEW_CARD, runNode, type FakeLibraryFault } from "../../tests/fake-library.ts";
import { laterAttempts, readLoans } from "../../tests/later-attempts.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const TASK = "List every loan on my library account.";

/** The card's press, made with nothing declared, answers that a line of the page now reads otherwise: the line the page changed by itself. */
const changedByItself: FakeLibraryFault = ({ value }, library) => {
  if (value.node !== RENEW_CARD || (Array.isArray(value.consequences) && value.consequences.length > 0)) return undefined;
  const ran = { node: RENEW_CARD, parameters: (value.parameters ?? {}) as JsonObject, consequences: [] };
  return {
    kind: "llm_evidence_tool_execution",
    evidence: { ok: true, pageChanged: true, page: { heading: "Your account", shelf: library.shelf, renewed: 0 } },
    effectApplied: true,
    draft: { actionId: RENEW_CARD, effect: "mutate", input: value, ranWith: ran, replay: { from: { location: "library://account" } }, proposes: true, changed: [{ words: "Opening hours today: 9 to 5 was \"Opening hours tomorrow: 10 to 4\"", how: "reads" }] }
  };
};

/** A projector that reads the library's own shapes and names everything else a gap. */
const strict: AutomationStudioJudgeEvidenceProjector = (input) => {
  const evidence = (input.evidence as JsonObject).evidence as JsonObject | undefined;
  const value = evidence?.result !== undefined && typeof evidence.result === "object" ? evidence.result as JsonObject : evidence;
  if (value?.read !== undefined || value?.records !== undefined) return { role: "data", evidence: { rows: true } };
  if (value?.readPage !== undefined) return { role: "observation", evidence: { readPage: true } };
  if (value?.page !== undefined) return { role: "observation", evidence: { page: true } };
  if (value?.heading !== undefined) return { role: "observation", evidence: { heading: String(value.heading) } };
  if (value?.ok === true || value?.success === true) return { role: "action", evidence: { ok: true } };
  return { role: "observation", missing: ["library.evidence_unrecognized"] };
};

const shownBefore = (request: AutomationStudioLlmTaskRequest): unknown => (request.context.resultSummary as unknown as { witnesses?: { before?: unknown } } | undefined)?.witnesses?.before;
const gaps = (request: AutomationStudioLlmTaskRequest): unknown => (request.context.resultSummary as unknown as { evidenceProjection?: { missing?: unknown } } | undefined)?.evidenceProjection?.missing;

describe("a later attempt carrying an undeclared act whose before side was never read", () => {
  it("shows the judge Core's own note, names no gap for it, and the judge's yes is confirmed", async () => {
    const lane = await laterAttempts(cleanups, { fault: changedByItself, domain: () => ({ judgeEvidenceVersion: 1, projectJudgeEvidence: strict }) });
    const first = await lane.attempt({ instruction: TASK, taskProcessing: { process: {} }, script: [readLoans(), runNode("card", RENEW_CARD, { target: { handle: "t7" } }, [], { add: true }), complete("Done.")] });
    expect(first.answer.attempt?.status).toBe("achieved");
    const second = await lane.attempt({ instruction: TASK, taskProcessing: { process: {} }, script: [readLoans("read.again"), complete("Done.")] });
    // The undeclared press was carried: its answer said a line reads otherwise, and nothing read a before side for it.
    expect(JSON.stringify(second.decisions.map((request) => request.context))).toContain("\"carried\":true");
    expect(second.judgeCalls.length).toBeGreaterThan(0);
    for (const judged of second.judgeCalls) {
      expect(shownBefore(judged)).toEqual({ role: "observation", evidence: { note: WORDS.notHeld } });
      expect(JSON.stringify(gaps(judged))).not.toContain("witnesses.before");
    }
    expect(second.answer.attempt?.status).toBe("achieved");
    expect(second.answer.result).toMatchObject({ label: "confirmed" });
  });
});
