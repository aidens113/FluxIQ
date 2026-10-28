// The rows two or more conditions of a read left out together reach its account
// (t655): each once, under the conditions it failed, numbered from 1, by label
// alone, screened as a condition's alone rows are; every pass's in a loop. A
// hardware store's catalogue: no task, site, item or answer of any realistic
// scenario.
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import type { AutomationStudioResultReadAccount } from "../../contracts/index.ts";
import { automationStudioResultReadAccounts } from "../accounts.ts";
import { automationStudioResultReadLoopedAccount } from "../looped-account.ts";
import { automationStudioResultReadTogetherRows } from "../together-rows.ts";

const NODE = "read.drills";

const node = (): AutomationStudioFlowNode => ({
  id: NODE,
  definitionId: "web.output.dom-extract_list",
  parameterValues: {
    extractList: {
      item: ".tool",
      fields: { name: { kind: "text", selector: ".tool h3" }, price: { kind: "text", selector: ".price" }, voltage: { kind: "text", selector: ".volts" } },
      where: [{ field: "price", lessThan: 100 }, { field: "voltage", contains: "18V" }],
      minItems: 0
    }
  }
});

const attempt = (togetherRows: JsonValue): AutomationStudioFlowRunActionAttemptRecord => ({
  attemptId: "attempt.read", nodeId: NODE, definitionId: "web.output.dom-extract_list", order: 1, status: "succeeded", startedAt: 1,
  metadata: {
    extraction: {
      recordCount: 2, pagesRead: 1, truncated: false, fieldNames: ["name", "price", "voltage"], missingFields: [], itemsSeen: 5,
      conditions: {
        applied: 5, kept: 2, rejected: [2, 2], unfiltered: false, alone: [1, 1],
        aloneRows: [[{ name: "Corded Hammer Drill", price: "$129.00", voltage: "18V" }], [{ name: "Compact Drill Driver", price: "$79.00", voltage: "12V" }]],
        togetherRows
      }
    }
  }
});

const WIDE = { name: "Heavy Rotary Drill 36V", price: "$249.00", voltage: "36V" };

describe("the rows conditions left out together, on a read's account", () => {
  it("are said once under the conditions they failed, numbered from 1, by label alone", () => {
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [attempt([{ failed: [0, 1], rows: [WIDE] }])], flowNodes: [node()], deniedEvidenceKeys: [] });
    // Each with its own cells beside its label (t771).
    expect(reads[0]?.leftOutTogether).toEqual([{ conditions: [1, 2], rows: ["Heavy Rotary Drill 36V"], cells: [WIDE] }]);
    expect(reads[0]?.conditions?.map((condition) => condition.leftOutOnlyByThis)).toEqual([["Corded Hammer Drill — price: $129.00"], ["Compact Drill Driver — voltage: 12V"]]);
  });

  it("are carried only under the bound domain's declared keys, and a malformed list carries none", () => {
    expect(automationStudioResultReadAccounts({ actionAttempts: [attempt([{ failed: [0, 1], rows: [WIDE] }])], flowNodes: [node()] }).reads[0]?.leftOutTogether).toBeUndefined();
    for (const malformed of [[{ failed: [0], rows: [WIDE] }], [{ failed: [0, 2], rows: [WIDE] }], [{ failed: [0, 0], rows: [WIDE] }], [{ failed: [0, 1], rows: "x" }]]) {
      expect(automationStudioResultReadAccounts({ actionAttempts: [attempt(malformed)], flowNodes: [node()], deniedEvidenceKeys: [] }).reads[0]?.leftOutTogether).toBeUndefined();
    }
  });

  it("are screened as a condition's alone rows are: a denied column or a credential shape is said withheld, and still counts", () => {
    const rows = automationStudioResultReadTogetherRows([{ failed: [1, 0], rows: [{ name: "token sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c" }, { sku: "DR-1" }] }], 2, ["sku"]);
    // Its cells are screened too: the credential-shaped value withheld, the denied column left out (t771).
    expect(rows).toEqual([{ conditions: [1, 2], rows: ["(withheld)", "(withheld)"], cells: [{ name: "(withheld)" }, {}] }]);
  });

  it("add up every pass of a loop, each set once", () => {
    const pass = (rows: string[], other?: string[]): AutomationStudioResultReadAccount => ({
      nodeId: NODE, definitionId: "web.output.dom-extract_list", pagesRead: 1, truncated: false, kept: 1,
      leftOutTogether: [{ conditions: [1, 2], rows }, ...(other ? [{ conditions: [2, 3], rows: other }] : [])]
    });
    const looped = automationStudioResultReadLoopedAccount({ passes: [pass(["Drill A"]), pass(["Drill B"], ["Drill C"])], attempts: 2 });
    expect(looped.leftOutTogether).toEqual([{ conditions: [1, 2], rows: ["Drill A", "Drill B"] }, { conditions: [2, 3], rows: ["Drill C"] }]);
  });
});
