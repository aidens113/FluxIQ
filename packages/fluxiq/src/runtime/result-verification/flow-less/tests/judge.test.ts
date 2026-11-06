// The Flow-less judge, through the real harness with a scripted provider: no model is
// called. The fixture is a kind of site no realistic scenario uses (a parish hall's
// bookings).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import { AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseScope } from "../../../llm/build-purse/index.ts";
import {
  AutomationStudioLlmProviderError,
  automationStudioLlmRequestEvidenceRefusal,
  runAutomationStudioLlmHarness,
  type AutomationStudioLlmProvider,
  type AutomationStudioLlmTaskRequest
} from "../../../llm/index.ts";
import { automationStudioLlmTaskMessages } from "../../../llm/provider-task/index.ts";
import { automationStudioFlowLessJudge } from "../judge.ts";
import { AUTOMATION_STUDIO_FLOW_LESS_QUESTION } from "../question.ts";
import type { AutomationStudioFlowLessJudgeInput, AutomationStudioFlowLessSummary } from "../types.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const BOOKED: AutomationStudioAttemptAct = { id: "act.1", what: "Booked the hall for the choir", where: "the bookings page", classes: ["create_new"], state: "landed" };

const summary = (extra: Partial<AutomationStudioFlowLessSummary> = {}): AutomationStudioFlowLessSummary => ({
  instructions: "Book the hall for the choir on the first free Tuesday and tell me which date it was.",
  rows: { totalRows: 2, truncated: false, columns: [{ id: "date", label: "Date" }, { id: "free", label: "free" }], rows: [{ date: "6 May", free: "no" }, { date: "13 May", free: "yes" }] },
  acts: [BOOKED],
  answerText: "It is booked for 13 May.",
  endView: { after: "end", view: { lines: ["Bookings: 3"] } },
  witnesses: { before: { bookings: 2 }, after: { bookings: 3 } },
  ...extra
});

type Script = { answer: Record<string, unknown> } | { reply: unknown } | { thrown: unknown };
const YES: Script = { answer: { answersRequest: "yes" } };
const NO: Script = { answer: { answersRequest: "no", observed: "The date told is not the one booked.", expected: "The first free Tuesday.", changed: "Book 13 May.", defects: [{ kind: "other", row: "13 May", requestWords: "first free Tuesday" }] } };
const UNSURE: Script = { answer: { answersRequest: "unknown", observed: "No view shows the date." } };

function scripted(script: Script): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        seen.push(request);
        if ("thrown" in script) throw script.thrown;
        if ("reply" in script) return script.reply as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: script.answer }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

/** One diagnosis per call, in order; the last repeats. */
function scriptedInOrder(answers: Record<string, unknown>[]): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        const answer = answers[Math.min(seen.length, answers.length - 1)];
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: answer }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

const judge = (provider: AutomationStudioLlmProvider, extra: Partial<AutomationStudioFlowLessJudgeInput> = {}) => automationStudioFlowLessJudge({
  summary: summary(), provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: ["rawMarkup"], ...extra
});

/** What the judge itself sends: the envelope's own ids and schema are the harness's. */
const shown = (request: AutomationStudioLlmTaskRequest | undefined) => JSON.stringify({ asked: request?.context.instructions.instructions.map((one) => [one.title, one.body, one.scopeKind]), summary: request?.context.resultSummary });

afterEach(() => { vi.useRealTimers(); });

describe("the Flow-less judge's answer", () => {
  it("says yes on a yes, in one call of the verification kind", async () => {
    const { provider, seen } = scripted(YES);
    const judged = await judge(provider);
    expect(judged).toMatchObject({ verdict: "yes", checkedWhat: "2 rows, 1 act on the site, the model's own answer, against what was asked for." });
    expect(judged.unanswered).toBeUndefined();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.taskKind).toBe("loop_verification");
  });

  it("says no on a no, with the judge's reading, in one call", async () => {
    const { provider, seen } = scripted(NO);
    const judged = await judge(provider);
    expect(judged.verdict).toBe("no");
    expect(judged.reason).toContain("The date told is not the one booked.");
    expect(judged.reason).toContain("The first free Tuesday.");
    // What the card says under "What failed": the check's own words, never a count and never "once".
    expect(judged.checkedWhat).toContain("The date told is not the one booked.");
    expect(judged.checkedWhat).not.toMatch(/once against|\d+ rows?/u);
    expect(seen).toHaveLength(1);
  });

  it("cuts the words of a long no to what a result may hold", async () => {
    const long = await judge(scripted({ answer: { answersRequest: "no", observed: "The order is wrong. ".repeat(60), expected: "Cheapest first.", changed: "Sort it.", defects: [{ kind: "other", row: "13 May", requestWords: "first free Tuesday" }] } }).provider);
    expect(long.checkedWhat!.length).toBeLessThanOrEqual(450);
  });

  it("says what an unsure was meant to settle", async () => {
    const judged = await judge(scripted(UNSURE).provider);
    expect(judged.checkedWhat).toBe("whether 2 rows, 1 act on the site, the model's own answer came to what was asked for.");
  });

  it("says unsure on an unknown, with what it doubted, in one call", async () => {
    const { provider, seen } = scripted(UNSURE);
    const judged = await judge(provider);
    expect(judged.verdict).toBe("unsure");
    expect(judged.reason).toContain("No view shows the date.");
    expect(judged.unanswered).toBeUndefined();
    expect(seen).toHaveLength(1);
  });

  it("holds a yes citing a cell the rows do not hold to unsure, as today's reader does", async () => {
    const { provider, seen } = scripted({ answer: { answersRequest: "yes", checked: [{ row: "13 May", column: "free", value: "maybe" }] } });
    const judged = await judge(provider);
    expect(judged.verdict).toBe("unsure");
    expect(judged.reason).toContain("not in the rows that were read");
    // The identical unmatched citation again is not asked a third time.
    expect(seen).toHaveLength(2);
  });

  it("asks again with Core's sentences and the citation rule, and takes a yes whose citations then hold", async () => {
    const { provider, seen } = scriptedInOrder([
      { answersRequest: "yes", checked: [{ row: "the third Tuesday", column: "free", value: "yes" }] },
      { answersRequest: "yes", checked: [{ row: "13 May", column: "free", value: "yes" }] }
    ]);
    const judged = await judge(provider);
    expect(judged).toMatchObject({ verdict: "yes" });
    expect(seen).toHaveLength(2);
    expect(seen[0]?.context.resultSummary).not.toHaveProperty("citationsNotMatched");
    const again = JSON.stringify(seen[1]?.context.resultSummary);
    expect(again).toContain('The cited row \\"the third Tuesday\\" is no row the result holds.');
    expect(again).toContain("1-based position");
    expect(again).toContain("first stored column");
  });

  it("stops asking and is unsure when the same unmatched citation comes back", async () => {
    const cited = { answersRequest: "yes", checked: [{ row: "the third Tuesday", column: "free", value: "yes" }] };
    const { provider, seen } = scriptedInOrder([cited, cited, cited]);
    expect(await judge(provider)).toMatchObject({ verdict: "unsure" });
    expect(seen).toHaveLength(2);
  });

  it("says the purse refused a re-ask, as it does a first call", async () => {
    const { provider } = scriptedInOrder([{ answersRequest: "yes", checked: [{ row: "the third Tuesday", column: "free", value: "yes" }] }]);
    let calls = 0;
    const run: AutomationStudioFlowLessJudgeInput["run"] = async (request) => {
      calls += 1;
      if (calls === 1) return runAutomationStudioLlmHarness(request);
      return { ok: false, diagnostics: [{ severity: "error", code: "llm_budget.run_cost_limit", message: "The purse is spent." }] } as unknown as Awaited<ReturnType<AutomationStudioFlowLessJudgeInput["run"]>>;
    };
    expect(await judge(provider, { run })).toMatchObject({ verdict: "not_judged", refusedByPurse: true });
    expect(calls).toBe(2);
  });

  it("takes a yes citing a cell the rows do hold", async () => {
    const { provider } = scripted({ answer: { answersRequest: "yes", checked: [{ row: "13 May", column: "free", value: "yes" }] } });
    expect((await judge(provider)).verdict).toBe("yes");
  });

  it("takes a yes with no rows at all: a request carried out is judged on what was done", async () => {
    const { provider, seen } = scripted(YES);
    expect(await judge(provider, { summary: { instructions: "Book the hall.", acts: [BOOKED] } })).toMatchObject({ verdict: "yes", checkedWhat: "1 act on the site, against what was asked for." });
    expect(seen[0]?.context.resultSummary?.recordSets).toEqual([]);
  });

  it("is not put off by a person's sentence holding both always and never", async () => {
    const { provider } = scripted(YES);
    expect((await judge(provider, { summary: summary({ instructions: "Always book a Tuesday and never a Monday." }) })).verdict).toBe("yes");
  });
});

describe("a call that gave nothing", () => {
  const notJudged = { verdict: "not_judged", unanswered: true };

  it("is not judged when the reply could not be read", async () => {
    const { provider, seen } = scripted({ thrown: new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Reply was not JSON.", false) });
    const judged = await judge(provider);
    expect(judged).toMatchObject(notJudged);
    expect(judged.reason).toContain("the judge's reply could not be read");
    expect(seen).toHaveLength(1);
  });

  it("is not judged when the reply is of no shape the harness reads", async () => {
    const { provider, seen } = scripted({ reply: { response: "yes", usage: USAGE } });
    expect(await judge(provider)).toMatchObject(notJudged);
    expect(seen).toHaveLength(1);
  });

  it("is not judged on a no listing no defect, which the harness calls unreadable (t752)", async () => {
    const { provider, seen } = scripted({ answer: { answersRequest: "no", observed: "Wrong." } });
    expect(await judge(provider)).toMatchObject(notJudged);
    expect(seen).toHaveLength(1);
  });

  it("is not judged on an act_wrong with nothing in `step`, which the question steers a judge away from", async () => {
    const { provider, seen } = scripted({ answer: { answersRequest: "no", observed: "Wrong date.", defects: [{ kind: "act_wrong", row: "13 May", requestWords: "first free Tuesday" }] } });
    expect(await judge(provider)).toMatchObject(notJudged);
    expect(seen).toHaveLength(1);
    expect(AUTOMATION_STUDIO_FLOW_LESS_QUESTION).toContain("as kind other");
  });

  it("is not judged on a reply that never says yes, no or unknown", async () => {
    const { provider, seen } = scripted({ answer: { observed: "Looks fine." } });
    expect(await judge(provider)).toMatchObject(notJudged);
    expect(seen).toHaveLength(1);
  });

  it("reads a reply cut off after its verdict from its whole fields, and a cut yes that fails them gave no answer (t653)", async () => {
    const cut = (diagnosis: Record<string, unknown>) => ({ reply: { response: { kind: "diagnosis", summary: "Reply cut off.", diagnosis, truncatedAfterVerdict: true }, usage: USAGE } });
    expect((await judge(scripted(cut({ answersRequest: "yes" })).provider)).verdict).toBe("yes");
    expect(await judge(scripted(cut({ answersRequest: "yes", checked: [{ row: "13 May", column: "free", value: "maybe" }] })).provider)).toMatchObject(notJudged);
  });

  it("is not judged on a timeout, and is not asked again", async () => {
    const { provider, seen } = scripted({ thrown: new AutomationStudioLlmProviderError("llm.provider_timeout", "Provider request ended.", true) });
    const judged = await judge(provider);
    expect(judged).toMatchObject(notJudged);
    expect(judged.reason).toContain("ran out of time");
    expect(seen).toHaveLength(1);
  });

  it("is not judged when a call never settles inside the deadline", async () => {
    vi.useFakeTimers();
    const provider: AutomationStudioLlmProvider = { metadata: { provider: "mock", model: "debug-model" }, runTask: () => new Promise(() => undefined) };
    const judged = judge(provider);
    await vi.advanceTimersByTimeAsync(120_001);
    expect(await judged).toMatchObject(notJudged);
  });

  // A locked key can hold a call for hours (t865). A call the deadline gave up on must not go on to be paid for with nobody to read it.
  it("stops the call it gave up on, so nothing is spent behind its deadline", async () => {
    vi.useFakeTimers();
    let stopped = false;
    const provider: AutomationStudioLlmProvider = { metadata: { provider: "mock", model: "debug-model" }, runTask: (_request, execution) => new Promise(() => { execution?.signal?.addEventListener("abort", () => { stopped = true; }); }) };
    const judged = judge(provider, { deadlineMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_001);
    expect(await judged).toMatchObject(notJudged);
    expect(stopped).toBe(true);
  });

  it("does not count time spent waiting for a person against its deadline", async () => {
    vi.useFakeTimers();
    let held = 0, stopped = false;
    const provider: AutomationStudioLlmProvider = { metadata: { provider: "mock", model: "debug-model" }, runTask: (_request, execution) => new Promise(() => { execution?.signal?.addEventListener("abort", () => { stopped = true; }); }) };
    const judged = judge(provider, { deadlineMs: 1_000, personHeldMs: () => held });
    held = 5_000;
    await vi.advanceTimersByTimeAsync(1_001);
    expect(stopped).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(stopped).toBe(true);
    expect(await judged).toMatchObject(notJudged);
  });

  it("is not judged on a refused key", async () => {
    const { provider, seen } = scripted({ thrown: new AutomationStudioLlmProviderError("llm.provider_auth_failed", "Key refused.", false, 401) });
    expect(await judge(provider)).toMatchObject(notJudged);
    expect(seen).toHaveLength(1);
  });

  it("is not judged when the runner itself fails", async () => {
    const { provider } = scripted(YES);
    expect(await judge(provider, { run: async () => { throw new Error("unexplained"); } })).toMatchObject(notJudged);
  });

  it("says the purse refused it, and no call was sent", async () => {
    const { provider, seen } = scripted(YES);
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1, carriedUsd: 1 });
    const judged = await automationStudioLlmBuildPurseScope(purse, () => judge(provider));
    expect(judged).toMatchObject({ verdict: "not_judged", refusedByPurse: true });
    expect(judged.unanswered).toBeUndefined();
    expect(seen).toHaveLength(0);
  });

  it("calls the runner once, whatever it answers", async () => {
    for (const script of [YES, NO, UNSURE, { reply: { response: "yes" } }]) {
      const { provider } = scripted(script);
      const run = vi.fn(runAutomationStudioLlmHarness);
      await judge(provider, { run });
      expect(run).toHaveBeenCalledTimes(1);
    }
  });
});

describe("a cancellation", () => {
  it("throws, already cancelled", async () => {
    const { provider } = scripted(YES);
    const stop = new AbortController();
    const reason = new Error("stopped by the person");
    stop.abort(reason);
    await expect(judge(provider, { signal: stop.signal })).rejects.toBe(reason);
  });

  it("throws, cancelled while the call is out", async () => {
    const stop = new AbortController();
    const provider: AutomationStudioLlmProvider = { metadata: { provider: "mock", model: "debug-model" }, runTask: () => new Promise(() => undefined) };
    const judged = judge(provider, { signal: stop.signal });
    stop.abort(new Error("stopped by the person"));
    await expect(judged).rejects.toThrow("stopped by the person");
  });

  it("throws when the runner says it was cancelled", async () => {
    const { provider } = scripted(YES);
    const cancelled = Object.assign(new Error("cancelled"), { name: "AbortError" });
    await expect(judge(provider, { run: async () => { throw cancelled; } })).rejects.toBe(cancelled);
  });
});

describe("what the judge is shown", () => {
  it("asks whether what the person asked for was got, with rows, acts, the model's words, the end view and both witnesses", async () => {
    const { provider, seen } = scripted(YES);
    await judge(provider);
    const sent = seen[0]?.context.resultSummary as unknown as Record<string, unknown>;
    expect(sent.question).toBe(AUTOMATION_STUDIO_FLOW_LESS_QUESTION);
    expect(sent.recordSets).toEqual([expect.objectContaining({ recordCount: 2, columns: ["date", "free"], sampleRows: [{ date: "6 May", free: "no" }, { date: "13 May", free: "yes" }] })]);
    expect(sent.columnLabels).toEqual({ date: "Date" });
    expect(sent.acts).toEqual([{ what: BOOKED.what, where: BOOKED.where, classes: ["create_new"], state: "landed" }]);
    expect(sent.endView).toEqual({ after: "end", view: { lines: ["Bookings: 3"] } });
    expect(sent.witnesses).toEqual({ before: { bookings: 2 }, after: { bookings: 3 } });
    expect(seen[0]?.context.instructions.instructions.map((one) => one.body)).toEqual(["Book the hall for the choir on the first free Tuesday and tell me which date it was."]);
  });

  it("says nothing of a Flow, its steps or a trial", async () => {
    const { provider, seen } = scripted(YES);
    await judge(provider);
    expect(shown(seen[0])).not.toMatch(/flow|\bsteps?\b|\btrials?\b|buildTest|\bbuild\b/iu);
  });

  it("always marks the model's words as the model's", async () => {
    const { provider, seen } = scripted(YES);
    await judge(provider);
    expect((seen[0]?.context.resultSummary as unknown as { answerText: unknown }).answerText).toEqual({ author: "model", note: "The model's own words, not evidence.", text: "It is booked for 13 May." });
  });

  it("tells it to judge the change, and shows before and after", () => {
    expect(AUTOMATION_STUDIO_FLOW_LESS_QUESTION).toContain("Judge the change, not the absolute state");
    expect(AUTOMATION_STUDIO_FLOW_LESS_QUESTION).toContain("witnesses.before and witnesses.after");
  });

  // The same lists the in-run repair instruction is held to (`../../../llm/harness/tests/in-run-repair-slot.test.ts`).
  it("names none of the ten realistic scenarios, their sites or their tasks", () => {
    const SCENARIOS = ["everything-store", "crossborder-marketplace", "bigbox-retail", "job-board", "local-classifieds", "auction-marketplace", "photo-social", "social-network-feed", "company-website", "professional-network"];
    const SITE_WORDS = /store|shop|marketplace|retail|bigbox|crossborder|classified|auction|photo|social|network|feed|company|website|professional|product|seller|listing|follow|like\b|post\b|profile|resume|vacanc|apply/iu;
    const LAB_TASK_WORDS = /friend|earbud|kettle|basket|cart\b|towel|napkin|dish soap|pickup|watchlist|bid\b|auction|coupon|connection|invitation|saved item|classified|giveaway|glaze|moon jar|quote|gas engineer|job|rust role|group post|feed|digest|open day|rating|shirt|colour|size\b|quantity|rate limit|brightaisle|farbazaar|valueridge|kerbfind|guildline|hammerline|circleway|voltbay|tidewell/iu;
    const text = AUTOMATION_STUDIO_FLOW_LESS_QUESTION.toLowerCase();
    for (const scenario of SCENARIOS) {
      expect(text).not.toContain(scenario);
      for (const word of scenario.split("-")) expect(text, word).not.toMatch(new RegExp(`\\b${word}\\b`, "u"));
    }
    expect(text.match(SITE_WORDS)?.[0]).toBeUndefined();
    expect(text.match(LAB_TASK_WORDS)?.[0]).toBeUndefined();
  });

  it("is a request a real provider's pre-flight check sends", async () => {
    const { provider, seen } = scripted(YES);
    await judge(provider);
    expect(seen[0]?.deniedEvidenceKeys).toEqual(["rawMarkup"]);
    expect(automationStudioLlmRequestEvidenceRefusal(seen[0]!)).toBeUndefined();
    // The user message carries the same summary, without the key today's prompt reads steps from.
    const user = automationStudioLlmTaskMessages(seen[0]!).find((message) => message.role === "user")?.content ?? "";
    expect(user).toContain("Judge the change");
    expect(user).not.toContain("\"flowShape\"");
  });
});

describe("what is screened", () => {
  const SECRET = "sk-abcdef1234567890abcdef1234";

  it("withholds a credential in a row, a denied column and a view holding either, and says so", async () => {
    const { provider, seen } = scripted(YES);
    await judge(provider, {
      summary: summary({
        rows: { totalRows: 1, truncated: false, columns: [{ id: "date", label: "Date" }, { id: "rawMarkup", label: "Markup" }], rows: [{ date: SECRET, rawMarkup: "<b>13 May</b>" }] },
        endView: { view: { rawMarkup: "<b>3</b>" } },
        witnesses: { before: { token: SECRET }, after: { bookings: 3 } },
        answerText: `The key is ${SECRET}.`,
        acts: [{ ...BOOKED, what: `Used ${SECRET}` }]
      })
    });
    const request = seen[0]!;
    const words = JSON.stringify(request.context.resultSummary);
    expect(words).not.toContain(SECRET);
    expect(words).not.toContain("<b>");
    expect(words).not.toContain("rawMarkup");
    const sent = request.context.resultSummary as unknown as { withheld: boolean; recordSets: { sampleRows: unknown[] }[]; witnesses: unknown; acts: { what: string }[]; answerText?: unknown };
    expect(sent.withheld).toBe(true);
    expect(sent.recordSets[0]?.sampleRows).toEqual([{ date: "[withheld]" }]);
    expect(sent.witnesses).toEqual({ after: { bookings: 3 } });
    expect(sent.acts[0]?.what).toBe("(withheld)");
    expect(sent.answerText).toBeUndefined();
    expect(automationStudioLlmRequestEvidenceRefusal(request)).toBeUndefined();
  });

  it("screens the judge's own reason, which goes back to a model and to the chat", async () => {
    const { provider } = scripted({ answer: { answersRequest: "no", observed: `It used ${SECRET}.`, expected: "A date.", changed: "Read the page again.", defects: [{ kind: "other", row: "13 May", requestWords: "a date" }] } });
    const judged = await judge(provider);
    expect(judged.verdict).toBe("no");
    expect(judged.reason).not.toContain(SECRET);
    expect(judged.reason).toContain("A date.");
  });

  it("says a truncated set was truncated", async () => {
    const { provider, seen } = scripted(YES);
    await judge(provider, { summary: summary({ rows: { totalRows: 900, truncated: true, columns: [{ id: "date", label: "date" }], rows: [{ date: "6 May" }] } }) });
    expect(seen[0]?.context.resultSummary).toMatchObject({ withheld: true, totalRecordCount: 900, recordSets: [{ truncated: true, recordCount: 900 }] });
  });
});
