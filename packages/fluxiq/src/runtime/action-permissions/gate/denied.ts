import type { AutomationStudioActionPermissionCheck } from "../../../flows/executable/permissions/index.ts";
import { beginAutomationStudioActionAssessment } from "../assessment/index.ts";
import { readAutomationStudioActionDeclaration } from "../declaration/index.ts";
import { automationStudioActionPermissionProjection } from "../declaration/index.ts";
import { automationStudioActionAssessmentEffect } from "../assessment/index.ts";
import { automationStudioDestructiveConsequences } from "../destructive/index.ts";

/**
 * The check for an action run where no run stands behind it, so there is
 * nobody to ask: a caller that drove a domain's option directly. It reads the
 * declaration like any other and permits nothing that has a consequence.
 */
export const automationStudioActionPermissionDenied: AutomationStudioActionPermissionCheck = async (declaration) => {
  const assessment = beginAutomationStudioActionAssessment();
  const read = readAutomationStudioActionDeclaration(declaration);
  // Nothing declared is nothing to refuse. Refusing it here would make an
  // action that honestly says it causes nothing the one answer that cannot be
  // given, which is the incentive this whole seam exists to remove. An action
  // that only reads is the same case: there is nothing it could have done that
  // outlasts it, so there is nobody who would need to be asked.
  const projection = automationStudioActionPermissionProjection(read);
  const observedEffect = automationStudioActionAssessmentEffect(read, projection);
  if (assessment.veto(observedEffect)) {
    assessment.settle({ effect: observedEffect, permitted: false });
    return { permitted: false, missing: [], requestId: null };
  }
  // Nor is there anybody to ask about making or editing something: those are
  // not gated anywhere (`destructive.ts`), so having no run behind the action
  // changes nothing about them. What it changes is that a gated class has no
  // person who could have permitted it, and no request to raise.
  const missing = automationStudioDestructiveConsequences(projection.consequences);
  assessment.settle({ effect: observedEffect, permitted: missing.length === 0 });
  if (!missing.length) return { permitted: true };
  return { permitted: false, missing, requestId: null };
};
