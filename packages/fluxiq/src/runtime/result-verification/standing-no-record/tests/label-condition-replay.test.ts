// A stub replay of A8 frozen pair 4 `run-mva446jf-926a3c72` (t651), on a
// hardware store's drill search (`../../refuted-no/tests/hardware-fixture.ts`): a
// read's seller condition tests each row's own name against the store's house
// name, a word of the request, and both judges say no because the rows it alone
// left out are ones the request asks for. Through the build-test judge a trial
// asks, with a scripted provider: Core no longer refutes the no, its record
// keeps no such condition, and a revision dropping it is not refused. The
// converse: a delivery condition over a column of its own still settles its row
// on the request's words, is still kept, and dropping it is still refused once.
// No model is called; no task, site, item or answer of any realistic scenario.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge } from "../../build-test/index.ts";
import {
  DRILL_HALDEN, DRILL_ORMSBY, DRILL_PRO, DRILL_READ, DRILL_SLOW, DRILL_TORVIK, SELLER_IS_TITLE, SELLER_LINE, hardwareInstruction, hardwareRunSummary
} from "../../refuted-no/tests/hardware-fixture.ts";
import { NAME_PREFIX_NO } from "../../refuted-no/tests/hardware-readings-fixture.ts";
import { AutomationStudioResultKeptConditionMemory, automationStudioResultKeptConditionsDropped } from "../../standing-no/index.ts";
import { hardwareLinePlan, hardwarePlan, hardwarePlanWithoutDelivery, hardwarePlanWithoutSeller } from "./hardware-plans-fixture.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

/** A provider answering every call with the run's no. */
function answering(reading: Record<string, string>): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async () => ({ response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "no", ...reading, defects: (reading.observed ?? "").includes("is not included")
      ? [{ kind: "wrong_value", row: DRILL_PRO.name, column: "rating", requestWords: "rating" }]
      : [{ kind: "asked_missing", row: DRILL_TORVIK, column: "name", value: "Drill", requestWords: "sells itself" }] } }, usage: USAGE })
  };
}

const judge = (reading: Record<string, string>) =>
  automationStudioBuildTestJudge({ instructions: [hardwareInstruction()], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider: answering(reading) });

describe("a condition testing the row's own name, judged no for the rows it left out (t651)", () => {
  it("is not refuted, keeps no record of the condition, and lets a revision drop it the first time", async () => {
    const verdict = await judge(NAME_PREFIX_NO)({ summary: hardwareRunSummary(), budget: { maxCostUsd: 0.2 } });
    expect(verdict.verdict).toBe("no");
    expect(JSON.stringify(verdict)).not.toContain("contradicted by Core's record");
    const record = verdict.verdict === "no" ? verdict.standingNo : undefined;
    expect(record).toBeDefined();
    const byNumber = new Map(record!.conditions.map((condition) => [condition.number, condition]));
    // The name condition left out three rows by itself, and Core accounts for none.
    expect(byNumber.get(3)).toMatchObject({ nodeId: DRILL_READ, leftOutAlone: [DRILL_TORVIK, DRILL_HALDEN, DRILL_ORMSBY] });
    expect(byNumber.get(3)?.keptOut).toBeUndefined();
    // The delivery condition still left out only a row whose delivery Core read failing the request's words.
    expect(byNumber.get(1)?.keptOut).toEqual([{ label: DRILL_SLOW, by: "request_words", texts: ["Delivery tomorrow"] }]);

    const memory = new AutomationStudioResultKeptConditionMemory();
    memory.remember({ revision: 1, standingNo: record, plan: hardwarePlan() });
    expect(memory.conditions().map((condition) => condition.name)).toEqual([record!.conditions[0]!.name]);
    // Revision 4 of the run: the name condition dropped, nothing else. Not refused.
    expect(automationStudioResultKeptConditionsDropped({ carried: memory.conditions(), plan: hardwarePlanWithoutSeller() })).toBeUndefined();
    // Dropping the delivery condition is still refused, once.
    expect(automationStudioResultKeptConditionsDropped({ carried: memory.conditions(), plan: hardwarePlanWithoutDelivery() })?.dropped.map((condition) => condition.name)).toEqual([record!.conditions[0]!.name]);
  });
});

/** The run's no over a seller line of its own: the same rows called wrongly left out, the same advice to remove it; `extra` a sentence Core cannot settle. */
function lineNo(extra = ""): Record<string, string> {
  const observed = NAME_PREFIX_NO.observed.replace(SELLER_IS_TITLE, SELLER_LINE).replace(": the seller column reads the product name, not the seller", "");
  return { ...NAME_PREFIX_NO, observed: `${observed}${extra}` };
}

describe("a seller condition over a seller line of its own (t629, t641 kept)", () => {
  it("still settles its rows on the request's words: the no calling them wrongly left out is refuted, never taken", async () => {
    const verdict = await judge(lineNo())({ summary: hardwareRunSummary({ sellerLine: true }), budget: { maxCostUsd: 0.2 } });
    expect(verdict.verdict).not.toBe("no");
  });

  it("is kept on a no that stands for another reason, and its drop is refused once", async () => {
    const verdict = await judge(lineNo(` The rating value of ${DRILL_PRO.name} is not included.`))({ summary: hardwareRunSummary({ sellerLine: true }), budget: { maxCostUsd: 0.2 } });
    const record = verdict.verdict === "no" ? verdict.standingNo : undefined;
    expect(record).toBeDefined();
    const seller = record!.conditions.find((condition) => condition.number === 3);
    expect(seller?.keptOut?.map((row) => [row.label, row.by])).toEqual([[DRILL_TORVIK, "request_words"], [DRILL_HALDEN, "request_words"], [DRILL_ORMSBY, "request_words"]]);
    const memory = new AutomationStudioResultKeptConditionMemory();
    memory.remember({ revision: 1, standingNo: record, plan: hardwareLinePlan() });
    const dropped = automationStudioResultKeptConditionsDropped({ carried: memory.conditions(), plan: hardwarePlanWithoutSeller() });
    expect(dropped?.dropped.map((condition) => condition.name)).toEqual([seller!.name]);
    expect(dropped?.said).toContain("fails the request's words");
  });
});
