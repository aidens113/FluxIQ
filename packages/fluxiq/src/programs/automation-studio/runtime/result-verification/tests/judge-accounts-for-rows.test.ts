// A judge cannot pass rows that name the asked item, nor steer a repair with
// rows the result contradicts: live run `run-muw60j7c-bb7c9a62` (debug C-2, C-5).
//
// C-2: both build-test judges said yes though the name condition alone left out
// three pairs of earbuds sold with a charging case. A yes on a summary carrying
// `leftOutNamingTheItem` that does not name each of them is not a yes.
// C-5: the result judge said the Plus condition "alone excluded" B0J5MCMBAY and
// B07Z1RZGJG; both are in the stored result, and the re-author followed it.
// t599 (A8 everything-store `run-mv8id5vg-ed7b89fe`): 48 yeses over exact
// answers were held because rows a presence and an absence test alone left
// out, which Core had measured, were each asked a quote, and labels sharing
// ten-word starts could not be named; Core now settles those rows and gives a
// row a judge must still name a short id.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../llm/index.ts";
import { automationStudioBuildTestJudge } from "../build-test/index.ts";
import { automationStudioResultVerificationAgreement } from "../agreement/index.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES } from "../repair-directive.ts";
import {
  AutomationStudioRequestRowId, automationStudioRequestRowLabel, automationStudioRequestRowNaming, automationStudioRequestWording,
  automationStudioResultSummaryWithLeftOutNamingTheItem, automationStudioResultSummaryWithRowIds
} from "../request-rows/index.ts";
import { BADGE_CATALOGUE_INSTRUCTION, BADGE_CATALOGUE_PROMOTED, badgeCatalogueSummary } from "../value-readings/tests/badge-catalogue.ts";
import {
  PRESENCE_CATALOGUE_INSTRUCTION, PRESENCE_CATALOGUE_KEPT, PRESENCE_CATALOGUE_NO_MEMBER, PRESENCE_CATALOGUE_PROMOTED, PRESENCE_CATALOGUE_SPARE,
  presenceCatalogueSummary, type PresenceCatalogueWitness
} from "../request-rows/tests/presence-catalogue.ts";
import {
  RUN_MUW60J7C_PAIRS_LEFT_OUT, RUN_MUW60J7C_REQUEST, RUN_MUW60J7C_RESULT_JUDGE, RUN_MUW60J7C_TEST_JUDGE,
  runMuw60j7cRunSummary, runMuw60j7cTestSummary
} from "../request-rows/tests/run-muw60j7c.ts";
import { RUN_MV6BG8D8_EARBUDS_PROCESSED_OUT, runMv6bg8d8RunSummary } from "../request-rows/tests/run-mv6bg8d8.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES, automationStudioResultVerdict } from "../verdict/index.ts";
import { verifyAutomationStudioRunResult } from "../verify.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const FINDING = AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES.leftOutNamingTheItem;

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Evidence-guided generation goal", body: RUN_MUW60J7C_REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

/** The build test's summary as its judge is shown it. */
const flaggedTest = () => automationStudioResultSummaryWithLeftOutNamingTheItem(runMuw60j7cTestSummary(), [instruction]);

/** A provider that gives each call its reply in turn. */
function scripted(replies: readonly { summary: string; diagnosis: Record<string, unknown> }[]): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        const reply = replies[Math.min(seen.length, replies.length - 1)]!;
        seen.push(request);
        return { response: { kind: "diagnosis", summary: reply.summary, diagnosis: reply.diagnosis }, usage: USAGE } as never;
      }
    }
  };
}

describe("a yes that does not account for the rows that name the asked item (C-2)", () => {
  it("is does_not_answer, with Core's finding and fix line naming the condition, the item, the rest and the rows", () => {
    const { summary, diagnosis } = RUN_MUW60J7C_TEST_JUDGE;
    const verification = automationStudioResultVerdict({ summary: flaggedTest(), diagnosis: diagnosis as never, summaryText: summary, basis: "model" });
    expect(verification.verdict).toBe("does_not_answer");
    // The code the runtime routes a wrong answer to its re-author on (`recovery/refuted-result/reauthor.ts`).
    expect(verification.code).toBe(AUTOMATION_STUDIO_RESULT_VERDICT_CODES.doesNotAnswer);
    const finding = verification.repair?.findings.find((candidate) => candidate.code === FINDING);
    expect(finding?.detail).toContain("Step 10");
    expect(finding?.detail).toContain("\"name\"");
    expect(finding?.detail).toContain("\"wireless earbuds\"");
    expect(finding?.detail).toContain("\"charging cases\"");
    const fix = verification.repair?.fix.join("\n") ?? "";
    for (const row of RUN_MUW60J7C_PAIRS_LEFT_OUT) expect(fix).toContain(row);
    expect(fix).toContain("\"name\"");
    expect(verification.repair?.checked?.join("\n")).toContain(RUN_MUW60J7C_PAIRS_LEFT_OUT[0]);
    expect(verification.failure?.expected).toContain("Lumo Audio Drift Pro");
  });

  it("stands when the reply names each row, by a prefix that tells it apart or by an id", () => {
    const observed = [
      "Lumo Audio Drift Pro and Trevio T5 Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Wireless Charging Case are earbuds the request excludes because ...",
      "Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 36H Playtime, Touch Control, Built-in Mic, Ivory with Wireless Charging Case is excluded because ..."
    ].join(" ");
    const verification = automationStudioResultVerdict({ summary: flaggedTest(), diagnosis: { answersRequest: "yes", observed }, basis: "model" });
    expect(verification.verdict).toBe("answers");
  });

  it("is still does_not_answer when one row goes unnamed, and names only that row", () => {
    const observed = "Lumo Audio Drift Pro and Trevio T5 Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Wireless Charging Case are excluded.";
    const verification = automationStudioResultVerdict({ summary: flaggedTest(), diagnosis: { answersRequest: "yes", observed }, basis: "model" });
    expect(verification.verdict).toBe("does_not_answer");
    const fix = verification.repair?.fix.join("\n") ?? "";
    expect(fix).toContain(RUN_MUW60J7C_PAIRS_LEFT_OUT[1]);
    expect(fix).not.toContain(RUN_MUW60J7C_PAIRS_LEFT_OUT[0]);
  });

  it("counts as a no in the pair rules: two such yeses refute", () => {
    const { diagnosis } = RUN_MUW60J7C_TEST_JUDGE;
    const once = () => automationStudioResultVerdict({ summary: flaggedTest(), diagnosis: diagnosis as never, basis: "model" });
    const outcome = automationStudioResultVerificationAgreement({ first: once(), second: once(), confirmAnswer: true });
    expect(outcome.verdict).toBe("does_not_answer");
    expect(outcome.calls).toBe(2);
  });

  it("the build-test judge sent the run's two yeses answers no, with the finding, through the real verify", async () => {
    const { provider, seen } = scripted([RUN_MUW60J7C_TEST_JUDGE, RUN_MUW60J7C_TEST_JUDGE]);
    const judge = automationStudioBuildTestJudge({ instructions: [instruction], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });
    const verdict = await judge({ summary: runMuw60j7cTestSummary(), budget: { maxCostUsd: 0.2 } });
    expect(seen).toHaveLength(2);
    // Both kinds of judge are shown the rows.
    expect(seen[0]?.context.resultSummary?.leftOutNamingTheItem?.[0]?.rows).toEqual(RUN_MUW60J7C_PAIRS_LEFT_OUT);
    expect(verdict).toMatchObject({ verdict: "no", findings: expect.arrayContaining([FINDING]) });
    expect(verdict.verdict === "no" ? verdict.checked?.join("\n") : "").toContain(RUN_MUW60J7C_PAIRS_LEFT_OUT[2]);
  });
});

describe("a no whose rows the result contradicts (C-5)", () => {
  it("carries Core's check: B0J5MCMBAY and B07Z1RZGJG are in the result, so advice resting on that reading is not supported", async () => {
    // The original reading contains both misread exclusions and a genuine
    // stored accessory; state that real defect explicitly under the new schema.
    const no = { ...RUN_MUW60J7C_RESULT_JUDGE, diagnosis: { ...RUN_MUW60J7C_RESULT_JUDGE.diagnosis,
      defects: [{ kind: "kept_not_asked", row: "Replacement Ear Tips for Wireless Earbuds, Memory Foam Eartips, 3 Pairs (S/M/L), Black", requestWords: "accessories" }] } };
    const { provider, seen } = scripted([no, no]);
    const report = await verifyAutomationStudioRunResult({
      projectId: "project-1", flowId: "flow-1", runId: "run-1", summary: runMuw60j7cRunSummary(), instructions: [instruction], deniedEvidenceKeys: [], provider
    });
    expect(report.outcome.performed && report.outcome.verdict).toBe("does_not_answer");
    const checked = report.outcome.performed ? report.outcome.repair?.checked ?? [] : [];
    const misread = checked.filter((line) => line.includes("the check misread which rows were left out; advice resting on that reading is not supported"));
    expect(misread.join("\n")).toContain("(B0J5MCMBAY) is in the result");
    expect(misread.join("\n")).toContain("(B07Z1RZGJG) is in the result");
    // The result judge is shown the flagged rows too.
    expect(seen[0]?.context.resultSummary?.leftOutNamingTheItem?.[0]?.rows).toEqual(RUN_MUW60J7C_PAIRS_LEFT_OUT);
  });
});

// t493, live run `run-mv6bg8d8-1a461436` (round 14, steps 0047, 0048 and 0064):
// the saved answer's `process.where` alone left out three pairs sold with a
// charging case, and four judges said yes over "5 filtered out as accessories".
describe("a yes over rows the saved answer's processing alone left out (t493)", () => {
  const judged = () => automationStudioResultSummaryWithLeftOutNamingTheItem(runMv6bg8d8RunSummary(), [instruction]);

  it("is refused when it does not name them, and the refusal names each row and the processing condition", () => {
    const observed = "Read all 5 pages; 17 rows kept, 2 duplicates, 5 filtered out as accessories, 10 stored. The result satisfies the request.";
    const verification = automationStudioResultVerdict({ summary: judged(), diagnosis: { answersRequest: "yes", observed }, basis: "model" });
    expect(verification.verdict).toBe("does_not_answer");
    expect(verification.code).toBe(AUTOMATION_STUDIO_RESULT_VERDICT_CODES.doesNotAnswer);
    const finding = verification.repair?.findings.find((candidate) => candidate.code === FINDING);
    expect(finding?.detail).toContain("recordOutput.process.where condition 2 (name not contains \"Charging Case\")");
    const fix = verification.repair?.fix.join("\n") ?? "";
    for (const row of RUN_MV6BG8D8_EARBUDS_PROCESSED_OUT) {
      expect(fix).toContain(row);
      expect(verification.repair?.checked?.join("\n")).toContain(row);
    }
  });

  it("stands when it names each row and says why the request excludes it", () => {
    const observed = `${RUN_MV6BG8D8_EARBUDS_PROCESSED_OUT.join("; ")}: each is excluded because ...`;
    expect(automationStudioResultVerdict({ summary: judged(), diagnosis: { answersRequest: "yes", observed }, basis: "model" }).verdict).toBe("answers");
  });

  it("is refused through the result judge too, whose request lists the rows and carries no testedLabel", async () => {
    const yes = { summary: "yes", diagnosis: { answersRequest: "yes", observed: "5 filtered out as accessories, 10 stored." } };
    const { provider, seen } = scripted([yes]);
    const report = await verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "run-1", summary: runMv6bg8d8RunSummary(), instructions: [instruction], deniedEvidenceKeys: [], provider });
    expect(report.outcome.performed && report.outcome.verdict).toBe("does_not_answer");
    expect(seen.length).toBeGreaterThan(0);
    for (const request of seen) {
      expect(JSON.stringify(request)).not.toContain("testedLabel");
      expect(request.context.resultSummary?.leftOutNamingTheItem?.flatMap((entry) => entry.rows)).toEqual(RUN_MV6BG8D8_EARBUDS_PROCESSED_OUT);
      // The judge's copy says Core's short id before each row a yes must still name (t599, `request-rows/row-id.ts`).
      const first = RUN_MV6BG8D8_EARBUDS_PROCESSED_OUT[0]!;
      expect(request.context.resultSummary?.recordSets[0]?.processing?.conditions?.[1]?.leftOutOnlyByThis).toContain(AutomationStudioRequestRowId.said(first, automationStudioRequestRowLabel(first)));
    }
  });
});

// t599: the same rules over rows Core measured. A yes quotes each presence
// condition once and names the text condition's row by its short id.
describe("a yes over rows a presence or absence test left out, which Core measured (t599)", () => {
  const catalogue = [PRESENCE_CATALOGUE_INSTRUCTION];
  const verdictOf = (reply: string, witness?: PresenceCatalogueWitness) => {
    const summary = presenceCatalogueSummary(witness);
    return automationStudioResultVerdict({ summary: automationStudioResultSummaryWithLeftOutNamingTheItem(summary, catalogue), diagnosis: { answersRequest: "yes", observed: reply }, basis: "model", wording: automationStudioRequestWording(catalogue, summary) });
  };
  const spareId = AutomationStudioRequestRowId.of(PRESENCE_CATALOGUE_SPARE);
  const PRESENCE = `Condition 1 (member is present) keeps what the request asks for: "with a member price".`;
  const ABSENCE = `Condition 2 (promoted is absent) does what it says: "leaving out promoted items".`;
  const TEXT_BY_ID = `Row ${spareId} is a nozzle pack, which the request excludes as "spare parts".`;

  it("are settled from each row's witness, with the sentence of what a yes must still show; the text condition's row is not", () => {
    const [member, promoted, name] = presenceCatalogueSummary().reads![0]!.conditions!;
    expect(member!.leftOutSettled).toEqual(PRESENCE_CATALOGUE_NO_MEMBER.map((row) => `${row} — member: (no value)`));
    expect(member!.settled).toContain("On each row in leftOutSettled the read found no member, so each fails condition 1 (member is present) as written");
    expect(member!.settled).toContain("quote, once, in a sentence that names condition 1 (member is present) or member, the request's own words asking for only rows that have it");
    expect(promoted!.leftOutSettled).toEqual(PRESENCE_CATALOGUE_PROMOTED);
    expect(promoted!.settled).toContain("the read found promoted, so each fails condition 2 (promoted is absent) as written");
    expect(promoted!.settled).toContain("asking for only rows without it");
    expect(name!.leftOutSettled).toBeUndefined();
  });

  it("take a yes that quotes the absence condition once, and the presence one, without a quote beside each row", () => {
    expect(verdictOf(`${PRESENCE} ${ABSENCE} ${TEXT_BY_ID}`)).toMatchObject({ verdict: "answers" });
  });

  it("still hold a yes that never quotes the absence condition, asking for that one quote and not for its rows", () => {
    const held = verdictOf(`${PRESENCE} ${TEXT_BY_ID}`);
    expect(held).toMatchObject({ verdict: "unsure", code: "core.result.exclusion_evidence_missing" });
    expect(held.exclusionEvidenceMissing).toHaveLength(1);
    const [line] = held.exclusionEvidenceMissing!;
    expect(line).toContain("in a sentence that names condition 2 (promoted is absent)");
    expect(line).toContain("the request's words asking for what that condition tests");
    for (const row of PRESENCE_CATALOGUE_PROMOTED) expect(line).not.toContain(row);
  });

  it("settle nothing where the witness could not read the value: those rows are quoted for row by row, as before", () => {
    expect(presenceCatalogueSummary({ state: "unavailable" }).reads![0]!.conditions![0]!.leftOutSettled).toBeUndefined();
    const held = verdictOf(`${PRESENCE} ${ABSENCE} ${TEXT_BY_ID}`, { state: "unavailable" });
    expect(held).toMatchObject({ verdict: "unsure", code: "core.result.exclusion_evidence_missing" });
    expect(held.exclusionEvidenceMissing?.join("\n")).toContain(PRESENCE_CATALOGUE_NO_MEMBER[0]);
  });

  it("show a row a judge must still name with its short id, on the judge's copy only", () => {
    const summary = presenceCatalogueSummary();
    const before = structuredClone(summary);
    const copy = automationStudioResultSummaryWithRowIds(summary);
    const [member, promoted, name] = copy.reads![0]!.conditions!;
    expect(name!.leftOutOnlyByThis).toEqual([`[row ${spareId}] ${PRESENCE_CATALOGUE_SPARE}`]);
    // Settled rows need no naming, so they carry none.
    expect(member!.leftOutOnlyByThis).toEqual(summary.reads![0]!.conditions![0]!.leftOutOnlyByThis);
    expect(promoted!.leftOutOnlyByThis).toEqual(PRESENCE_CATALOGUE_PROMOTED);
    expect(summary).toEqual(before);
    expect(automationStudioResultSummaryWithRowIds(copy)).toEqual(copy);
  });

  it("count a naming by that id, and by the old distinguishing prefix; four shared words name nothing", () => {
    const pool = [...PRESENCE_CATALOGUE_KEPT, ...PRESENCE_CATALOGUE_NO_MEMBER, ...PRESENCE_CATALOGUE_PROMOTED, PRESENCE_CATALOGUE_SPARE];
    expect(automationStudioRequestRowNaming(PRESENCE_CATALOGUE_SPARE, pool).prefix.length).toBeGreaterThan(6);
    expect(verdictOf(`${PRESENCE} ${ABSENCE} The ${PRESENCE_CATALOGUE_SPARE.split(",")[0]} is excluded as "spare parts".`).verdict).toBe("answers");
    const shared = verdictOf(`${PRESENCE} ${ABSENCE} The Hollis Garden Hose Expandable is excluded as "spare parts".`);
    expect(shared).toMatchObject({ verdict: "unsure", code: "core.result.exclusion_evidence_missing" });
    expect(shared.exclusionEvidenceMissing?.join("\n")).toContain(PRESENCE_CATALOGUE_SPARE);
  });

  it("send the result judge the id, and take its yes naming the row by it", async () => {
    const { provider, seen } = scripted([{ summary: "yes", diagnosis: { answersRequest: "yes", observed: `${PRESENCE} ${ABSENCE} ${TEXT_BY_ID}` } }]);
    const report = await verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "run-1", summary: presenceCatalogueSummary(), instructions: catalogue, deniedEvidenceKeys: [], provider, confirmAnswer: true });
    expect(report.outcome.performed && report.outcome.verdict).toBe("answers");
    expect(seen.length).toBe(2);
    for (const request of seen) expect(request.context.resultSummary?.reads?.[0]?.conditions?.[2]?.leftOutOnlyByThis).toEqual([`[row ${spareId}] ${PRESENCE_CATALOGUE_SPARE}`]);
  });
});

// t758: the line a held yes is sent says what kind of condition Core settled the
// rows by, carried from the settling, not read back from the condition's wording.
describe("a yes over rows a presence exclusion with no column left out (t758)", () => {
  const catalogue = [BADGE_CATALOGUE_INSTRUCTION];
  const summary = badgeCatalogueSummary();
  const verdictOf = (reply: string) => automationStudioResultVerdict({ summary: automationStudioResultSummaryWithLeftOutNamingTheItem(summary, catalogue), diagnosis: { answersRequest: "yes", observed: reply }, basis: "model", wording: automationStudioRequestWording(catalogue, summary) });

  it("settles the rows as a presence test, worded by what the read found", () => {
    const [condition] = summary.reads![0]!.conditions!;
    expect(condition!.condition).toBe(`the item's text "Promoted" is absent (a row is kept only when it has no "Promoted")`);
    expect(condition!.leftOutSettled).toEqual(BADGE_CATALOGUE_PROMOTED);
    expect(condition!.settledKind).toBe("presence");
  });

  it("holds a yes that never names the condition, asking for the words that ask for what it tests and never a bound", () => {
    const held = verdictOf('The two promoted trails are left out, as the request says: "leaving out promoted items".');
    expect(held).toMatchObject({ verdict: "unsure", code: "core.result.exclusion_evidence_missing" });
    const [line] = held.exclusionEvidenceMissing!;
    expect(line).toContain("the request's words asking for what that condition tests");
    expect(line).not.toContain("bound");
    for (const row of BADGE_CATALOGUE_PROMOTED) expect(line).not.toContain(row);
  });

  it("takes a yes that names condition 1 beside a quote of the request", () => {
    expect(verdictOf('Condition 1 leaves out what the request excludes: "leaving out promoted items".')).toMatchObject({ verdict: "answers" });
  });
});
