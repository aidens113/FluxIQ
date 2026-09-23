import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import {
  AutomationStudioActionPermissionGate,
  parseAutomationStudioActionPermissionRequest,
  type AutomationStudioActionConsequence
} from "../../../action-permissions/index.ts";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowChangeProposal, AutomationStudioFlowDocument } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor.ts";
import {
  packAutomationStudioLlmContext,
  type AutomationStudioLlmContextPacket,
  type AutomationStudioLlmEvidenceRuntimeBinding,
  type AutomationStudioRuntimePatch,
  type AutomationStudioRuntimeTargetOverrideTarget
} from "../../../llm/index.ts";
import type { AutomationStudioRuntimeTargetOverrideEvidenceValidation, AutomationStudioRuntimeTargetOverrideFailedAction } from "../../../live-patch.ts";
import { resolveAutomationStudioResultCheckSchedule } from "../../../result-check-schedule/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../../../service.ts";
import { applyAutomationStudioRuntimeRecoveryPatches } from "../patches.ts";

// The receipt a refused repair leaves. `run-mu4rpka7-845d919a` reached the
// provider, got a target override back, and recorded only that the preflight
// failed: nothing in the run said the domain had been asked about a
// `builtin.policy.action` node it could not tell was a click, and so refused
// the override before reading its handle. These drive the stage that writes
// the receipt, with the domain's answer supplied by a stub.
describe("applyAutomationStudioRuntimeRecoveryPatches", () => {
  it("asks the domain about the output the recorded node dispatches, and records why it refused", async () => {
    const asked: AutomationStudioRuntimeTargetOverrideFailedAction[] = [];
    const outcome = await apply({ asked, answer: { status: "absent", reason: "parameter_not_offered" } });

    expect(asked).toEqual([{ nodeId: "recorded.press", definitionId: "builtin.policy.action", outputId: "example.output.press" }]);
    expect(outcome.attempts).toEqual([expect.objectContaining({
      kind: "temporary_target_override",
      proposalOnly: true,
      executed: false,
      preflightOk: false,
      issues: ["Target override is absent from current sanitized evidence: the target names a parameter the failed action does not offer (parameter_not_offered)."],
      targetOverrideRefusal: { status: "absent", reason: "parameter_not_offered" }
    })]);
    expect(outcome.adaptationIds).toEqual([]);
    expect(outcome.changeProposalIds).toEqual([]);
  });

  it("records a refusal the domain gave no reason for as its status alone", async () => {
    const outcome = await apply({ asked: [], answer: { status: "ambiguous" } });

    expect(outcome.attempts[0]).toMatchObject({ preflightOk: false, targetOverrideRefusal: { status: "ambiguous" } });
    expect((outcome.attempts[0]?.targetOverrideRefusal as JsonObject | undefined)).not.toHaveProperty("reason");
  });

  // Without a proposal grant the override is executed, and that path never
  // consulted the domain, so its refusals held only on the proposal path.
  it("without a proposal grant, executes an override only through the domain's check", async () => {
    const asked: AutomationStudioRuntimeTargetOverrideFailedAction[] = [];
    const refused = await apply({ asked, answer: { status: "absent", reason: "action_not_repairable" }, explicitProposalGrant: false });

    expect(asked).toEqual([{ nodeId: "recorded.press", definitionId: "builtin.policy.action", outputId: "example.output.press" }]);
    expect(refused.attempts).toEqual([expect.objectContaining({
      kind: "temporary_target_override",
      executed: false,
      preflightOk: false,
      traceStatus: "not-run",
      issues: ["Target override is absent from current sanitized evidence: the failed action offers nothing a repair may re-point (action_not_repairable)."],
      targetOverrideRefusal: { status: "absent", reason: "action_not_repairable" }
    })]);
    expect(refused.adaptationIds).toEqual([]);
    expect(refused.changeProposalIds).toEqual([]);
  });

  it("refuses an override on either path when there was no evidence for the domain to judge it against", async () => {
    for (const explicitProposalGrant of [true, false]) {
      const asked: AutomationStudioRuntimeTargetOverrideFailedAction[] = [];
      const outcome = await apply({ asked, answer: { status: "resolved", target: { handles: { control: "candidate.2" } } }, explicitProposalGrant, failureEvidence: null });

      expect(asked, `grant: ${explicitProposalGrant}`).toEqual([]);
      expect(outcome.attempts[0], `grant: ${explicitProposalGrant}`).toMatchObject({ preflightOk: false, executed: false, traceStatus: "not-run", targetOverrideRefusal: { status: "absent", reason: "domain_check_unavailable" } });
      expect(outcome.adaptationIds).toEqual([]);
    }
  });

  it("records no refusal on an override the domain resolved, and proposes it", async () => {
    const outcome = await apply({ asked: [], answer: { status: "resolved", target: { handles: { control: "candidate.2" }, resolvedBy: "domain" } } });

    expect(outcome.attempts[0]).toMatchObject({ preflightOk: true, proposalOnly: true, executed: false, targetResolution: "resolved" });
    expect(outcome.attempts[0]).not.toHaveProperty("targetOverrideRefusal");
    expect(outcome.adaptationIds).toHaveLength(1);
    expect(outcome.changeProposalIds).toHaveLength(1);
  });

  // The plan narrows the patch kinds to the ones that could serve the failure,
  // and nothing downstream read that list: under a `diagnose_and_adapt` grant
  // the model can only answer with a target override, and one was proposed for
  // a navigation failure whose plan allowed only a reroute or a recovery path
  // (live repair campaign, 2026-09-17).
  it.each([true, false])("refuses a patch kind the plan did not allow, without asking the domain or proposing it (grant: %s)", async (explicitProposalGrant) => {
    const asked: AutomationStudioRuntimeTargetOverrideFailedAction[] = [];
    const outcome = await apply({
      asked,
      answer: { status: "resolved", target: { handles: { control: "candidate.2" } } },
      explicitProposalGrant,
      allowedPatchKinds: ["temporary_reroute", "temporary_recovery_subflow_call", "temporary_action_sequence"]
    });

    expect(asked).toEqual([]);
    expect(outcome.attempts).toEqual([expect.objectContaining({
      kind: "temporary_target_override",
      executed: false,
      preflightOk: false,
      traceStatus: "not-run",
      issues: ["The recovery plan allows no target override for this failure."],
      targetOverrideRefusal: { status: "absent", reason: "failure_not_target_repairable" }
    })]);
    expect(outcome.adaptationIds).toEqual([]);
    expect(outcome.changeProposalIds).toEqual([]);
  });

  it("refuses every patch when the plan allowed none", async () => {
    const asked: AutomationStudioRuntimeTargetOverrideFailedAction[] = [];
    const outcome = await apply({ asked, answer: { status: "resolved", target: { handles: { control: "candidate.2" } } }, explicitProposalGrant: false, allowedPatchKinds: [] });

    expect(asked).toEqual([]);
    expect(outcome.attempts[0]).toMatchObject({ preflightOk: false, issues: ["The recovery plan allows no target override for this failure."] });
    expect(outcome.adaptationIds).toEqual([]);
  });
});

// D-3. An exploration exists to find what the failure record could not show,
// and the patch was shown the failure packet alone, so a control only the
// exploration revealed could not be named in the repair. The stub domain below
// numbers its handles per packet, as the web domain does: `candidate.1` in one
// packet and `candidate.1` in another are different controls, which is why a
// handle has to say which packet it came from.
describe("applyAutomationStudioRuntimeRecoveryPatches with explored packets", () => {
  it("accepts a handle only an explored packet issued, asking the domain about that packet with the handle it issued", async () => {
    const asked: Asked[] = [];
    const proposals: AutomationStudioFlowChangeProposal[] = [];
    const outcome = await apply({ asked: [], validate: perPacketDomain(asked), explorationEvidence: carried(), proposals, target: { handles: { control: "explored.2:candidate.7" } } });

    // The failed action still carries the output the recorded node dispatches.
    expect(asked).toEqual([{ page: "page.after-reveal", handles: { control: "candidate.7" }, failedAction: { nodeId: "recorded.press", definitionId: "builtin.policy.action", outputId: "example.output.press" } }]);
    expect(outcome.attempts[0]).toMatchObject({ preflightOk: true, proposalOnly: true, targetResolution: "resolved", targetEvidence: "exploration_evidence" });
    expect(outcome.attempts[0]).not.toHaveProperty("targetOverrideRefusal");
    // What is proposed is the domain's resolution, never Core's qualifier.
    expect(proposals[0]?.patches[0]?.after).toEqual({ handles: { control: "candidate.7" }, page: "page.after-reveal" });
  });

  it("refuses a handle no packet issued with the same refusal as before explored packets existed", async () => {
    const before = await apply({ asked: [], validate: perPacketDomain([]), target: { handles: { control: "candidate.9" } } });
    const refusal = { status: "absent", reason: "handle_not_issued" };
    expect(before.attempts[0]).toMatchObject({ preflightOk: false, targetOverrideRefusal: refusal });

    for (const control of ["candidate.9", "explored.2:candidate.9", "explored.1:candidate.7"]) {
      const asked: Asked[] = [];
      const outcome = await apply({ asked: [], validate: perPacketDomain(asked), explorationEvidence: carried(), target: { handles: { control } } });
      expect(outcome.attempts[0], control).toMatchObject({ preflightOk: false, targetOverrideRefusal: refusal });
      expect(outcome.attempts[0], control).not.toHaveProperty("targetEvidence");
      expect(asked, control).toHaveLength(1);
    }
    // Refused by Core without asking: a packet the request never carried, and
    // a target whose handles came from different packets.
    for (const handles of [{ control: "explored.3:candidate.7" }, { control: "explored.2:candidate.7", row: "candidate.1" }, { control: "explored.1:candidate.1", row: "explored.2:candidate.7" }]) {
      const asked: Asked[] = [];
      const outcome = await apply({ asked: [], validate: perPacketDomain(asked), explorationEvidence: carried(), target: { handles } });
      expect(outcome.attempts[0], JSON.stringify(handles)).toMatchObject({ preflightOk: false, targetOverrideRefusal: refusal });
      expect(asked, JSON.stringify(handles)).toEqual([]);
    }
  });

  it("reads a handle without the qualifier against the failure packet, and records where the target came from", async () => {
    const asked: Asked[] = [];
    const outcome = await apply({ asked: [], validate: perPacketDomain(asked), explorationEvidence: carried(), target: { handles: { control: "candidate.2" } } });

    expect(asked).toEqual([expect.objectContaining({ page: "page.failed", handles: { control: "candidate.2" } })]);
    expect(outcome.attempts[0]).toMatchObject({ preflightOk: true, targetEvidence: "failure_evidence" });
  });

  it("without an exploration slot, judges every handle against the failure packet exactly as written", async () => {
    const asked: Asked[] = [];
    await apply({ asked: [], validate: perPacketDomain(asked), target: { handles: { control: "explored.2:candidate.7" } } });

    expect(asked).toEqual([expect.objectContaining({ page: "page.failed", handles: { control: "explored.2:candidate.7" } })]);
  });

  it("carries a target the domain matched without Core's qualifier", async () => {
    const asked: Asked[] = [];
    const proposals: AutomationStudioFlowChangeProposal[] = [];
    const outcome = await apply({ asked: [], validate: perPacketDomain(asked, "matched"), explorationEvidence: carried(), proposals, target: { handles: { control: "explored.2:candidate.7" } } });

    expect(outcome.attempts[0]).toMatchObject({ preflightOk: true, targetResolution: "resolved", targetEvidence: "exploration_evidence" });
    expect(proposals[0]?.patches[0]?.after).toEqual({ handles: { control: "candidate.7" } });
  });

  it("has nothing to judge an unqualified handle against when the domain captured no failure packet", async () => {
    const asked: Asked[] = [];
    const unqualified = await apply({ asked: [], validate: perPacketDomain(asked), explorationEvidence: carried(), failureEvidence: null, target: { handles: { control: "candidate.2" } } });
    const qualified = await apply({ asked: [], validate: perPacketDomain(asked), explorationEvidence: carried(), failureEvidence: null, target: { handles: { control: "explored.2:candidate.7" } } });

    expect(unqualified.attempts[0]).toMatchObject({ preflightOk: false, targetOverrideRefusal: { status: "absent", reason: "domain_check_unavailable" } });
    expect(qualified.attempts[0]).toMatchObject({ preflightOk: true, targetEvidence: "exploration_evidence" });
    expect(asked.map((question) => question.page)).toEqual(["page.after-reveal"]);
  });

  it("reads a domain check that throws as a refusal, on an explored packet as on the failure packet", async () => {
    const outcome = await apply({ asked: [], validate: () => { throw new Error("The domain could not read the packet."); }, explorationEvidence: carried(), target: { handles: { control: "explored.2:candidate.7" } } });

    expect(outcome.attempts[0]).toMatchObject({ preflightOk: false, targetOverrideRefusal: { status: "absent" } });
    expect(outcome.attempts[0]).not.toHaveProperty("targetEvidence");
  });
});

// Item 4 of the Week 2 exit design. A target override that would run used to
// be refused at preflight whenever the policy withheld external side effects,
// which every granted run does, and nobody was asked. It now says what pressing
// its new target would lastingly do, and the recovery's one gate is asked: a
// class nobody allowed becomes the request the recovery ends on, and a class
// the person allowed lets the patch run as explicitly authorized.
describe("applyAutomationStudioRuntimeRecoveryPatches with the recovery's permission gate", () => {
  const RESOLVED: AutomationStudioRuntimeTargetOverrideEvidenceValidation = { status: "resolved", target: { handles: { control: "candidate.2" }, resolvedBy: "domain" }, control: { name: "Add to queue", kind: "button" } };

  it("turns a patch with a class nobody allowed into the recovery's request, and runs nothing", async () => {
    const gate = recoveryGate([]);
    const outcome = await apply({ asked: [], answer: RESOLVED, explicitProposalGrant: false, gate, consequences: ["create_new", "send_or_publish"], sideEffectsWithheld: true });

    expect(outcome.attempts).toEqual([expect.objectContaining({
      kind: "temporary_target_override",
      executed: false,
      preflightOk: false,
      permissionOutcome: "required",
      permissionRequired: true,
      requestId: "permission-request:repair",
      consequences: ["send_or_publish", "create_new"],
      missing: ["send_or_publish", "create_new"],
      verification: { status: "not_executed", reason: "permission_required" },
      traceStatus: "not-run"
    })]);
    expect(outcome.adaptationIds).toEqual([]);
    expect(outcome.changeProposalIds).toEqual([]);
    const request = gate.request!;
    expect(request.action).toEqual({ kind: "flow_step", id: "builtin.policy.action", ref: "recorded.press", verb: "press" });
    expect(request.control).toEqual({ name: "Add to queue", kind: "button" });
    expect(request.reason.stage).toBe("recovery");
    expect(request.sentence).toBe("To repair the step that failed, the Flow would press \"Add to queue\" (button) each time it runs, which would send or publish something that others will receive or see and create something new that stays. Neither its instruction nor a grant allows that, so the repair stopped to ask.");
    expect(outcome.attempts[0]?.issues).toEqual([`Permission required: ${request.sentence}`]);
    // What a person reads is exactly what Core built.
    expect(parseAutomationStudioActionPermissionRequest(JSON.parse(JSON.stringify(request)))).toEqual(request);
  });

  it("runs a patch whose classes the grant allows, as explicitly authorized", async () => {
    const gate = recoveryGate(["create_new", "send_or_publish"]);
    const outcome = await apply({ asked: [], answer: RESOLVED, explicitProposalGrant: false, gate, consequences: ["create_new", "send_or_publish"], sideEffectsWithheld: true });

    expect(gate.request).toBeUndefined();
    expect(outcome.attempts[0]).toMatchObject({ permissionOutcome: "permitted", consequences: ["send_or_publish", "create_new"], preflightOk: true });
    expect(outcome.attempts[0]?.issues).toEqual([]);
    expect(outcome.adaptationIds).toHaveLength(1);
  });

  it("runs a patch that declares nothing lasting without asking", async () => {
    const gate = recoveryGate([]);
    const outcome = await apply({ asked: [], answer: RESOLVED, explicitProposalGrant: false, gate, consequences: [], sideEffectsWithheld: true });

    expect(gate.request).toBeUndefined();
    expect(outcome.attempts[0]).toMatchObject({ permissionOutcome: "permitted", consequences: [], preflightOk: true });
  });

  it("does not run a patch that did not say what it would do, and asks nobody", async () => {
    const gate = recoveryGate([]);
    const outcome = await apply({ asked: [], answer: RESOLVED, explicitProposalGrant: false, gate, sideEffectsWithheld: true });

    expect(gate.request).toBeUndefined();
    expect(outcome.attempts).toEqual([expect.objectContaining({ permissionOutcome: "undeclared", executed: false, preflightOk: false, verification: { status: "not_executed", reason: "consequences_undeclared" } })]);
    expect(outcome.attempts[0]).not.toHaveProperty("permissionRequired");
    expect(outcome.adaptationIds).toEqual([]);
  });

  it("asks nobody about a patch that could not run whatever they said", async () => {
    const gate = recoveryGate([]);
    const outcome = await apply({ asked: [], answer: { status: "absent", reason: "target_not_equivalent" }, explicitProposalGrant: false, gate, consequences: ["create_new"], sideEffectsWithheld: true });

    expect(gate.request).toBeUndefined();
    expect(outcome.attempts[0]).toMatchObject({ permissionOutcome: "not_asked", preflightOk: false, targetOverrideRefusal: { status: "absent", reason: "target_not_equivalent" } });
    expect(outcome.attempts[0]).not.toHaveProperty("permissionRequired");
  });

  it("withholds a control name the model was never shown", async () => {
    const gate = recoveryGate([], { observed: false });
    await apply({ asked: [], answer: RESOLVED, explicitProposalGrant: false, gate, consequences: ["create_new"], sideEffectsWithheld: true });

    expect(gate.request?.control).toEqual({ name: null, kind: "button" });
    expect(gate.request?.sentence).toContain("a control it cannot name here");
  });

  it("ends at the first request: no later patch is attempted", async () => {
    const gate = recoveryGate([]);
    const outcome = await apply({ asked: [], answer: RESOLVED, explicitProposalGrant: false, gate, consequences: ["create_new"], sideEffectsWithheld: true, repeat: 2 });

    expect(outcome.attempts).toHaveLength(1);
    expect(outcome.attempts[0]).toMatchObject({ permissionRequired: true });
  });

  it("leaves a proposal-only grant and a run with no gate exactly as they were", async () => {
    const proposal = await apply({ asked: [], answer: RESOLVED, gate: recoveryGate([]), consequences: ["create_new"], sideEffectsWithheld: true });
    expect(proposal.attempts[0]).toMatchObject({ proposalOnly: true, preflightOk: true });
    expect(proposal.attempts[0]).not.toHaveProperty("permissionOutcome");

    const ungated = await apply({ asked: [], answer: RESOLVED, explicitProposalGrant: false, consequences: ["create_new"], sideEffectsWithheld: true });
    expect(ungated.attempts[0]).toMatchObject({ preflightOk: false, traceStatus: "not-run" });
    expect(ungated.attempts[0]?.issues).toContain("External side effects are disabled by adaptation policy.");
    expect(ungated.attempts[0]).not.toHaveProperty("permissionOutcome");
  });
});

/** One recovery's gate, holding the grant's classes and, unless told otherwise, having shown the model the failure packet. */
function recoveryGate(granted: AutomationStudioActionConsequence[], options: { observed?: boolean } = {}): AutomationStudioActionPermissionGate {
  const gate = new AutomationStudioActionPermissionGate({ permittedConsequences: granted, stage: "recovery", instructionIds: [], newRequestId: () => "permission-request:repair", now: () => 5 });
  if (options.observed !== false) gate.observe(FAILURE_PACKET);
  return gate;
}

type Asked = { page: unknown; handles: unknown; failedAction: AutomationStudioRuntimeTargetOverrideFailedAction };

/**
 * A domain whose handles mean something only in the packet that issued them.
 * A handle the packet lists resolves to a target naming that packet; any other
 * is refused as never issued.
 */
function perPacketDomain(asked: Asked[], accept: "resolved" | "matched" = "resolved"): NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["validateTargetOverrideEvidence"]> {
  return (evidence, target, failedAction) => {
    asked.push({ page: evidence.page, handles: target.handles, failedAction });
    const issued = Array.isArray(evidence.controls) ? evidence.controls : [];
    if (!Object.values(target.handles).every((handle) => issued.includes(handle))) return { status: "absent", reason: "handle_not_issued" };
    return accept === "matched" ? { status: "matched" } : { status: "resolved", target: { handles: target.handles, page: evidence.page ?? null } };
  };
}

const FAILURE_PACKET: JsonObject = { schemaVersion: "example.failure-evidence.v1", page: "page.failed", controls: ["candidate.1", "candidate.2"], names: ["Save as draft", "Add to queue"] };

/** Two explored pages, carried the way the patch request carries them. `candidate.7` is only on the second. */
function carried(): AutomationStudioLlmContextPacket["explorationEvidence"] {
  const slot = packAutomationStudioLlmContext({
    taskKind: "runtime_patch",
    projectId: "project.recorded",
    flowId: "flow.recorded",
    instructions: [],
    deniedEvidenceKeys: [],
    explorationEvidence: {
      maxBytes: 8_000,
      packets: [
        { evidenceId: "explored.1", toolId: "example.inspect", packet: { schemaVersion: "example.page.v1", page: "page.before-reveal", controls: ["candidate.1"] } },
        { evidenceId: "explored.2", toolId: "example.reveal", packet: { schemaVersion: "example.page.v1", page: "page.after-reveal", controls: ["candidate.1", "candidate.7"] } }
      ]
    }
  }).explorationEvidence;
  expect(slot?.packets.map((entry) => entry.evidenceId)).toEqual(["explored.1", "explored.2"]);
  return slot;
}

async function apply(options: {
  asked: AutomationStudioRuntimeTargetOverrideFailedAction[];
  answer?: AutomationStudioRuntimeTargetOverrideEvidenceValidation;
  /** The domain's check, when the test needs more than one fixed answer. */
  validate?: NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["validateTargetOverrideEvidence"]>;
  /** Default `true`: the Lab's `diagnose_and_adapt`. `false` executes the override. */
  explicitProposalGrant?: boolean;
  /** `null`: the domain captured no failure evidence. */
  failureEvidence?: JsonObject | null;
  explorationEvidence?: AutomationStudioLlmContextPacket["explorationEvidence"];
  target?: AutomationStudioRuntimeTargetOverrideTarget;
  /** Every change proposal saved. */
  proposals?: AutomationStudioFlowChangeProposal[];
  /** The kinds the plan allowed; by default, what it allows for a target that was not found. */
  allowedPatchKinds?: AutomationStudioRuntimePatch["kind"][];
  /** The recovery's permission gate, and what the patch says it would lastingly do. */
  gate?: AutomationStudioActionPermissionGate;
  consequences?: AutomationStudioActionConsequence[];
  /** The production default a granted run has: no external side effects, and none authorized. */
  sideEffectsWithheld?: true;
  /** The same patch this many times, in one answer. */
  repeat?: number;
}) {
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = {
    domainId: "example.domain",
    deniedEvidenceKeys: [],
    tools: [],
    executeTool: async () => { throw new Error("No tool is executed while a patch is applied."); },
    validateTargetOverrideEvidence: options.validate ?? ((_evidence, _target, failedAction) => {
      options.asked.push(failedAction);
      if (!options.answer) throw new Error("The test named neither an answer nor a check.");
      return options.answer;
    })
  };
  const patch: AutomationStudioRuntimePatch = {
    kind: "temporary_target_override",
    targetNodeId: "recorded.press",
    target: options.target ?? { handles: { control: "candidate.2" } },
    ...(options.consequences ? { consequences: options.consequences } : {}),
    reason: "The control was renamed."
  };
  return await applyAutomationStudioRuntimeRecoveryPatches({
    ports: {
      llmEvidenceRuntime: binding,
      saveFlowChangeProposal: async (proposal) => {
        options.proposals?.push(proposal);
        return proposal;
      },
      saveFlowAdaptation: async (adaptation) => adaptation,
      promoteRuntimeAdaptation: async (input) => input.adaptation
    },
    context: options.sideEffectsWithheld ? { ...context(), policy: { ...policy(), allowExternalSideEffects: false } } : context(),
    runId: "run.recorded",
    flow: recordedFlow(),
    failedAttempt: failedAttempt(),
    patches: Array.from({ length: options.repeat ?? 1 }, () => patch),
    allowedPatchKinds: options.allowedPatchKinds ?? ["temporary_target_override", "temporary_wait_retry"],
    explicitProposalGrant: options.explicitProposalGrant ?? true,
    ...(options.failureEvidence === null ? {} : { failureEvidence: options.failureEvidence ?? FAILURE_PACKET }),
    ...(options.explorationEvidence ? { explorationEvidence: options.explorationEvidence } : {}),
    ...(options.gate ? { permissionGate: options.gate } : {}),
    // The executed path is otherwise refused by the policy before the domain is
    // asked, which would hide whether the domain's check gates it.
    authorizedExternalSideEffects: !options.sideEffectsWithheld
  });
}

/** Two recorded actions, written the way approving a recording writes them. */
function recordedFlow(): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: "flow.recorded",
    ownerKind: "routine",
    ownerId: "routine.recorded",
    name: "Recorded Flow",
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      { id: "recorded.fill", definitionId: "builtin.policy.action", parameterValues: { outputId: "example.output.fill", parameters: { control: "recorded.fill" } } },
      { id: "recorded.press", definitionId: "builtin.policy.action", parameterValues: { outputId: "example.output.press", parameters: { control: "recorded.press" } } }
    ],
    edges: [{ id: "fill.press", sourceNodeId: "recorded.fill", sourcePortId: "success", targetNodeId: "recorded.press", targetPortId: "ready" }]
  };
}

function failedAttempt(): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: "recorded.press.attempt.1",
    nodeId: "recorded.press",
    definitionId: "builtin.policy.action",
    startedAt: 1,
    finishedAt: 2,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    message: "The recorded control was not found.",
    failure: { category: "target_not_found", code: "example.target.not_found", retryable: true }
  };
}

function context(): AutomationStudioRuntimeAdaptationContext {
  return {
    projectId: "project.recorded",
    flowId: "flow.recorded",
    settings: {
      mode: "continuous_adaptive",
      allowLlmIntervention: true,
      allowRuntimeRecovery: true,
      allowAdaptationCreation: true,
      proposalApprovalMode: "manual",
      allowPromotion: false,
      budgets: { exhaustedBehavior: "stop" }
    },
    policy: policy(),
    behavior: { invokeLlm: true, runRecovery: false, createAdaptations: true, proposalApprovalMode: "manual", promoteAdaptations: true },
    metrics: {
      deterministicSuccessRuns: 0,
      llmInterventionsPerRun: 0,
      unresolvedFailures: 1,
      repeatedTriggers: [],
      acceptedAdaptations: 0,
      rejectedAdaptations: 0,
      stabilityScore: 0.5
    },
    budgetState: { interventionsThisRun: 0, tokensThisRun: 0, costUsdThisTrainingWindow: 0 },
    budgetDecision: { ok: true, exhausted: [], behavior: "continue" },
    runsCompleted: 0,
    recentRunCount: 0,
    recentAdaptationCount: 0,
    recentAdaptations: [],
    resultCheckSchedule: resolveAutomationStudioResultCheckSchedule("initial_then_exponential"),
    resultCheckState: { ordinal: 1, lastCheckedOrdinal: null, checksPassed: 0, lastStatus: null },
    resultCheckEpoch: 1,
    diagnostics: []
  };
}

function policy(): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.recorded",
    scope: { kind: "flow", flowId: "flow.recorded" },
    preset: "adaptive",
    proposalMode: "manual",
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: true,
    allowCreateSubflows: true,
    allowModifyRouter: true,
    allowModifyExpectations: true,
    allowModifyActionTargets: true,
    allowDeleteOrDisableBehavior: false,
    allowExternalSideEffects: true,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: true,
    createdAt: 1,
    updatedAt: 1
  };
}
