// A judge reply cut off after its verdict is read for that verdict (t653).
//
// Live run `run-mva6mlo8-f519063c`: four of 21 judge replies repeated one
// sentence inside `summary` until the provider's 8,192-token ceiling cut them
// off (`llm.provider_output_truncated`), and each was lost and drawn again. The
// verification now asks for `kind` and `diagnosis` before `summary`, and a
// reply whose diagnosis closed before the cut is read from those whole fields
// (`../../../../llm/deepseek/verdict-before-cut.ts`, `../../../verify.ts`). A no or an
// unknown read so is the answer it gave; a yes counts only if it passes, on the
// fields that arrived whole, every check a yes must pass.
//
// End to end through Core's DeepSeek adapter: each reply below is a provider
// envelope served to the adapter's own fetch, so the envelope, the harness and
// the verification all read it as they would live. No model is called. The
// catalogue is generic (`../../../request-rows/tests/request-words-fixture.ts`), not
// a scenario the Lab measures.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../../model/index.ts";
// The verification first: the adapter's barrel reaches back into this module's
// own imports, and loaded first it would find them not yet evaluated.
import { verifyAutomationStudioRunResult } from "../../../verify.ts";
import { REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS, requestWordsRunSummary } from "../../../request-rows/tests/request-words-fixture.ts";
import { createAutomationStudioDeepSeekProvider } from "../../../../llm/deepseek/index.ts";

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Collect the catalogue", body: REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

/** The sentence the live replies repeated, until the provider stopped them. */
const LOOP = "That matches. The result seems to satisfy the request. ".repeat(400);
const NO = {
  expected: "Every garden tool on the first page, less out-of-stock items and replacement parts.",
  observed: "The read kept 3 rows; condition 1 (stock is present) alone left out the Copper Garden Tools Pair.",
  changed: "Nothing in the conditions needs to change; a further page was not read.",
  answersRequest: "no"
};
const UNKNOWN = { observed: "The read kept 3 rows; whether a second page exists is not shown.", answersRequest: "unknown" };
/** The quotes a yes owes beside each row a condition alone left out (`../../../verdict/`, t515). */
const QUOTES = "Copper Garden Tools Pair is left out, as the request says \"leaving out out-of-stock items\". Replacement Handle for Garden Tools is left out, as the request says \"replacement parts\".";
const YES_QUOTING = { observed: `The read kept 3 rows. ${QUOTES}`, answersRequest: "yes" };
const YES_BARE = { observed: "The read kept 3 rows, each a garden tool in stock.", answersRequest: "yes" };

type Reply = { finish: "stop" | "length"; content: string };

/** A reply that wrote its diagnosis, then a summary that looped until it was cut. */
const cutAfter = (diagnosis: Record<string, string>, summary = "The read kept 3 rows. "): Reply =>
  ({ finish: "length", content: `{"kind":"diagnosis","diagnosis":${JSON.stringify(diagnosis)},"summary":${JSON.stringify(`${summary}${LOOP}`).slice(0, -1)}` });
/** A reply cut inside its diagnosis: the verdict never closed. */
const cutInside = (diagnosis: Record<string, string>): Reply => {
  const whole = JSON.stringify({ kind: "diagnosis", diagnosis: { ...diagnosis, observed: `${diagnosis.observed ?? ""} ${LOOP}` } });
  return { finish: "length", content: whole.slice(0, whole.indexOf("That matches.") + 2_000) };
};
const whole = (diagnosis: Record<string, string>, extra: Record<string, unknown> = {}): Reply => ({ finish: "stop", content: JSON.stringify({ kind: "diagnosis", diagnosis, summary: "Judged.", ...extra }) });
/** The plain sentence the adapter writes in place of a cut summary: words for a reader, which nothing decides on. */
const CUT_SENTENCE = "The reply was cut off at the provider's output limit after its diagnosis closed; what followed it did not arrive whole and is not read.";

/** Core's DeepSeek adapter, answering each call with the next reply. */
function served(replies: readonly Reply[]) {
  let calls = 0;
  const provider = createAutomationStudioDeepSeekProvider({
    now: () => Date.UTC(2026, 9, 15, 2),
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async () => "test-secret",
    fetchImpl: (async () => {
      const reply = replies[calls];
      calls += 1;
      if (!reply) throw new Error("no reply scripted");
      const completion = reply.finish === "length" ? 8_192 : 60;
      return new Response(JSON.stringify({
        choices: [{ finish_reason: reply.finish, message: { content: reply.content } }],
        usage: { prompt_tokens: 9_000, completion_tokens: completion, total_tokens: 9_000 + completion }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch
  });
  return { provider, calls: () => calls };
}

const verify = (replies: readonly Reply[], confirmAnswer = false) => {
  const { provider, calls } = served(replies);
  const report = verifyAutomationStudioRunResult({
    projectId: "project-1", flowId: "flow-1", runId: "run-1", summary: requestWordsRunSummary(), instructions: [instruction], deniedEvidenceKeys: [], provider,
    ...(confirmAnswer ? { confirmAnswer } : {})
  });
  return report.then((value) => ({ ...value, calls: calls() }));
};
const cut = (report: Awaited<ReturnType<typeof verify>>) => report.interventions.map((intervention) => intervention.metadata?.truncatedAfterVerdict === true);

describe("a judge reply cut off after its diagnosis closed", () => {
  it("is read for its no, flagged, and never asked again for being cut", async () => {
    const report = await verify([cutAfter(NO), cutAfter(NO), whole(NO)]);
    expect(report.calls).toBe(2);
    expect(report.outcome).toMatchObject({ performed: true, verdict: "does_not_answer", basis: "model", calls: 2 });
    expect(cut(report)).toEqual([true, true]);
    // The no's reading is its diagnosis; the loop it was cut in reaches nothing.
    expect(JSON.stringify(report.outcome)).toContain("a further page was not read");
    expect(JSON.stringify(report.outcome)).not.toContain("That matches");
  });

  it("is read for its unknown, which is an answer and is not asked again", async () => {
    const report = await verify([cutAfter(UNKNOWN), cutAfter(UNKNOWN), whole(UNKNOWN)]);
    expect(report.calls).toBe(2);
    expect(report.outcome).toMatchObject({ performed: true, verdict: "unsure", calls: 2 });
    expect(report.outcome).not.toHaveProperty("failureCode");
    expect(cut(report)).toEqual([true, true]);
  });

  it("takes a yes whose every quote arrived whole in its diagnosis", async () => {
    const report = await verify([cutAfter(YES_QUOTING), whole(NO)]);
    expect(report.calls).toBe(1);
    expect(report.outcome).toMatchObject({ performed: true, verdict: "answers", basis: "model" });
    expect(cut(report)).toEqual([true]);
  });
});

describe("a judge reply cut off before its verdict was whole", () => {
  it("is unavailable when cut inside its diagnosis, and asked again; the answer then given stands", async () => {
    const report = await verify([cutInside(NO), whole(NO), whole(NO)]);
    expect(report.calls).toBe(3);
    expect(report.outcome).toMatchObject({ performed: true, verdict: "does_not_answer", calls: 2 });
    expect(cut(report)).toEqual([false, false, false]);
    expect(report.interventions.map((intervention) => [intervention.metadata?.verificationCheck, intervention.metadata?.verificationAsk])).toEqual([[1, undefined], [1, 2], [2, undefined]]);
  });

  it("gives no answer when cut inside its diagnosis twice, and is never a refutation", async () => {
    const report = await verify([cutInside(NO), cutInside(NO), whole(NO)]);
    expect(report.calls).toBe(2);
    expect(report.outcome).toMatchObject({ performed: true, verdict: "unsure", basis: "model_unavailable", failureCode: "llm.provider_output_truncated" });
  });

  it("does not take a yes whose required quotes sit in the cut summary: unavailable, and asked again", async () => {
    const quotesInSummary = cutAfter(YES_BARE, `${QUOTES} `);
    const report = await verify([quotesInSummary, quotesInSummary, whole(NO)]);
    expect(report.calls).toBe(2);
    // Neither a yes nor a held yes nor a refuted one: what it owed may be in what was cut.
    expect(report.outcome).toMatchObject({ performed: true, verdict: "unsure", basis: "model_unavailable", failureCode: "llm.provider_output_truncated" });
    expect(report.outcome).not.toHaveProperty("exclusionEvidenceMissing");
    expect(cut(report)).toEqual([true, true]);
  });

  it("takes the yes the re-ask then gives whole, quotes and all", async () => {
    const report = await verify([cutAfter(YES_BARE, `${QUOTES} `), whole(YES_QUOTING)]);
    expect(report.calls).toBe(2);
    expect(report.outcome).toMatchObject({ performed: true, verdict: "answers" });
    expect(cut(report)).toEqual([true, false]);
  });
});

// Round 2: the verification decides on the adapter's typed mark, never on words.
describe("what marks a reply as cut after its verdict", () => {
  it("is not the summary's words: a whole reply whose summary is the adapter's sentence is judged whole", async () => {
    // A whole yes lacking its quotes is held for them, as any whole reply is; read as cut it would be unavailable.
    const report = await verify([whole(YES_BARE, { summary: CUT_SENTENCE }), whole(YES_QUOTING), whole(YES_QUOTING)]);
    expect(cut(report)).toEqual([false, false]);
    expect(report.outcome).toMatchObject({ performed: true, verdict: "answers" });
    expect(report.interventions[1]?.metadata).toMatchObject({ verificationAsk: 2, verificationEvidenceRecheck: true });
  });

  it("is not a model's own claim: a whole reply that says it was cut is read whole", async () => {
    const report = await verify([whole(YES_BARE, { truncatedAfterVerdict: true }), whole(YES_QUOTING)]);
    expect(cut(report)).toEqual([false, false]);
    expect(report.interventions[1]?.metadata).toMatchObject({ verificationEvidenceRecheck: true });
  });
});
