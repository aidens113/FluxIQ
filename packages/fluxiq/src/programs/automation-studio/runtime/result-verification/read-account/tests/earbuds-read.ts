// The read `run-munq5s8x-6d620cdf` refuted, as the run record and the Flow held
// it: an extraction that followed five pages, filtered on four conditions and
// kept one row per link, then stored 8 of the 13 rows asked for. The judge was
// told "8 records stored" and advised adding the paging and the filter the step
// already had. The selectors are invented and exist only to prove none of them
// leaves.
import type { AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";

export const EARBUDS_NODE_ID = "node.bootstrap.5d98a75a68c43949.main.s6";

/** Every locator the node was authored with. None may appear in anything sent. */
export const EARBUDS_LOCATORS = [".result-card", ".result-card h2 a", ".price-now", ".stars", "a.next-page"];

export const earbudsNode = (): AutomationStudioFlowNode => ({
  id: EARBUDS_NODE_ID,
  definitionId: "web.output.dom-extract_list",
  parameterValues: {
    extractList: {
      item: ".result-card",
      fields: {
        name: { kind: "text", selector: ".result-card h2 a", required: true },
        price: { kind: "text", selector: ".price-now", required: true },
        rating: { kind: "text", selector: ".stars", required: true },
        url: { kind: "link", selector: ".result-card h2 a", required: true }
      },
      where: [
        { read: { kind: "attribute", selector: ".result-card", attribute: "data-sponsored", required: false }, is: "absent" },
        { read: { kind: "text", selector: ".stars", required: true }, atLeast: 4 },
        { read: { kind: "text", selector: ".price-now", required: true }, lessThan: 50 },
        { read: { kind: "text", selector: ".result-card h2 a", required: true }, contains: ["ear tips", "charging case"], not: true }
      ],
      paginate: { next: "a.next-page", maxPages: 5 },
      minItems: 0,
      dedupe: { by: ["url"] }
    },
    timeoutMs: 30000
  }
});

/** The attempt as the run record holds it: `metadata.extraction` is what `service/summaries/extraction-summary.ts` admitted. */
export const earbudsAttempt = (overrides: Partial<AutomationStudioFlowRunActionAttemptRecord> = {}): AutomationStudioFlowRunActionAttemptRecord => ({
  attemptId: "attempt.s6",
  nodeId: EARBUDS_NODE_ID,
  definitionId: "web.output.dom-extract_list",
  order: 6,
  status: "succeeded",
  startedAt: 10,
  metadata: {
    extraction: {
      recordCount: 8,
      pagesRead: 5,
      truncated: false,
      fieldNames: ["name", "price", "rating", "url"],
      missingFields: [],
      itemsSeen: 56,
      emptyRecords: 0,
      conditions: { applied: 56, kept: 8, rejected: [13, 20, 27, 16], unfiltered: false },
      paginationStop: "page_limit"
    }
  },
  ...overrides
});
