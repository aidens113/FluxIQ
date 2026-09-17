import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowAdaptationValidationResult } from "../../../model/index.ts";
import {
  AUTOMATION_STUDIO_CHANGE_CONFIDENCE_DEFAULT_REPLAYS,
  automationStudioValidationResultKind,
  decideAutomationStudioChangeConfidence
} from "../index.ts";

let clock = 0;

function result(status: "succeeded" | "failed", kind?: "trial" | "replay", checkedAt = ++clock): AutomationStudioFlowAdaptationValidationResult {
  return { runId: `run.${checkedAt}`, status, checkedAt, ...(kind ? { kind } : {}) };
}

const trial = (status: "succeeded" | "failed" = "succeeded") => result(status, "trial");
const replay = (status: "succeeded" | "failed" = "succeeded") => result(status, "replay");

function tierOf(validationResults: AutomationStudioFlowAdaptationValidationResult[], riskLevel: "low" | "medium" | "high" | "destructive" = "low", replaysRequired?: number) {
  return decideAutomationStudioChangeConfidence({ validationResults, riskLevel, ...(replaysRequired === undefined ? {} : { replaysRequired }) });
}

describe("change confidence tiers", () => {
  it("is unverified with no results", () => {
    expect(tierOf([])).toEqual({ tier: "unverified", trials: 0, replays: 0, replaysRequired: 2 });
  });

  it("is unverified when the only trial failed", () => {
    expect(tierOf([trial("failed")])).toEqual({ tier: "unverified", trials: 0, replays: 0, replaysRequired: 2, lastFailure: "trial" });
  });

  it("is provisional after one succeeded trial", () => {
    expect(tierOf([trial()])).toMatchObject({ tier: "provisional", trials: 1, replays: 0 });
  });

  it("reads a result written before kinds existed as a trial", () => {
    expect(tierOf([result("succeeded")])).toMatchObject({ tier: "provisional", trials: 1, replays: 0 });
    expect(tierOf([result("failed")])).toMatchObject({ tier: "unverified", lastFailure: "trial" });
  });

  it("stays provisional one replay short", () => {
    expect(tierOf([trial(), replay()])).toMatchObject({ tier: "provisional", trials: 1, replays: 1 });
  });

  it("is established after the required replays", () => {
    expect(AUTOMATION_STUDIO_CHANGE_CONFIDENCE_DEFAULT_REPLAYS).toBe(2);
    expect(tierOf([trial(), replay(), replay()])).toMatchObject({ tier: "established", trials: 1, replays: 2 });
  });

  it("is established by replays alone", () => {
    expect(tierOf([replay(), replay()])).toMatchObject({ tier: "established", trials: 0, replays: 2 });
  });

  it("is demoted to unverified by a failed replay after the last success", () => {
    expect(tierOf([trial(), replay(), replay(), replay("failed")])).toEqual({ tier: "unverified", trials: 1, replays: 0, replaysRequired: 2, lastFailure: "replay" });
  });

  it("is demoted to unverified by a failed trial after the last success", () => {
    expect(tierOf([trial(), trial("failed")])).toMatchObject({ tier: "unverified", lastFailure: "trial" });
  });

  it("counts only replays since the last failure", () => {
    expect(tierOf([trial(), replay(), replay("failed"), replay()])).toMatchObject({ tier: "provisional", replays: 1, lastFailure: "replay" });
    expect(tierOf([trial(), replay(), replay("failed"), replay(), replay()])).toMatchObject({ tier: "established", replays: 2, lastFailure: "replay" });
  });

  it("is provisional after a failed trial followed by a succeeded one", () => {
    expect(tierOf([trial("failed"), trial()])).toMatchObject({ tier: "provisional", trials: 1, lastFailure: "trial" });
  });

  it("reads results in the order they were checked, not the order they were stored", () => {
    const early = result("succeeded", "replay", 10);
    const late = result("failed", "replay", 20);
    expect(tierOf([late, result("succeeded", "trial", 5), early])).toMatchObject({ tier: "unverified", lastFailure: "replay" });
    const recovered = result("succeeded", "replay", 30);
    const again = result("succeeded", "replay", 40);
    expect(tierOf([again, late, recovered, early])).toMatchObject({ tier: "established", replays: 2 });
  });

  it("keeps stored order for results checked at the same moment", () => {
    expect(tierOf([result("succeeded", "replay", 50), result("failed", "replay", 50)])).toMatchObject({ tier: "unverified" });
    expect(tierOf([result("failed", "replay", 60), result("succeeded", "replay", 60)])).toMatchObject({ tier: "provisional" });
  });

  it("never counts a result of any other kind, such as a structural check", () => {
    const structural = { ...result("succeeded"), kind: "structural" } as unknown as AutomationStudioFlowAdaptationValidationResult;
    expect(tierOf([structural])).toMatchObject({ tier: "unverified", trials: 0, replays: 0 });
    const structuralFailure = { ...result("failed"), kind: "structural" } as unknown as AutomationStudioFlowAdaptationValidationResult;
    expect(tierOf([replay(), replay(), structuralFailure])).toMatchObject({ tier: "established" });
  });

  it("ignores a result with an unknown status or an unusable time", () => {
    const pending = { ...replay(), status: "pending" } as unknown as AutomationStudioFlowAdaptationValidationResult;
    const timeless = { ...replay(), checkedAt: Number.NaN };
    expect(tierOf([trial(), pending, timeless])).toMatchObject({ tier: "provisional", replays: 0 });
  });
});

describe("change confidence: replays required", () => {
  it("asks one more replay of a high-risk or destructive change", () => {
    for (const riskLevel of ["high", "destructive"] as const) {
      expect(tierOf([replay(), replay()], riskLevel)).toMatchObject({ tier: "provisional", replaysRequired: 3 });
      expect(tierOf([replay(), replay(), replay()], riskLevel)).toMatchObject({ tier: "established", replaysRequired: 3 });
    }
  });

  it("asks the default of a medium-risk change", () => {
    expect(tierOf([replay(), replay()], "medium")).toMatchObject({ tier: "established", replaysRequired: 2 });
  });

  it("honours an explicit requirement, never below one replay", () => {
    expect(tierOf([replay()], "low", 1)).toMatchObject({ tier: "established", replaysRequired: 1 });
    expect(tierOf([trial()], "low", 0)).toMatchObject({ tier: "provisional", replaysRequired: 1 });
    expect(tierOf([trial()], "low", -4)).toMatchObject({ replaysRequired: 1 });
    expect(tierOf([replay(), replay()], "low", 2.9)).toMatchObject({ tier: "established", replaysRequired: 2 });
    expect(tierOf([replay(), replay(), replay()], "low", 4)).toMatchObject({ tier: "provisional", replaysRequired: 4 });
    expect(tierOf([replay()], "high", 1)).toMatchObject({ tier: "provisional", replaysRequired: 2 });
  });

  it("falls back to the default for an unusable requirement", () => {
    expect(tierOf([replay(), replay()], "low", Number.NaN)).toMatchObject({ tier: "established", replaysRequired: 2 });
    expect(tierOf([replay(), replay()], "low", Number.POSITIVE_INFINITY)).toMatchObject({ replaysRequired: 2 });
  });
});

describe("validation result kind", () => {
  it("reads an absent kind as a trial and refuses anything that is not a kind", () => {
    expect(automationStudioValidationResultKind({})).toBe("trial");
    expect(automationStudioValidationResultKind({ kind: "trial" })).toBe("trial");
    expect(automationStudioValidationResultKind({ kind: "replay" })).toBe("replay");
    expect(automationStudioValidationResultKind({ kind: "structural" } as never)).toBeUndefined();
  });
});
