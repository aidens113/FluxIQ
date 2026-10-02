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
import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts.ts";
import { summarizeAutomationStudioRunResult } from "../result-summary.ts";
import { EARBUDS_LOCATORS, EARBUDS_NODE_ID, earbudsAttempt, earbudsNode } from "../read-account/tests/earbuds-read.ts";
import { ANSWER, datasetSummary, flow, harness, instruction, runDetail, session, verify } from "./run-outcome-harness.ts";

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
  it("carries the read's pages, stop and each condition's rejections beside the step's parameters", () => {
    const summary = readSummary(steps());
    // The parameters the judge used to be left without are there, whole...
    expect(summary.flowShape.find((step) => step.nodeId === EARBUDS_NODE_ID)?.parameters).toBeDefined();
    expect(summary.flowParametersWithheld).toBeUndefined();
    // ...and so is the read's own account.
    expect(summary.reads).toEqual([expect.objectContaining({
      nodeId: EARBUDS_NODE_ID, pagesRead: 5, pageLimit: 5, stop: "page_limit", itemsSeen: 56, kept: 8, paginates: true, dedupes: true, dedupeBy: ["url"],
      conditions: [
        { condition: "attribute data-sponsored is absent", rejected: 13 },
        { condition: "rating atLeast 4", rejected: 20 },
        { condition: "price lessThan 50", rejected: 27 },
        { condition: "name not contains [\"ear tips\", \"charging case\"]", rejected: 16 }
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
