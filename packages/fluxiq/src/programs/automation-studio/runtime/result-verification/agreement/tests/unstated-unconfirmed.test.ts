// An unsure beside a no is screened for an exclusion the request never states,
// as a split is (t790, F2 of run `run-mvswh11y-9d462629`): trial 1 there was
// unsure plus no, and the no's invented exclusion reached the builder unmarked
// as `unconfirmedReading.advice`. A community hall's events list, made up.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioResultVerificationAgreement } from "../index.ts";
import { unsettled } from "../unsettled.ts";

const REQUEST = "Open the hall's events page and list every event this month except cancelled ones, with its title and start time.";

const INSTRUCTION: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Events", body: REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

const SUMMARY: AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 2, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
  recordSets: [], flowShape: [{ nodeId: "read", definitionId: "extract_list" }], withheld: false
};

const wording = automationStudioRequestWording([INSTRUCTION], SUMMARY);

const no = (advice: string): AutomationStudioResultVerification => automationStudioResultVerdict({
  summary: SUMMARY, basis: "model",
  diagnosis: { answersRequest: "no", expected: "Every event this month that is not cancelled.", observed: "The result keeps a row that may not belong.", changed: advice }
});
const yes = (): AutomationStudioResultVerification => automationStudioResultVerdict({ summary: SUMMARY, basis: "model", diagnosis: { answersRequest: "yes" } });
const unsure = (): AutomationStudioResultVerification => ({ ...yes(), verdict: "unsure", basis: "model" });

const INVENTED = "Keep only the talks, excluding workshops such as Pottery Basics.";
const RESTATED = "Keep the rows read, excluding cancelled events.";

const settle = (first: AutomationStudioResultVerification, second: AutomationStudioResultVerification, basis: "model_disagreed" | "model_unconfirmed") =>
  unsettled(first, second, basis, "code", "reason", [first.verdict, second.verdict], { wording });

describe("an unsure beside a no (basis model_unconfirmed)", () => {
  it("marks the no's advice when it adds an exclusion the request never states, in the no's own words and without claiming a re-ask", () => {
    const outcome = settle(unsure(), no(INVENTED), "model_unconfirmed");
    expect(outcome).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed" });
    const advice = outcome.unconfirmedReading?.advice ?? "";
    expect(advice).toContain("Core's check: this advice adds an exclusion the request never states");
    expect(advice).toContain("Judge call 2");
    expect(advice).toContain("workshops");
    expect(advice).toContain(INVENTED);
    expect(advice).not.toContain("asked once more");
  });

  it("marks the no when it came first, as call 1", () => {
    const advice = settle(no(INVENTED), unsure(), "model_unconfirmed").unconfirmedReading?.advice ?? "";
    expect(advice).toContain("Judge call 1");
  });

  it("leaves advice that only restates the request's own exclusion unmarked", () => {
    expect(settle(unsure(), no(RESTATED), "model_unconfirmed").unconfirmedReading?.advice).toBe(RESTATED);
  });

  it("leaves a no with no wording to hold it to unmarked", () => {
    const outcome = unsettled(unsure(), no(INVENTED), "model_unconfirmed", "code", "reason", ["unsure", "does_not_answer"], {});
    expect(outcome.unconfirmedReading?.advice).toBe(INVENTED);
  });
});

describe("an unsure beside a no, through the agreement (t790 wiring in agree.ts)", () => {
  it("reaches the mark with the request's wording, and leaves restated advice whole", () => {
    const marked = automationStudioResultVerificationAgreement({ first: unsure(), second: no(INVENTED), wording });
    expect(marked).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed" });
    expect(marked.unconfirmedReading?.advice ?? "").toContain("Core's check: this advice adds an exclusion the request never states");
    expect(automationStudioResultVerificationAgreement({ first: unsure(), second: no(RESTATED), wording }).unconfirmedReading?.advice).toBe(RESTATED);
  });
});

describe("a split's no (basis model_disagreed), unchanged", () => {
  it("is marked as before, and says so where the call was asked again", () => {
    const plain = unsettled(yes(), no(INVENTED), "model_disagreed", "code", "reason", ["answers", "does_not_answer"], { wording }).unconfirmedReading?.advice ?? "";
    expect(plain).toContain("Judge call 2");
    expect(plain).not.toContain("asked once more");
    const reasked = unsettled(yes(), no(INVENTED), "model_disagreed", "code", "reason", ["answers", "does_not_answer"], { wording, reasked: 2 }).unconfirmedReading?.advice ?? "";
    expect(reasked).toContain("asked once more with this named, it advised the same");
  });

  it("leaves a split's restated exclusion unmarked", () => {
    expect(settle(yes(), no(RESTATED), "model_disagreed").unconfirmedReading?.advice).toBe(RESTATED);
  });
});
