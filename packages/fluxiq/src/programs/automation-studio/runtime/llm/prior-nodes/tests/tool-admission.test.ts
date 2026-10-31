import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceLookWithdrawal } from "../../decision-handlers/index.ts";
import { automationStudioLlmEvidenceRepeatGuard } from "../../repeat-guard/index.ts";
import { automationStudioLlmEvidenceToolAdmission } from "../tool-admission.ts";

function fixture() {
  const tool = { toolId: "core.run_node", description: "Run a node.", effect: "mutate" as const, perCallEffect: true, inputSchema: { type: "object", properties: { node: { enum: ["catalogue.read"] } } } };
  const repeats = automationStudioLlmEvidenceRepeatGuard();
  const answeredRequests = new Map<string, string>();
  const base: Parameters<typeof automationStudioLlmEvidenceToolAdmission>[0] = {
    toolId: tool.toolId, value: { node: "catalogue.read", parameters: {} }, toolsById: new Map([[tool.toolId, tool]]),
    eligibleToolIds: new Set([tool.toolId]), offered: [tool], looks: automationStudioLlmEvidenceLookWithdrawal({ enabled: false }),
    repeats, answeredRequests, latestObservations: new Map(), attemptEpoch: 0, mutationEpoch: 0,
    discoveryOnly: false, finalDecision: false, remaining: undefined, deadlineExpired: false, withholds: () => false
  };
  return { base, repeats, answeredRequests };
}

describe("shared ordinary admission", () => {
  it("bypasses only a successful original's answered cache for explicit list intent", () => {
    const f = fixture();
    const first = automationStudioLlmEvidenceToolAdmission(f.base);
    f.answeredRequests.set(first.signature!, "a");
    expect(automationStudioLlmEvidenceToolAdmission(f.base)).toMatchObject({ answered: true, code: "llm_evidence_loop.already_answered" });
    expect(automationStudioLlmEvidenceToolAdmission({ ...f.base, priorSuccessful: true })).toMatchObject({ answered: false });
    expect(automationStudioLlmEvidenceToolAdmission({ ...f.base, priorSuccessful: true, withholds: () => true })).toMatchObject({ answered: true, withheld: true });
    expect(automationStudioLlmEvidenceToolAdmission({ ...f.base, priorSuccessful: true, eligibleToolIds: new Set() })).toMatchObject({ answered: true, reobservation: true });
  });

  it("does not lift a failed or no-progress outcome when a list explicitly asks again", () => {
    const f = fixture();
    f.repeats.recorded({ callId: "failed", toolId: f.base.toolId, input: f.base.value, stateBefore: "world", stateAfter: "world", effect: "mutate", proposes: true, effectApplied: false, refused: true });
    expect(automationStudioLlmEvidenceToolAdmission({ ...f.base, priorSuccessful: true })).toMatchObject({ triedHere: { callId: "failed", outcome: "failed" } });
  });

  it("retains final-slot/deadline gates and checks the currently offered canonical node", () => {
    const f = fixture();
    expect(automationStudioLlmEvidenceToolAdmission({ ...f.base, finalDecision: true, remaining: { decisionsLeft: 1, limitedBy: "tokens" } })).toMatchObject({ final: true });
    expect(automationStudioLlmEvidenceToolAdmission({ ...f.base, discoveryOnly: true, deadlineExpired: true })).toMatchObject({ deadline: true });
    expect(automationStudioLlmEvidenceToolAdmission({ ...f.base, value: { node: "withdrawn.node" } })).toMatchObject({ nodeOffered: false });
  });
});
