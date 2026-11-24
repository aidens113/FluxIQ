// The Flow-less judge through the real harness with a scripted provider, no model called (t1032). From run-mwv5m906-5e999159:
// - 0094: a yes with no defects at 0.8, `answerRecords.asked: false`, over a result that held another list's rows while
//   the request named a table's columns. It must stay refused, naming the mismatch; the asked table's own rows pass.
// - Every judge of that run held its yes for evidence gaps and the model read only "could not tell": a held yes says why.
// - The gaps came from Core's own calls handed to the host's projector: Core never hands them over.
// Fixture: a library's loans and its catalogue, made up; no scenario's site.
import { describe, expect, it } from "vitest";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioJudgeEvidenceProjector } from "../../../llm/harness-options/index.ts";
import { automationStudioFlowLessJudge } from "../judge.ts";
import type { AutomationStudioFlowLessSummary } from "../types.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const REQUEST = "Renew the oldest loan and keep the others, then show me my loans as a table with columns title, copies and due date.";
const CONTRACT = { pages: [], coverage: [], working: [], looks: [], answerContract: { columns: ["title", "copies", "due date"] } };
const CATALOGUE: AutomationStudioFlowLessSummary["rows"] = {
  totalRows: 2, truncated: false,
  columns: [{ id: "name", label: "Name" }, { id: "shelf", label: "Shelf" }, { id: "due date", label: "Due date" }],
  rows: [{ name: "Tide Tables", shelf: "B2", "due date": "Friday" }, { name: "River Atlas", shelf: "C1", "due date": "Monday" }]
};
const LOANS: AutomationStudioFlowLessSummary["rows"] = {
  totalRows: 2, truncated: false,
  columns: [{ id: "title", label: "Title" }, { id: "copies", label: "Copies" }, { id: "due date", label: "Due date" }],
  rows: [{ title: "Tide Tables", copies: "1", "due date": "Friday" }, { title: "Star Charts", copies: "1", "due date": "Monday" }]
};
const RENEWED = [{ what: "Renew Tide Tables", where: "loans", classes: ["modify_existing"], state: "landed" }] as unknown as AutomationStudioFlowLessSummary["acts"];
const summary = (rows: NonNullable<AutomationStudioFlowLessSummary["rows"]>, extra: { trail?: AutomationStudioFlowLessSummary["trail"] & object; acts?: AutomationStudioFlowLessSummary["acts"] } = {}): AutomationStudioFlowLessSummary => ({
  instructions: REQUEST, rows, acts: extra.acts ?? RENEWED, answerText: "title | copies | due date", resultEvidence: CONTRACT as unknown as NonNullable<AutomationStudioFlowLessSummary["resultEvidence"]>, ...(extra.trail ? { trail: extra.trail } : {})
});

/** The 0094 judge: yes, no defects, the table only in the model's words, no records asked. */
const YES_0094 = { answersRequest: "yes", defects: [], checked: [{ row: "Tide Tables", column: "due date", value: "Friday" }], answerRecords: { asked: false, siteShows: 2 }, observed: "Loan renewed; the answer table is given." };
const YES_LOANS = { answersRequest: "yes", defects: [], checked: [{ row: "Tide Tables", column: "copies", value: "1" }, { row: "Star Charts", column: "copies", value: "1" }], answerRecords: { asked: true, siteShows: 2 } };

function scripted(answers: Record<string, unknown>[]): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        const answer = answers[Math.min(seen.length, answers.length - 1)]!;
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Request appears met.", diagnosis: answer, confidence: 0.8 }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

const judge = (provider: AutomationStudioLlmProvider, judged: AutomationStudioFlowLessSummary, semantic: { projectJudgeEvidence?: AutomationStudioJudgeEvidenceProjector; judgeEvidenceVersion?: 1 } = {}) => automationStudioFlowLessJudge({
  summary: judged, provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: [], ...semantic
});

describe("a yes over the table the request names (t1032)", () => {
  it("refuses the 0094 yes over another list's rows, asks once more, and stays unsure naming the mismatch", async () => {
    const { provider, seen } = scripted([YES_0094]);
    const judged = await judge(provider, summary(CATALOGUE));
    expect(judged.verdict).toBe("unsure");
    expect(judged.reason).toContain("The check said yes, but it does not stand on the rows the result holds");
    expect(judged.reason).toContain("so it asks for records, and the yes says it does not");
    expect(judged.reason).toContain("have no title or copies column, so they are not the table it asks for");
    expect(seen).toHaveLength(2);
    expect(JSON.stringify(seen[1]?.context.resultSummary)).toContain("not the table it asks for");
  });

  it("takes the yes on the asked table's own rows in one call", async () => {
    const { provider, seen } = scripted([YES_LOANS]);
    expect(await judge(provider, summary(LOANS))).toMatchObject({ verdict: "yes" });
    expect(seen).toHaveLength(1);
  });
});

describe("a yes Core holds says why (t1032)", () => {
  const trail = [{ callId: "look.1", did: "example.look", outcome: "answered", found: { said: "the loans page" } }];
  const gap: AutomationStudioJudgeEvidenceProjector = () => ({ role: "observation", missing: ["host.unread"] });

  it("names the reason and the calls whose evidence Core could not read, never only that the check could not tell", async () => {
    const { provider } = scripted([YES_LOANS]);
    const judged = await judge(provider, summary(LOANS, { trail }), { projectJudgeEvidence: gap, judgeEvidenceVersion: 1 });
    expect(judged.verdict).toBe("unsure");
    expect(judged.reason).toContain("The check said yes, but Core held it unconfirmed: Some required evidence was not available");
    expect(judged.reason).toContain("look.1 (host.unread)");
    expect(judged.reason).not.toContain("could not tell");
  });

  it("never hands Core's own calls to the host's projector, so they are no gap and the yes stands", async () => {
    let handed: string[] = [];
    const counting: AutomationStudioJudgeEvidenceProjector = (input) => {
      handed = [...handed, String(input.definitionId)];
      return { role: "observation", evidence: {} };
    };
    const own = [
      { callId: "process.1", did: "core.set_result_processing", outcome: "result_processing.set", found: { ok: true, changed: true } },
      { callId: "recall.1", did: "core.recall_result", outcome: "core.recall.restored", found: { recalled: "read.1", restored: { page: "the loans page" } } },
      { callId: "read.1", did: "example.read_list", outcome: "answered", found: { said: "two loans" } }
    ];
    const { provider } = scripted([YES_LOANS]);
    // No act on the record, so no before or after state is asked of the trail: only the calls are projected.
    const judged = await judge(provider, summary(LOANS, { trail: own, acts: [] }), { projectJudgeEvidence: counting, judgeEvidenceVersion: 1 });
    expect(judged).toMatchObject({ verdict: "yes" });
    expect(handed).not.toContain("core.set_result_processing");
    expect(handed).not.toContain("core.recall_result");
    expect(handed).toContain("example.read_list");
  });
});
