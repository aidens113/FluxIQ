// A project build's task checklist beside the instructions (unit A9): without
// one, the judge's request is byte for byte what it was; with one, the parts
// and what nobody asked for ride as a labelled section subordinate to the
// instructions, on every call. No model is called: the provider is scripted.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { verifyAutomationStudioRunResult, type AutomationStudioResultVerificationRequest } from "../../verify.ts";
import { automationStudioBuildTestJudge } from "../judge.ts";
import { automationStudioBuildTestResultSummary } from "../summary.ts";
import { automationStudioBuildTestSummaryWithTaskChecklist, type AutomationStudioBuildTestTaskChecklist } from "../task-checklist.ts";
import { PICKUP_CART, RUN_40_CLAIMS, RUN_40_STEPS, run40 } from "./live-run-drafts.ts";
import { DENIED, SITE, replayed, report, verified } from "./draft-steps.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

const INSTRUCTION: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: PICKUP_CART,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

/** A checklist of the kind a supervisor writes, worded for no realistic scenario. */
const CHECKLIST: AutomationStudioBuildTestTaskChecklist = {
  parts: [
    { id: "p1", words: "open the archive index", goalFacts: ["The archive index is shown"], lastingActs: [] },
    { id: "p2", words: "record each volume's title", goalFacts: ["Every volume's title is recorded"], lastingActs: ["create_new"] }
  ],
  notAsked: ["Keeping only volumes from one decade", "A column for the binding"]
};

function scripted(): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        seen.push(structuredClone(request));
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "yes" } }, usage: USAGE };
      }
    }
  };
}

const summary = () => automationStudioBuildTestResultSummary({
  steps: RUN_40_STEPS, report: report([...RUN_40_STEPS.slice(0, -1).map(replayed), verified(run40.towelsAdd)]), nodes: [],
  instructionText: PICKUP_CART, result: { summary: "Added.", acts: RUN_40_CLAIMS }, startLocation: SITE, deniedEvidenceKeys: DENIED
});

const judge = (provider: AutomationStudioLlmProvider, verify?: (request: AutomationStudioResultVerificationRequest) => ReturnType<typeof verifyAutomationStudioRunResult>) =>
  automationStudioBuildTestJudge({ instructions: [INSTRUCTION], deniedEvidenceKeys: DENIED, projectId: "project-1", flowId: "flow-1", provider, ...(verify ? { verify } : {}) });

/** A request as bytes, with the ids every judgement and call mints afresh (run id, request id, idempotency key) fixed. */
const bytes = (request: AutomationStudioLlmTaskRequest | undefined) => JSON.stringify(request).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gu, "<minted>");

describe("the build-test judge without a checklist", () => {
  it("hands verify the very summary it was given, as before", async () => {
    const given = summary();
    const verified: AutomationStudioResultVerificationRequest[] = [];
    const { provider } = scripted();
    const spy = async (request: AutomationStudioResultVerificationRequest) => {
      verified.push(request);
      return await verifyAutomationStudioRunResult(request);
    };
    await judge(provider, spy)({ summary: given });
    expect(verified[0]?.summary).toBe(given);
    expect(verified[0]?.summary).not.toHaveProperty("taskChecklist");
  });

  it("sends the provider the same bytes with the field absent, and with the checklist the checklist is the only difference", async () => {
    const without = scripted();
    await judge(without.provider)({ summary: summary() });
    const absent = scripted();
    await judge(absent.provider)({ summary: summary(), taskChecklist: undefined });
    expect(without.seen).toHaveLength(2);
    expect(absent.seen.map(bytes)).toEqual(without.seen.map(bytes));

    const withList = scripted();
    await judge(withList.provider)({ summary: summary(), taskChecklist: CHECKLIST });
    expect(withList.seen).toHaveLength(2);
    // Less the section itself and the input estimate it grows, the request is the same bytes.
    const stripped = withList.seen.map((request, index) => {
      expect(request.estimatedInputTokens).toBeGreaterThan(without.seen[index]!.estimatedInputTokens!);
      const { taskChecklist: _list, ...rest } = request.context.resultSummary as unknown as Record<string, unknown>;
      return bytes({ ...request, estimatedInputTokens: without.seen[index]!.estimatedInputTokens, context: { ...request.context, resultSummary: rest } } as AutomationStudioLlmTaskRequest);
    });
    expect(stripped).toEqual(without.seen.map(bytes));
  });
});

describe("the build-test judge with a checklist", () => {
  it("sends both lists, labelled as subordinate to the instructions, on the first call and its confirmation, with the instructions unchanged", async () => {
    const { provider, seen } = scripted();
    const verdict = await judge(provider)({ summary: summary(), taskChecklist: CHECKLIST });
    expect(verdict.verdict).toBe("yes");
    for (const request of seen) {
      const section = (request.context.resultSummary as unknown as { taskChecklist: Record<string, unknown> }).taskChecklist;
      expect(Object.keys(section)).toEqual(["supplementary", "asked", "notAsked"]);
      expect(section.supplementary).toMatch(/^Supplementary to the instructions, never instead of them/u);
      expect(section.supplementary).toContain("The instructions are the only authority");
      expect(section.supplementary).toContain("judge by the instructions");
      expect(section.asked).toEqual([
        { part: "p1", words: "open the archive index", goalFacts: ["The archive index is shown"], lastingActs: [] },
        { part: "p2", words: "record each volume's title", goalFacts: ["Every volume's title is recorded"], lastingActs: ["create_new"] }
      ]);
      expect(section.notAsked).toEqual(CHECKLIST.notAsked);
      expect(JSON.stringify(request.context)).toContain(PICKUP_CART);
    }
  });

  // t594 (A8 launch 7): a subflow's judges, told only its own parts, passed a trial that also did another subflow's lasting press.
  it("for a subflow trial, names the other subflows' parts as out of its scope and says a step doing one is judged no; a whole trial's section is unchanged", () => {
    const whole = (automationStudioBuildTestSummaryWithTaskChecklist(summary(), CHECKLIST) as unknown as { taskChecklist: Record<string, unknown> }).taskChecklist;
    const scoped = (automationStudioBuildTestSummaryWithTaskChecklist(summary(), { ...CHECKLIST, parts: CHECKLIST.parts.slice(1), outOfScope: [{ id: "p1", words: "open the archive index" }] }) as unknown as { taskChecklist: Record<string, unknown> }).taskChecklist;
    expect(Object.keys(scoped)).toEqual(["supplementary", "asked", "notAsked", "outOfScope"]);
    expect(scoped.outOfScope).toEqual([{ part: "p1", words: "open the archive index" }]);
    expect(String(scoped.supplementary).startsWith(String(whole.supplementary))).toBe(true);
    expect(scoped.supplementary).toContain("is outside this subflow");
    expect(scoped.supplementary).toContain("answer no");
    const none = (automationStudioBuildTestSummaryWithTaskChecklist(summary(), { ...CHECKLIST, outOfScope: [] }) as unknown as { taskChecklist: Record<string, unknown> }).taskChecklist;
    expect(none).toEqual(whole);
  });

  // t676 (A8 crossborder round 1): a judge excused a press as non-lasting on its own `consequences: none`, though Core had recorded it possibly lasting.
  it("for a subflow trial, names its possibly lasting steps and says their own label is no proof they left nothing", () => {
    const scoped = (automationStudioBuildTestSummaryWithTaskChecklist(summary(), { ...CHECKLIST, parts: CHECKLIST.parts.slice(1), outOfScope: [{ id: "p1", words: "open the archive index" }], possiblyLasting: ["node.keep"] }) as unknown as { taskChecklist: Record<string, unknown> }).taskChecklist;
    expect(Object.keys(scoped)).toEqual(["supplementary", "asked", "notAsked", "outOfScope", "possiblyLasting"]);
    expect(scoped.possiblyLasting).toEqual(["node.keep"]);
    expect(scoped.supplementary).toContain("Such a step's own consequences label is no proof it left nothing");
    const none = (automationStudioBuildTestSummaryWithTaskChecklist(summary(), { ...CHECKLIST, possiblyLasting: [] }) as unknown as { taskChecklist: Record<string, unknown> }).taskChecklist;
    expect(none).not.toHaveProperty("possiblyLasting");
    expect(none.supplementary).not.toContain("possiblyLasting");
  });

  // t775: a part's typed effect and what must stay as it is are judged by the change from before the run.
  it("carries each part's typed effect and what must stay unchanged, saying each is judged by the change; a checklist with neither is unchanged", () => {
    const whole = (automationStudioBuildTestSummaryWithTaskChecklist(summary(), CHECKLIST) as unknown as { taskChecklist: Record<string, unknown> }).taskChecklist;
    const typed: AutomationStudioBuildTestTaskChecklist = {
      ...CHECKLIST,
      parts: [CHECKLIST.parts[0]!, { ...CHECKLIST.parts[1]!, effect: { kind: "change", direction: "adds", count: 2, what: "volume record" } }],
      unchanged: ["Other volumes' records"]
    };
    const section = (automationStudioBuildTestSummaryWithTaskChecklist(summary(), typed) as unknown as { taskChecklist: Record<string, unknown> }).taskChecklist;
    expect(Object.keys(section)).toEqual(["supplementary", "asked", "notAsked", "unchanged"]);
    expect((section.asked as Array<Record<string, unknown>>)[1]?.effect).toEqual({ kind: "change", direction: "adds", count: 2, what: "volume record" });
    expect((section.asked as Array<Record<string, unknown>>)[0]).not.toHaveProperty("effect");
    expect(section.unchanged).toEqual(["Other volumes' records"]);
    expect(String(section.supplementary).startsWith(String(whole.supplementary))).toBe(true);
    expect(section.supplementary).toContain("never by the state after alone");
    expect(whole.supplementary).not.toContain("effect");
  });

  it("leaves the given summary untouched", () => {
    const given = summary();
    const before = JSON.stringify(given);
    const judged = automationStudioBuildTestSummaryWithTaskChecklist(given, CHECKLIST);
    expect(judged).not.toBe(given);
    expect(JSON.stringify(given)).toBe(before);
    expect(judged.buildTest).toBe(given.buildTest);
  });

  // t757 (a request for records confirmed with none kept): a part's declared answer rides on its asked entry, labelled; a checklist declaring none is as before.
  it("carries a part's declared answer of records and says what it asks; a checklist declaring none is byte for byte as before", () => {
    const declared: AutomationStudioBuildTestTaskChecklist = { ...CHECKLIST, parts: [CHECKLIST.parts[0]!, { ...CHECKLIST.parts[1]!, answer: { kind: "records", columns: ["title", "year"] } }] };
    const section = (automationStudioBuildTestSummaryWithTaskChecklist(summary(), declared) as unknown as { taskChecklist: { supplementary: string; asked: Array<Record<string, unknown>> } }).taskChecklist;
    expect(section.asked[1]).toEqual({ part: "p2", words: "record each volume's title", goalFacts: ["Every volume's title is recorded"], lastingActs: ["create_new"], answer: { kind: "records", columns: ["title", "year"] } });
    expect(section.asked[0]).not.toHaveProperty("answer");
    expect(section.supplementary).toContain("answer.columns");
    expect(section.supplementary).toContain("recordSets");
    const plain = (automationStudioBuildTestSummaryWithTaskChecklist(summary(), CHECKLIST) as unknown as { taskChecklist: { supplementary: string } }).taskChecklist;
    expect(plain.supplementary).not.toContain("answer");
    expect(section.supplementary.startsWith(plain.supplementary)).toBe(true);
  });
});

// User rule: model guidance never teaches to the test. The section's label is
// guidance the judge reads; it must name none of the ten realistic scenarios,
// their sites' plain words or their tasks (the lists
// `llm/harness/tests/in-run-repair-slot.test.ts` holds its instruction to).
describe("the checklist's label", () => {
  const SCENARIOS = ["everything-store", "crossborder-marketplace", "bigbox-retail", "job-board", "local-classifieds", "auction-marketplace", "photo-social", "social-network-feed", "company-website", "professional-network"];
  const SITE_WORDS = /store|shop|marketplace|retail|bigbox|crossborder|classified|auction|photo|social|network|feed|company|website|professional|product|seller|listing|follow|like\b|post\b|profile|resume|vacanc|apply/iu;
  const LAB_TASK_WORDS = /friend|earbud|kettle|basket|cart\b|towel|napkin|dish soap|pickup|watchlist|bid\b|auction|coupon|connection|invitation|saved item|classified|giveaway|glaze|moon jar|quote|gas engineer|job|rust role|group post|feed|digest|open day|rating|shirt|colour|size\b|quantity|rate limit|brightaisle|farbazaar|valueridge|kerbfind|guildline|hammerline|circleway|voltbay|tidewell/iu;

  it("names none of the ten realistic scenarios, their sites or their tasks", () => {
    const declared = [{ id: "p8", words: "", goalFacts: [], lastingActs: [], answer: { kind: "records" as const, columns: [] } }];
    const section = (automationStudioBuildTestSummaryWithTaskChecklist(summary(), { parts: declared, notAsked: [], outOfScope: [{ id: "p9", words: "" }], possiblyLasting: ["n1"] }) as unknown as { taskChecklist: Record<string, unknown> }).taskChecklist;
    const text = `${String(section.supplementary)}\n${Object.keys(section).join("\n")}\n${["part", "words", "goalFacts", "lastingActs", "answer", "kind", "records", "columns"].join("\n")}`;
    for (const scenario of SCENARIOS) {
      expect(text.toLowerCase()).not.toContain(scenario);
      for (const word of scenario.split("-")) expect(text.toLowerCase(), word).not.toMatch(new RegExp(`\\b${word}\\b`, "u"));
    }
    expect(text.match(SITE_WORDS)?.[0]).toBeUndefined();
    expect(text.match(LAB_TASK_WORDS)?.[0]).toBeUndefined();
  });
});
