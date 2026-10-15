// The judge is shown how each read went, beside the step's own parameters.
//
// `run-munq5s8x-6d620cdf`: the Flow's extraction followed five pages, filtered on
// four conditions and kept one row per link. The check refuted its 8 rows,
// correctly, then advised "add a pagination loop around s6 with a next-page
// click and a filter/dedup step" -- all of which s6 already had -- because what
// it was told was "8 records stored, across 1 record set; the Flow's steps were
// ...; part of the summary was withheld to fit the call". The step's parameters
// were the part withheld. Since 2026-09-30 nothing is withheld to fit: the
// summary carries every step whole, and the read's account beside it.
import { describe, expect, it } from "vitest";
import { automationStudioRecordConditionHolds, type AutomationStudioRecordSchema, type AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import type { AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { summarizeAutomationStudioRunResult } from "../result-summary.ts";
import { EARBUDS_LOCATORS, EARBUDS_NODE_ID, earbudsAttempt, earbudsNode } from "../read-account/tests/earbuds-read.ts";
import { ANSWER, datasetSummary, flow, harness, instruction, runDetail, session, verify } from "./run-outcome-harness.ts";
import { automationStudioResultExclusionEvidenceRecheck } from "../exclusion-evidence/index.ts";
import { automationStudioResultConditionName, automationStudioResultReadPresence } from "../read-account/index.ts";
import { automationStudioRequestWording, automationStudioResultSummaryWithAlsoInResult, automationStudioResultSummaryWithLeftOutNamingTheItem } from "../request-rows/index.ts";
import { automationStudioResultSettledRows } from "../value-readings/index.ts";
import { automationStudioResultVerdict } from "../verdict.ts";

const schema: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: ["name", "price", "rating", "url"].map((id) => ({ id, label: id, valueType: "string" as const }))
};

/** Rows as long as a real product listing's. */
const rows: JsonObject[] = Array.from({ length: 8 }, (_, index) => ({
  name: `Brightaisle wireless earbuds model ${index} with active noise cancelling and a long product title `.repeat(2),
  price: `$${40 + index}.99`,
  rating: "4.5 out of 5 stars",
  url: `https://store.test/product/${index}/${"a".repeat(90)}`
}));

/** The Flow as run: a search, then the read. */
const steps = (): AutomationStudioFlowNode[] => [
  { id: "s1", definitionId: "web.output.browser-navigate", parameterValues: { url: "https://store.test/", newTab: false } },
  { id: "s2", definitionId: "web.output.dom-type", parameterValues: { element: { tagName: "input", accessibleName: "Search" }, timeoutMs: 10000 } },
  { id: "s3", definitionId: "web.output.dom-click", parameterValues: { element: { tagName: "button", accessibleName: "Go" }, timeoutMs: 10000 } },
  { id: "s4", definitionId: "web.output.dom-click", parameterValues: { element: { tagName: "button", accessibleName: "Continue shopping" }, timeoutMs: 10000 } },
  { id: "s5", definitionId: "builtin.control.merge" },
  earbudsNode()
];

function readSummary(nodes: AutomationStudioFlowNode[]): AutomationStudioRunResultSummary {
  return summarizeAutomationStudioRunResult({
    recordSets: [{ summary: datasetSummary({ datasetId: "earbuds", recordCount: 8 }), schema, rows: rows.slice(0, 4), checkedRows: rows }],
    flowNodes: nodes,
    actionAttempts: [earbudsAttempt()],
    deniedEvidenceKeys: []
  });
}

describe("the judge sees how the read went", () => {
  it.each([
    { stop: "control_disabled", truncated: false, complete: true },
    { stop: "page_limit", truncated: true, complete: false },
    { stop: "rate_limited", truncated: false, complete: false },
    { stop: "control_disabled", truncated: true, complete: false }
  ])("projects paging truth into the actual judge request ($stop, truncated=$truncated)", async ({ stop, truncated, complete }) => {
    const readFlow: AutomationStudioFlowDocument = { ...flow, nodes: steps() };
    const original = earbudsAttempt();
    const attempt = earbudsAttempt({ metadata: { ...original.metadata, extraction: { ...original.metadata!.extraction as JsonObject, paginationStop: stop, truncated } } });
    const detail: AutomationStudioFlowRunDetail = { ...runDetail(), actionAttempts: [attempt] };
    const raw = summarizeAutomationStudioRunResult({ recordSets: [], flowNodes: readFlow.nodes, actionAttempts: [attempt], deniedEvidenceKeys: [] });
    const before = structuredClone(raw);
    const context = harness({ answer: ANSWER.yes, datasets: [datasetSummary({ datasetId: "earbuds", recordCount: 8 })], schema, rows });
    await verify(context, { flow: readFlow, session: session({ flow: readFlow }), ports: { ...context.ports, getFlowRunDetail: async () => detail } });
    const sent = context.requests[0]?.context.resultSummary?.reads?.[0];
    expect(sent).toMatchObject({ pagesRead: 5, stop, truncated, kept: 8, paging: expect.any(String) });
    expect(sent?.pageLimit).toBe(complete ? undefined : 5);
    const paging = (sent as { paging?: string } | undefined)?.paging;
    if (complete) expect(paging).toContain("There is no further page");
    else expect(paging?.includes("every page")).toBe(false);
    expect(raw).toEqual(before);
    expect(raw.reads?.[0]).toMatchObject({ pageLimit: 5, stop, truncated });
    expect(attempt.metadata?.extraction).toMatchObject({ paginationStop: stop, truncated });
  });

  it("carries the read's pages, stop and each condition's rejections beside the step's parameters", () => {
    const summary = readSummary(steps());
    // The parameters the judge used to be left without are there, whole...
    expect(summary.flowShape.find((step) => step.nodeId === EARBUDS_NODE_ID)?.parameters).toBeDefined();
    expect(summary.flowParametersWithheld).toBeUndefined();
    // ...and so is the read's own account.
    expect(summary.reads).toEqual([expect.objectContaining({
      nodeId: EARBUDS_NODE_ID, pagesRead: 5, pageLimit: 5, stop: "page_limit", itemsSeen: 56, kept: 8, paginates: true, dedupes: true, dedupeBy: ["url"],
      conditions: [
        { number: 1, condition: "attribute data-sponsored is absent", rejected: 13 },
        { number: 2, condition: "rating atLeast 4", rejected: 20 },
        { number: 3, condition: "price lessThan 50", rejected: 27 },
        { number: 4, condition: "name not contains [\"ear tips\", \"charging case\"]", rejected: 16 }
      ]
    })]);
  });

  it("keeps every step and the whole read however long the Flow is", () => {
    const padding: AutomationStudioFlowNode[] = Array.from({ length: 30 }, (_, index) => ({
      id: `pad.${index}.${"x".repeat(40)}`, definitionId: "builtin.control.merge", label: `A step with a long authored name, number ${index}, ${"y".repeat(30)}`
    }));
    const summary = readSummary([...padding, ...steps()]);
    expect(summary.withheld).toBe(false);
    expect(summary.flowShape).toHaveLength(36);
    expect(summary.flowShape.map((step) => step.nodeId)).toContain(EARBUDS_NODE_ID);
    expect(summary.reads?.[0]?.conditions?.map((condition) => condition.rejected)).toEqual([13, 20, 27, 16]);
    expect(summary.reads?.[0]?.conditions?.[3]?.condition).toBe("name not contains [\"ear tips\", \"charging case\"]");
  });

  it("puts the read in the judge's request and in the refutation's actual, and no locator in either", async () => {
    const readFlow: AutomationStudioFlowDocument = { ...flow, nodes: steps() };
    const detail: AutomationStudioFlowRunDetail = { ...runDetail(), actionAttempts: [earbudsAttempt()] };
    const actual: (string | undefined)[] = [];
    const context = harness({ answer: ANSWER.no, datasets: [datasetSummary({ datasetId: "earbuds", recordCount: 8 })], schema, rows, said: { observed: "8 of 13 earbuds", changed: "loosen the accessory rule" } });
    const next = await verify(context, {
      flow: readFlow,
      session: session({ flow: readFlow }),
      ports: {
        ...context.ports,
        getFlowRunDetail: async () => detail,
        repairRefutedResult: async (request) => { actual.push(request.failedTraceAttempt.failure?.actual); return undefined; }
      }
    });
    expect(next.status).toBe("failed");
    const sent = context.requests[0]?.context.resultSummary;
    expect(sent?.reads?.[0]).toMatchObject({ pagesRead: 5, stop: "page_limit", kept: 8, paginates: true });
    expect(sent?.reads?.[0]?.conditions?.map((condition) => condition.rejected)).toEqual([13, 20, 27, 16]);
    expect(actual[0]).toContain(`step ${EARBUDS_NODE_ID} read 5 pages of at most 5, paging stopped on page_limit and kept 8 of 56 items seen`);
    expect(actual[0]).toContain("its 4 conditions rejected 13, 20, 27, 16 rows");
    // The read's account and the refutation's actual name no locator. The
    // step's own parameters travel whole since 2026-09-30, through the repair
    // context's parameter screen, and whether that screen catches every
    // locator form is the screen's question, not this read's.
    const read = JSON.stringify(sent?.reads) + String(actual[0]);
    for (const locator of EARBUDS_LOCATORS) expect(read).not.toContain(locator);
  });

  it("takes no read from an attempt this session did not make", async () => {
    const readFlow: AutomationStudioFlowDocument = { ...flow, nodes: steps() };
    const detail: AutomationStudioFlowRunDetail = { ...runDetail(), actionAttempts: [earbudsAttempt({ attemptId: "attempt.of.the.run.it.repaired" })] };
    const context = harness({ answer: ANSWER.yes, datasets: [datasetSummary({ datasetId: "earbuds", recordCount: 8 })], schema, rows });
    const traced = session({ flow: readFlow, trace: { attempts: [{ attemptId: "attempt.s6.rerun" }] } as never });
    await verify(context, { flow: readFlow, session: traced, ports: { ...context.ports, getFlowRunDetail: async () => detail } });
    expect(context.requests[0]?.context.resultSummary?.reads).toBeUndefined();
  });

  // The build declares the instruction's named columns, and a name no field
  // reads was a warning nobody saw (F35). The judge is told it beside the
  // stored columns, in the build's own sentence; nothing is said otherwise.
  it("tells the judge which column the instruction asks for that no stored column reads", async () => {
    const judged = async (body: string) => {
      const context = harness({ answer: ANSWER.yes, datasets: [datasetSummary({ datasetId: "earbuds", recordCount: 8 })], schema, rows, instructions: [instruction(body)] });
      await verify(context);
      return context.requests[0]?.context.resultSummary;
    };
    expect((await judged("List the earbuds under $50 with columns name, price, rating, url and seller."))?.instructionColumnsUnread)
      .toBe("The instruction asks for a column \"seller\" that no field reads.");
    for (const body of ["List the earbuds under $50 with columns name, price, rating and url.", "List the earbuds under $50."]) {
      const sent = await judged(body);
      expect(sent).toBeDefined();
      expect(sent?.instructionColumnsUnread).toBeUndefined();
    }
  });
});

// What a subflow trial's judge is shown of a read its part ran under a Call
// Subflow step, and what a yes over that read has to prove (t574).
//
// Live run `run-mv7vor5f-ea4d08b4`: every subflow trial's judge got the read's
// counts and nothing else -- no condition wording, no tested value beside a
// left-out row, no `leftOutNamingTheItem`, no dedupe -- and two exact answers
// were refused, one of them because its yes did not argue each of 37 left-out
// rows, most of them settled by a rating or price bound's own values. The
// summary is made here exactly as a trial makes it: the run's attempts without
// the Call Subflow container, and the Flow's nodes with the called graph's
// beside the root's (`service/candidate-trial/frame-evidence.ts`). A generic
// catalogue of another kind of site, the same shape.
const CALL = "call.attempt.1";
const READ = "node.part.tools.read";
const INSTRUCTIONS = [{ title: "Collect the catalogue", body: "Search the catalogue for garden tools and collect every result rated 4 or more, leaving out out-of-stock items and replacement parts." }];
const KEPT = ["Steel Garden Tools Set, 5 Pieces, Ash Handles", "Compact Garden Tools Kit with Canvas Bag", "Stainless Garden Tools Trio, Trowel and Fork"];
/** A row the name exclusion alone left out that names the item first and an excluded part after it. */
const WITH_PARTS = "Garden Tools Kit with Replacement Parts, Ash Wood";

const readNode: AutomationStudioFlowNode = {
  id: READ,
  definitionId: "unit.list",
  parameterValues: {
    list: {
      fields: { name: { kind: "text" }, rating: { kind: "text" }, url: { kind: "link" } },
      where: [{ field: "rating", atLeast: 4 }, { field: "name", contains: ["Replacement"], not: true }, { field: "stock", is: "present" }],
      paginate: { mode: "next", maxPages: 3 },
      dedupe: { by: ["url"] }
    }
  }
};
const root: AutomationStudioFlowNode[] = [{ id: "node.trial.start", definitionId: "builtin.control.start" }, { id: "node.trial.call", definitionId: "builtin.control.call-subflow" }];

/** The part's one read, under the Call Subflow attempt or, for the whole-candidate trial, in the root frame. */
function readAttempt(called: boolean, ratings: Array<[string, string]> = [["Copper Trowel", "3.5 out of 5"], ["Steel Rake", "2.9 out of 5"]]): AutomationStudioFlowRunActionAttemptRecord {
  return {
    attemptId: "a.read", nodeId: READ, definitionId: "unit.list", order: 2, status: "succeeded", startedAt: 2, ...(called ? { parentAttemptId: CALL } : {}),
    metadata: { extraction: {
      recordCount: KEPT.length, pagesRead: 1, truncated: false, itemsSeen: KEPT.length + ratings.length + 2,
      conditions: {
        applied: KEPT.length + ratings.length + 2, kept: KEPT.length, unfiltered: false,
        rejected: [ratings.length, 1, 1], alone: [ratings.length, 1, 1], seen: [null, null, "In stock"],
        aloneRows: [ratings.map(([name, rating]) => ({ name, rating })), [{ name: WITH_PARTS }], [{ name: "Brass Hose Nozzle" }]]
      }
    } }
  };
}

const calledDatasetSummary = (fields: Partial<AutomationStudioRunDatasetSummary> = {}): AutomationStudioRunDatasetSummary => ({
  runId: "trial.1", datasetId: "tools", nodeIds: [READ], schemaDigest: "digest", recordCount: KEPT.length, truncated: false, invalidCount: 0, updatedAt: 1, ...fields
});
const calledSchema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: ["name", "rating", "url"].map((id) => ({ id, label: id, valueType: "string" })) };
const calledStored: JsonObject[] = KEPT.map((name, index) => ({ name, rating: "4.5 out of 5", url: `/item/${index}` }));

function summaryOf(called: boolean, ratings?: Array<[string, string]>) {
  return summarizeAutomationStudioRunResult({
    recordSets: [{ summary: calledDatasetSummary(), schema: calledSchema, rows: calledStored }],
    flowNodes: [...root, readNode],
    actionAttempts: [readAttempt(called, ratings)],
    deniedEvidenceKeys: [],
    now: 0
  });
}

describe("a subflow trial's read under Call Subflow", () => {
  it("gives the judge the wording, tested values, leftOutNamingTheItem and dedupe facts a whole-candidate trial gives", () => {
    const called = automationStudioResultSummaryWithLeftOutNamingTheItem(summaryOf(true), INSTRUCTIONS);
    const whole = automationStudioResultSummaryWithLeftOutNamingTheItem(summaryOf(false), INSTRUCTIONS);
    expect(called.reads).toEqual(whole.reads);
    expect(called.leftOutNamingTheItem).toEqual(whole.leftOutNamingTheItem);
    const read = called.reads![0]!;
    expect(read).toMatchObject({ nodeId: READ, paginates: true, dedupes: true, dedupeBy: ["url"], dropsEarlierPageRepeats: true });
    expect(read.conditions!.map((condition) => [condition.number, condition.condition])).toEqual([[1, "rating atLeast 4"], [2, "name not contains [\"Replacement\"]"], [3, "stock is present"]]);
    expect(read.conditions![0]!.leftOutOnlyByThis).toEqual(["Copper Trowel — rating: 3.5 out of 5", "Steel Rake — rating: 2.9 out of 5"]);
    expect(called.leftOutNamingTheItem).toEqual([{ nodeId: READ, condition: "condition 2 (name not contains [\"Replacement\"])", item: "garden tools", also: ["replacement parts"], rows: [WITH_PARTS] }]);
  });
});

// Core settles a left-out row whose tested value already fails a stated numeric bound (`value-readings/settled-rows.ts`);
// the yes is asked to quote the request beside each row only for text and presence conditions, and to quote the bound once.
describe("a yes over rows a numeric bound left out, which Core settled", () => {
  const TEXT_AND_PRESENCE = `${WITH_PARTS} is left out by the request's "replacement parts". Brass Hose Nozzle is out of stock: "leaving out out-of-stock items".`;
  const BOUND = `The rating condition keeps what the request asks for: "rated 4 or more".`;
  const verdictOf = (reply: string, ratings?: Array<[string, string]>) => {
    const summary = summaryOf(true, ratings);
    const judged = automationStudioResultSummaryWithLeftOutNamingTheItem(summary, INSTRUCTIONS);
    return automationStudioResultVerdict({ summary: judged, diagnosis: { answersRequest: "yes", observed: reply }, basis: "model", wording: automationStudioRequestWording(INSTRUCTIONS, summary) });
  };

  it("are settled by Core and shown so, with what a yes must still show", () => {
    const rating = summaryOf(true).reads![0]!.conditions![0]!;
    expect(rating.leftOutSettled).toEqual(["Copper Trowel — rating: 3.5 out of 5", "Steel Rake — rating: 2.9 out of 5"]);
    expect(rating.settled).toContain("each fails condition 1 (rating atLeast 4) as written");
    expect(rating.settled).toContain("quote, once, in a sentence that names condition 1 (rating atLeast 4) or rating, the request's own words stating that bound");
    // Text and presence conditions settle nothing.
    expect(summaryOf(true).reads![0]!.conditions!.slice(1).map((condition) => condition.leftOutSettled)).toEqual([undefined, undefined]);
  });

  it("need no quote beside each row: a yes that quotes the bound once and the text and presence rows each is taken", () => {
    expect(verdictOf(`${TEXT_AND_PRESENCE} ${BOUND}`).verdict).toBe("answers");
  });

  it("still hold a yes that never quotes the bound, and ask for that one quote, not for each row", () => {
    const held = verdictOf(TEXT_AND_PRESENCE);
    expect(held).toMatchObject({ verdict: "unsure", code: "core.result.exclusion_evidence_missing" });
    expect(held.exclusionEvidenceMissing).toHaveLength(1);
    const [line] = held.exclusionEvidenceMissing!;
    expect(line).toContain("in a sentence that names condition 1 (rating atLeast 4)");
    expect(line).not.toContain("Copper Trowel");
    const recheck = automationStudioResultExclusionEvidenceRecheck(held, [])!;
    expect(recheck).toContain("those rows need no quote of their own");
    expect(recheck).toContain(line);
  });

  it("leave rows a text or presence condition left out to be quoted row by row", () => {
    const held = verdictOf(`Brass Hose Nozzle is out of stock: "leaving out out-of-stock items". ${BOUND}`);
    expect(held.verdict).not.toBe("answers");
    expect(held.repair?.checked?.join("\n") ?? held.exclusionEvidenceMissing?.join("\n")).toContain(WITH_PARTS);
    expect(verdictOf(`${WITH_PARTS} is left out by the request's "replacement parts". ${BOUND}`).exclusionEvidenceMissing?.join("\n")).toContain("Brass Hose Nozzle");
  });

  it("never settle a row whose tested value states no number: it is quoted for as before", () => {
    const ratings: Array<[string, string]> = [["Copper Trowel", "3.5 out of 5"], ["Unrated Pruner", "not yet rated"]];
    expect(summaryOf(true, ratings).reads![0]!.conditions![0]!.leftOutSettled).toEqual(["Copper Trowel — rating: 3.5 out of 5"]);
    const held = verdictOf(`${TEXT_AND_PRESENCE} ${BOUND}`, ratings);
    expect(held).toMatchObject({ verdict: "unsure", code: "core.result.exclusion_evidence_missing" });
    expect(held.exclusionEvidenceMissing?.join("\n")).toContain("Unrated Pruner");
    expect(held.exclusionEvidenceMissing?.join("\n")).not.toContain("Copper Trowel");
  });
});

// User rule: model guidance never teaches to the test. The sentences t574 adds
// to what a judge and a builder read -- a presence test's sentence, a settled
// bound's sentence, the recheck and Core's line for an unquoted bound, and
// t599's and t624's settled sentences and t624's also-in-result sentence -- must
// name none of the ten realistic scenarios, their sites' plain words or their
// tasks (the lists `build-test/tests/task-checklist.test.ts` holds its label
// to). "quote" is left off the task words: quoting the request is the check
// itself, not a scenario's task.
const SCENARIOS = ["everything-store", "crossborder-marketplace", "bigbox-retail", "job-board", "local-classifieds", "auction-marketplace", "photo-social", "social-network-feed", "company-website", "professional-network"];
const SITE_WORDS = /store|shop|marketplace|retail|bigbox|crossborder|classified|auction|photo|social|network|feed|company|website|professional|product|seller|listing|follow|like\b|post\b|profile|resume|vacanc|apply/iu;
const LAB_TASK_WORDS = /friend|earbud|kettle|basket|cart\b|towel|napkin|dish soap|pickup|watchlist|bid\b|auction|coupon|connection|invitation|saved item|classified|giveaway|glaze|moon jar|gas engineer|job|rust role|group post|feed|digest|open day|rating|shirt|colour|size\b|quantity|rate limit|brightaisle|farbazaar|valueridge|kerbfind|guildline|hammerline|circleway|voltbay|tidewell|plus\b/iu;

function guarded(text: string): void {
  for (const scenario of SCENARIOS) {
    expect(text.toLowerCase()).not.toContain(scenario);
    for (const word of scenario.split("-")) expect(text.toLowerCase(), word).not.toMatch(new RegExp(`\\b${word}\\b`, "u"));
  }
  expect(text.match(SITE_WORDS)?.[0]).toBeUndefined();
  expect(text.match(LAB_TASK_WORDS)?.[0]).toBeUndefined();
}

describe("the judge wording t574 adds", () => {
  it("names none of the ten realistic scenarios, their sites or their tasks", () => {
    const presence = automationStudioResultReadPresence({ field: "weight", is: "present" }, [], undefined)!;
    const condition = { field: "weight", atMost: 2 };
    expect(automationStudioRecordConditionHolds(condition, "3 kg")).toBe(false);
    const settled = automationStudioResultSettledRows({ condition, column: "weight", number: 1, wording: "weight atMost 2", leftOut: [{ row: "Row A — weight: 3 kg", cell: { label: "Row A", value: "3 kg" } }] })!;
    const deficient: AutomationStudioResultVerification = {
      schemaVersion: "automation-studio.result-verification.v1", verdict: "unsure", basis: "model_unconfirmed",
      code: "core.result.exclusion_evidence_missing", reason: "Unconfirmed.", observation: "One record.", exclusionEvidenceMissing: ["(Core's line)"]
    };
    const recheck = automationStudioResultExclusionEvidenceRecheck(deficient, [])!;
    // t599: a presence and an absence test's settled sentences, each said with and without a known column.
    const witnessed = (state: "absent" | "present") => [{ row: "Row A", cell: undefined, witness: state === "absent" ? { source: "read" as const, page: 1, item: 1, state } : { source: "read" as const, page: 1, item: 1, state, value: "Seen" } }];
    const presenceSettled = [
      automationStudioResultSettledRows({ condition: { field: "weight", is: "present" }, column: "weight", number: 1, wording: "weight is present", leftOut: witnessed("absent") })!.settled,
      automationStudioResultSettledRows({ condition: { field: "value", is: "absent" }, column: undefined, number: 2, wording: undefined, leftOut: witnessed("present") })!.settled
    ];
    // t624: a text test's settled sentence, kept and left out by its words, with and without a known column; and the also-in-result sentence.
    const textSettled = [
      automationStudioResultSettledRows({ condition: { field: "finish", contains: "Matte" }, column: "finish", number: 1, wording: "finish contains [\"Matte\"]", leftOut: witnessed("present") })!.settled,
      automationStudioResultSettledRows({ condition: { field: "value", equals: "Seen", not: true }, column: undefined, number: 2, wording: undefined, leftOut: witnessed("present") })!.settled
    ];
    const summary: AutomationStudioRunResultSummary = {
      schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 1, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, flowShape: [], withheld: false,
      recordSets: [{ datasetId: "d", recordCount: 1, refusedCount: 0, truncated: false, columns: ["name"], columnsWithheld: false, rowsChecked: 1, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: [{ name: "Row A" }] }],
      reads: [{ nodeId: "read", definitionId: "list", pagesRead: 1, truncated: false, itemsSeen: 2, kept: 1, conditions: [{ number: 1, condition: "marked is absent", leftOutOnlyByThis: ["Row A"] }] }]
    };
    const alsoInResult = automationStudioResultSummaryWithAlsoInResult(summary).reads![0]!.conditions![0]!.alsoInResult!;
    // t636: a bound's row the read found empty, and a text test's rows whose witness found no value, each said with and without a known column.
    const emptySettled = [
      automationStudioResultSettledRows({ condition, column: "weight", number: 1, wording: "weight atMost 2", leftOut: [{ row: "Row A — weight: (no value)", cell: undefined }] })!.settled,
      automationStudioResultSettledRows({ condition, column: "weight", number: 1, wording: "weight atMost 2", leftOut: [{ row: "Row A — weight: 3 kg", cell: { label: "Row A", value: "3 kg" } }, { row: "Row B — weight: (no value)", cell: undefined }] })!.settled,
      automationStudioResultSettledRows({ condition: { field: "finish", contains: "Matte" }, column: "finish", number: 1, wording: undefined, leftOut: witnessed("absent") })!.settled,
      automationStudioResultSettledRows({ condition: { field: "value", contains: "Matte" }, column: undefined, number: 2, wording: undefined, leftOut: [...witnessed("absent"), { row: "Row B", cell: undefined, witness: { source: "read" as const, page: 1, item: 2, state: "present" as const, value: "Gloss" } }] })!.settled
    ];
    for (const text of [presence, settled.settled, ...presenceSettled, ...textSettled, ...emptySettled, alsoInResult, recheck, automationStudioResultConditionName(1, undefined)]) guarded(text);
  });

  // t624: the judge instruction's sentences on settled text rows and on rows also in the result (`../../llm/diagnosis-instructions.ts`;
  // the instruction's whole text is pinned in `llm/deepseek/tests/system-prompt-pins.json`), held to the same guard.
  it("in the judge instruction, names none of them either", () => {
    const sentences = [
      "or, for a condition that tests text (contains, startsWith, endsWith, matches, or equals with text, possibly negated), its read found on the row a value that fails that condition as written",
      // t636: the no-value clauses.
      "or found none there, and no bound holds on a row with no value",
      "or, where the condition is not negated, found none, so none needs a quote beside it",
      "Such a text condition's rows are settled the same way: a yes quotes once, in a sentence that names that condition, the request's words asking for rows whose value says what the condition looks for, or for leaving such rows out, and where the request asks no such thing, those rows are ones it asks for.",
      "The rows in a condition's leftOutAlsoInResult are left-out rows whose label is also a row of the result: another copy of the same item was kept and came back, so none of them is a row the Flow dropped, none is missing from the result, and none needs a quote or a name in a yes."
    ];
    for (const sentence of sentences) {
      guarded(sentence);
    }
  });
});

// The judged whole run of an assembled Flow, whose root calls a part (t574): the run is judged with the root's nodes,
// so the part's read reached the judge by its counts. Each Call Subflow attempt's graph is now read through the run's
// own Subflow source at the revision it ran (`../called-nodes.ts`), and the part's read is told by its own node.
describe("a whole run whose root calls a part with a filtered read", () => {
  const rootFlow: AutomationStudioFlowDocument = { ...flow, nodes: root };
  const container: AutomationStudioFlowRunActionAttemptRecord = {
    attemptId: CALL, nodeId: "node.trial.call", definitionId: "builtin.control.call-subflow", order: 1, status: "succeeded", startedAt: 1,
    subflowTarget: { subflowId: "sub.tools", graphFlowId: "flow.part.tools", graphRevision: 3 }
  };
  const graphs = (revision: number | null, fails = false) => ({
    load: async (subflowId: string) => {
      if (fails) throw new Error("graph store unavailable");
      return subflowId === "sub.tools" ? { graph: { flowId: "flow.part.tools", nodes: [readNode] }, graphRevision: revision } : undefined;
    }
  });
  const judgedRead = async (calledGraphs?: ReturnType<typeof graphs>) => {
    const context = harness({ answer: ANSWER.yes, datasets: [datasetSummary({ datasetId: "tools", nodeIds: [READ], recordCount: KEPT.length })], schema: calledSchema, rows: calledStored, instructions: [instruction(INSTRUCTIONS[0]!.body)] });
    const detail: AutomationStudioFlowRunDetail = { ...runDetail(), actionAttempts: [container, readAttempt(true)] };
    const outcome = await verify(context, { flow: rootFlow, session: session({ flow: rootFlow }), ports: { ...context.ports, getFlowRunDetail: async () => detail }, ...(calledGraphs ? { calledGraphs } : {}) });
    return { session: outcome, summary: context.requests[0]?.context.resultSummary };
  };

  it("gives the judge the part's wording, tested values and leftOutNamingTheItem", async () => {
    const { summary } = await judgedRead(graphs(3));
    const read = summary?.reads?.[0];
    expect(read).toMatchObject({ nodeId: READ, paginates: true, dedupes: true, dedupeBy: ["url"] });
    expect(read?.conditions?.map((condition) => condition.condition)).toEqual(["rating atLeast 4", "name not contains [\"Replacement\"]", "stock is present"]);
    expect(read?.conditions?.[0]?.leftOutOnlyByThis).toEqual(["Copper Trowel — rating: 3.5 out of 5", "Steel Rake — rating: 2.9 out of 5"]);
    expect(read?.conditions?.[0]?.leftOutSettled).toHaveLength(2);
    expect(summary?.leftOutNamingTheItem).toEqual([{ nodeId: READ, condition: "condition 2 (name not contains [\"Replacement\"])", item: "garden tools", also: ["replacement parts"], rows: [WITH_PARTS] }]);
  });

  it("tells the part's read by its counts where its graph is not the one that ran, cannot be read, or was not offered", async () => {
    for (const calledGraphs of [graphs(4), graphs(3, true), undefined]) {
      const { summary } = await judgedRead(calledGraphs);
      // The judge is still asked: a graph that cannot be had costs the account its detail, never the verdict.
      expect(summary).toBeDefined();
      expect(summary?.reads?.[0]?.conditions?.map((condition) => condition.condition)).toEqual([undefined, undefined, undefined]);
      expect(summary).not.toHaveProperty("leftOutNamingTheItem");
    }
  });
});
