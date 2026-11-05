import { describe, expect, it } from "vitest";
import { parseAutomationStudioSubflowCard } from "@fluxiq/contracts/automation";
import { completeAutomationStudioPartCard } from "../complete-card.ts";
import { deriveAutomationStudioPartTrust } from "../derive-trust.ts";
import { partTrustEvidenceFromJudgements, partTrustEvidenceFromRuns } from "../evidence.ts";
import type { AutomationStudioPartTrustEvidence } from "../types.ts";

const yes = (atMs: number, zeroModel = false): AutomationStudioPartTrustEvidence => ({ result: "confirmed", zeroModel, atMs });
const no = (atMs: number, zeroModel = false): AutomationStudioPartTrustEvidence => ({ result: "refuted", zeroModel, atMs });
const silent = (atMs: number): AutomationStudioPartTrustEvidence => ({ result: "unverified", zeroModel: false, atMs });

describe("deriveAutomationStudioPartTrust", () => {
  it("is unproven with no evidence, and unverified or missing verdicts prove nothing", () => {
    expect(deriveAutomationStudioPartTrust({ evidence: [], lastingClasses: [] })).toEqual({ tier: "unproven", counts: { judgedYes: 0, zeroModelRuns: 0, failures: 0 } });
    expect(deriveAutomationStudioPartTrust({ evidence: [silent(1), { result: "no_result", zeroModel: true, atMs: 2 }], lastingClasses: [] }).tier).toBe("unproven");
  });

  it("is provisional after one judged yes", () => {
    expect(deriveAutomationStudioPartTrust({ evidence: [yes(10)], lastingClasses: [] })).toEqual({ tier: "provisional", counts: { judgedYes: 1, zeroModelRuns: 0, failures: 0 } });
  });

  it("is established after two zero-model replays with no failure since", () => {
    const trust = deriveAutomationStudioPartTrust({ evidence: [yes(10), yes(20, true), yes(30, true)], lastingClasses: [] });
    expect(trust).toEqual({ tier: "established", counts: { judgedYes: 3, zeroModelRuns: 2, failures: 0 } });
  });

  it("does not count a confirmed run that asked a model as a replay", () => {
    expect(deriveAutomationStudioPartTrust({ evidence: [yes(10), yes(20), yes(30)], lastingClasses: [] }).tier).toBe("provisional");
  });

  it("loses trust at a failure and earns it back slowly", () => {
    const failed = deriveAutomationStudioPartTrust({ evidence: [yes(10), yes(20, true), yes(30, true), no(40)], lastingClasses: [] });
    expect(failed).toEqual({ tier: "unproven", counts: { judgedYes: 3, zeroModelRuns: 0, failures: 1 }, lastFailureAtMs: 40 });
    const recovered = deriveAutomationStudioPartTrust({ evidence: [yes(10), no(40), yes(50), yes(60, true)], lastingClasses: [] });
    expect(recovered.tier).toBe("provisional");
    expect(recovered.counts).toEqual({ judgedYes: 3, zeroModelRuns: 1, failures: 1 });
    expect(deriveAutomationStudioPartTrust({ evidence: [no(5), no(9)], lastingClasses: [] })).toEqual({ tier: "unproven", counts: { judgedYes: 0, zeroModelRuns: 0, failures: 2 }, lastFailureAtMs: 9 });
  });

  it("reads evidence in the order it happened, not the order it was listed", () => {
    expect(deriveAutomationStudioPartTrust({ evidence: [no(40), yes(10), yes(20, true), yes(30, true)], lastingClasses: [] }).tier).toBe("unproven");
  });

  it("asks one more replay of a part that can cause something lasting", () => {
    const twoReplays = [yes(10), yes(20, true), yes(30, true)];
    expect(deriveAutomationStudioPartTrust({ evidence: twoReplays, lastingClasses: ["move_money"] }).tier).toBe("provisional");
    expect(deriveAutomationStudioPartTrust({ evidence: [...twoReplays, yes(40, true)], lastingClasses: ["move_money"] }).tier).toBe("established");
    expect(deriveAutomationStudioPartTrust({ evidence: twoReplays, lastingClasses: ["create_new"] }).tier).toBe("established");
  });

  it("maps judgement rows and part runs to evidence", () => {
    expect(partTrustEvidenceFromJudgements([{ status: "confirmed", zeroModel: true, decidedAtMs: 7 }])).toEqual([{ result: "confirmed", zeroModel: true, atMs: 7 }]);
    expect(partTrustEvidenceFromRuns([
      { outcome: "succeeded", modelCalls: 0, finishedAtMs: 1 },
      { outcome: "failed", modelCalls: 3, finishedAtMs: 2 },
      { outcome: "stopped", modelCalls: 0, finishedAtMs: 3 }
    ])).toEqual([
      { result: "confirmed", zeroModel: true, atMs: 1 },
      { result: "refuted", zeroModel: false, atMs: 2 },
      { result: "unverified", zeroModel: true, atMs: 3 }
    ]);
  });

  it("gives every tier a card the contract accepts", () => {
    const stored = { partId: "part.one", version: 1, name: "Search", purpose: "Search", sites: [], inputs: [], outputs: [], fixedValues: [], lastingClasses: [], calls: [], shapeHash: "a".repeat(64) };
    for (const evidence of [[], [yes(1)], [yes(1), yes(2, true), yes(3, true)], [yes(1), no(2)]]) {
      const completed = completeAutomationStudioPartCard(stored, evidence);
      expect(completed.ok).toBe(true);
      if (completed.ok) expect(parseAutomationStudioSubflowCard(completed.card).ok).toBe(true);
    }
    expect(completeAutomationStudioPartCard(stored, [yes(1), yes(2, true), yes(3, true)])).toMatchObject({ ok: true, card: { trust: { tier: "established" } } });
    expect(completeAutomationStudioPartCard({ ...stored, sites: ["https://shop.example/path"] }, [])).toMatchObject({ ok: false });
  });
});
