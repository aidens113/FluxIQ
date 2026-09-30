// The one rule about asking a person, pinned so that re-gating ordinary work
// fails the build rather than a live run.
//
// **The rule, from the product owner.** A person asking for an automation has,
// by that act, granted everything the automation needs in order to work. There
// is no second permission to obtain for the product doing its job. Only a
// genuinely high-risk real-world consequence may ask a person: deleting
// something, and completing a purchase, payment or transfer. Those two, and
// nothing else.
//
// **What may never be gated at all**: triggering a repair, repairing again,
// editing or re-authoring a Flow or subflow, rolling a version back, re-running,
// exploring, extracting, judging its own answer, retrying a failed node,
// persisting what it learned. Only an explicit setting, or the person telling a
// Flow in words not to do some specific thing, narrows this.
//
// This file exists because the rule had already been stated repeatedly and the
// product had drifted back anyway -- shipping a default Flow that could not
// repair itself, and a standing gate on every send. Guidance did not hold it;
// these rows are meant to.
//
// Each row names the whole default rather than probing one field, so a change
// that re-gates something is a named failure here and never a surprise on a live
// run. They span the four places the decision is actually made, which is why they
// sit above all four rather than beside one.

import { describe, expect, it } from "vitest";
import {
  automationStudioInterventionMode,
  defaultAutomationStudioFlowSettingsMetadata,
  validateAutomationStudioAdaptationPolicy,
  type AutomationStudioAdaptationPolicy,
  type AutomationStudioFlowArtifact
} from "../model/index.ts";
import {
  AUTOMATION_STUDIO_ACTION_CONSEQUENCES,
  AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES,
  isAutomationStudioDestructiveActionConsequence
} from "../runtime/action-permissions/index.ts";
import type { AutomationStudioChangeConfidenceDecision } from "../runtime/flow-change/index.ts";
import { adaptationPolicyFromFlowMetadata, trainingModeSettingsFromMetadata } from "../runtime/service/flow-settings/index.ts";
import {
  behaviorForAutomationStudioTrainingMode,
  decideAutomationStudioAdaptationPromotionGate,
  decideAutomationStudioBootstrapApplyGate,
  decideAutomationStudioLlmInvocationGate
} from "../runtime/index.ts";

/** The exhaustive answer. Anything else in this list asks a person about ordinary work. */
const ASKS_A_PERSON = ["move_money", "delete"] as const;

/** A Flow with no metadata at all: the reader's own fallbacks, with nothing to read. */
const NOTHING_CONFIGURED = {} as const;

const FLOW = { flowId: "flow.one", createdAt: 1, updatedAt: 2 } as unknown as AutomationStudioFlowArtifact;

/** A change that has already proved itself: one succeeded trial, which is what promotion turns on. */
const PROVED: AutomationStudioChangeConfidenceDecision = { tier: "provisional", trials: 1, replays: 0, replaysRequired: 1 };

function policyWith(overrides: Partial<AutomationStudioAdaptationPolicy>): AutomationStudioAdaptationPolicy {
  return { ...adaptationPolicyFromFlowMetadata(FLOW, NOTHING_CONFIGURED), ...overrides };
}

describe("the classes that reach a person", () => {
  it("are delete and money movement, and nothing else", () => {
    expect(AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES).toEqual([...ASKS_A_PERSON]);
  });

  // Named one by one, so re-gating any single class fails on its own row and the
  // failure says which class came back.
  it.each(["send_or_publish", "modify_existing", "create_new"] as const)("never asks about %s", (consequence) => {
    expect(AUTOMATION_STUDIO_ACTION_CONSEQUENCES).toContain(consequence);
    expect(isAutomationStudioDestructiveActionConsequence(consequence)).toBe(false);
  });
});

// The defect this file was written for. A Flow created out of the box shipped
// `no_llm_intervention` with a `locked` adaptation policy, so it could not repair
// itself, re-author a subflow, reroute, retarget an action, create a recovery
// path or keep what it learned -- and every proposal it did manage waited on a
// person. That is the automation's own work, and asking for the automation is
// the permission for it.
describe("what a Flow nobody has configured may do about itself", () => {
  it("is fully adaptive, not locked", () => {
    const metadata = defaultAutomationStudioFlowSettingsMetadata();

    expect(metadata.adaptationMode).toBe("fully_adaptive");
    expect(automationStudioInterventionMode(metadata)).toBe("fully_adaptive");
  });

  it("may invoke a model, create adaptations and keep them", () => {
    const metadata = defaultAutomationStudioFlowSettingsMetadata();
    const training = trainingModeSettingsFromMetadata(metadata);

    expect(training).toMatchObject({
      allowLlmIntervention: true,
      allowRuntimeRecovery: true,
      allowAdaptationCreation: true,
      allowPromotion: true,
      requireFirstManualReviewBeforeAutoPromotion: false
    });
    expect(behaviorForAutomationStudioTrainingMode(training)).toMatchObject({
      invokeLlm: true,
      runRecovery: true,
      createAdaptations: true,
      promoteAdaptations: true
    });
  });

  it("may re-author every part of itself, and act on a page, with nothing forcing an approval", () => {
    const policy = adaptationPolicyFromFlowMetadata(FLOW, defaultAutomationStudioFlowSettingsMetadata());

    expect(policy).toMatchObject({
      preset: "adaptive",
      proposalMode: "auto",
      allowRuntimeRecovery: true,
      allowCreateRecoveryPaths: true,
      allowModifySubflows: true,
      allowCreateSubflows: true,
      allowModifyRouter: true,
      allowModifyExpectations: true,
      allowModifyActionTargets: true,
      allowDeleteOrDisableBehavior: true,
      allowExternalSideEffects: true,
      requireApprovalForDestructiveChanges: false,
      requireApprovalForExternalSideEffects: false
    });
  });

  // Silence has to fall the same way as the written default, or a Flow saved
  // before these fields existed is quietly locked while a new one is not.
  it("falls open when the settings are missing entirely, not closed", () => {
    expect(trainingModeSettingsFromMetadata(NOTHING_CONFIGURED)).toMatchObject({
      mode: "continuous_adaptive",
      allowLlmIntervention: true,
      allowRuntimeRecovery: true,
      allowAdaptationCreation: true,
      allowPromotion: true
    });
    expect(adaptationPolicyFromFlowMetadata(FLOW, NOTHING_CONFIGURED)).toMatchObject({
      allowDeleteOrDisableBehavior: true,
      allowExternalSideEffects: true,
      requireApprovalForDestructiveChanges: false,
      requireApprovalForExternalSideEffects: false
    });
    expect(behaviorForAutomationStudioTrainingMode(trainingModeSettingsFromMetadata(NOTHING_CONFIGURED)))
      .toMatchObject({ invokeLlm: true, createAdaptations: true, promoteAdaptations: true });
  });
});

describe("nothing may force an approval gate back on", () => {
  // Two validation rules used to refuse a policy as invalid unless it required
  // approval -- one for removing a step of a Flow, one for acting on a page. A
  // gate that cannot be switched off is a mechanism that can refuse the product
  // doing its job, which is a defect rather than a setting.
  it("accepts a policy that allows the work and requires approval for none of it", () => {
    const result = validateAutomationStudioAdaptationPolicy(policyWith({
      allowDeleteOrDisableBehavior: true,
      allowExternalSideEffects: true,
      requireApprovalForDestructiveChanges: false,
      requireApprovalForExternalSideEffects: false
    }));

    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("still accepts one that asks for those approvals, because a person may choose them", () => {
    const result = validateAutomationStudioAdaptationPolicy(policyWith({
      allowDeleteOrDisableBehavior: true,
      allowExternalSideEffects: true,
      requireApprovalForDestructiveChanges: true,
      requireApprovalForExternalSideEffects: true
    }));

    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});

describe("the automation's own work is never refused", () => {
  // Wanting to review a change is not saying the run may not try to repair
  // itself. Conflating the two left a person who asked to see changes with no
  // repair at all, and therefore nothing to review.
  it("invokes a model to repair a run even when a person reviews the proposal", () => {
    const settings = { ...trainingModeSettingsFromMetadata(NOTHING_CONFIGURED), proposalApprovalMode: "manual" as const };

    expect(decideAutomationStudioLlmInvocationGate({ settings })).toMatchObject({ invoke: true });
  });

  it("keeps a proved repair without a person, whatever Core rated it and whether or not it acts on a page", () => {
    for (const riskLevel of ["low", "medium", "high", "destructive"] as const) {
      for (const hasExternalSideEffects of [false, true]) {
        expect(decideAutomationStudioAdaptationPromotionGate({
          approvalMode: "auto",
          riskLevel,
          promoteAdaptations: true,
          hasExternalSideEffects,
          patchKinds: ["edit_router"],
          confidence: PROVED
        }), `${riskLevel}/${hasExternalSideEffects}`).toMatchObject({ autoApply: true, requiresManualApproval: false });
      }
    }
  });

  // Extending a Flow that already runs is re-authoring it, which is the
  // automation's own work. It used to reach a person purely for being an
  // `extend` rather than a `create`.
  it("keeps a proved re-authoring of an existing Flow, not only a newly created one", () => {
    for (const mode of ["create", "extend"] as const) {
      expect(decideAutomationStudioBootstrapApplyGate({
        approvalMode: "auto",
        riskLevel: "high",
        promoteAdaptations: true,
        hasExternalSideEffects: true,
        mode,
        confidence: PROVED
      }), mode).toMatchObject({ autoApply: true, requiresManualApproval: false });
    }
  });

  // What is left is evidence, not permission: a change nobody has trialled
  // successfully is not kept, and the repair loop's next trial is what changes
  // that. This row is here so removing the gates above is not read as removing
  // this one too.
  it("still declines to keep a change that no trial has proved", () => {
    expect(decideAutomationStudioAdaptationPromotionGate({
      approvalMode: "auto",
      riskLevel: "low",
      promoteAdaptations: true,
      patchKinds: ["edit_router"],
      confidence: { tier: "unverified", trials: 0, replays: 0, replaysRequired: 1 }
    })).toMatchObject({ autoApply: false });
  });
});
