import { randomUUID } from "node:crypto";
import { automationStudioCandidateRequirementsDigest } from "./identity.ts";
import { evaluateAutomationStudioCandidateRequirements } from "./predicates.ts";
import type { AutomationStudioCandidateRequirementBrief, AutomationStudioCandidateVerificationIdentity, AutomationStudioCandidateVerificationOutcome, AutomationStudioCandidateVerificationPorts, AutomationStudioCandidateVerificationReceipt, AutomationStudioCandidateObservedEvidence, AutomationStudioCandidateExecutionReceipt, AutomationStudioCandidateStartReceipt } from "./contracts.ts";

/** One candidate attempt; durable promotion/CAS remains the project store's duty. */
export class AutomationStudioCandidateVerificationController {
  private readonly brief: AutomationStudioCandidateRequirementBrief;
  private readonly identity: AutomationStudioCandidateVerificationIdentity;
  private readonly conditionsDigest: string;
  private attempt: Promise<AutomationStudioCandidateVerificationOutcome> | undefined;
  constructor(private readonly input: {
    candidate: Omit<AutomationStudioCandidateVerificationIdentity, "requirementsDigest">;
    brief: AutomationStudioCandidateRequirementBrief;
    conditionsDigest: string;
    ports: AutomationStudioCandidateVerificationPorts;
    signal?: AbortSignal;
  }) {
    this.conditionsDigest = input.conditionsDigest;
    this.brief = structuredClone(input.brief);
    this.identity = { ...structuredClone(input.candidate), requirementsDigest: automationStudioCandidateRequirementsDigest(this.brief) };
    if (!input.conditionsDigest || !this.identity.projectId || !this.identity.flowId || !this.identity.digest || !this.identity.baseDependencyDigest || !Number.isInteger(this.identity.revision) || this.identity.revision < 1) throw new Error("Candidate verification identity/start is invalid.");
  }
  expectedIdentity(): AutomationStudioCandidateVerificationIdentity { return structuredClone(this.identity); }
  async verifyAndPromote(): Promise<AutomationStudioCandidateVerificationOutcome> {
    this.attempt ??= this.verify();
    return structuredClone(await this.attempt);
  }
  private async fresh(): Promise<boolean> {
    return !this.input.signal?.aborted && same(this.identity, await this.input.ports.currentIdentity());
  }
  private async verify(): Promise<AutomationStudioCandidateVerificationOutcome> {
    const draft = (code: string, receipt?: AutomationStudioCandidateVerificationReceipt): AutomationStudioCandidateVerificationOutcome => ({ status: "draft", code, ...(receipt ? { receipt } : {}) });
    try {
      if (this.brief.interpretationStatus !== "complete" || this.brief.instructions.some((instruction) => !this.brief.requirements.some((requirement) => requirement.source.instructionId === instruction.instructionId))) return draft("candidate.requirements_interpretation_unknown");
      if (!await this.fresh()) return draft(this.input.signal?.aborted ? "candidate.cancelled" : "candidate.stale");
      const context = { identity: structuredClone(this.identity), ...(this.input.signal ? { signal: this.input.signal } : {}) };
      const start = structuredClone(await this.input.ports.prepareStart({ ...context, conditionsDigest: this.conditionsDigest }));
      if (!start.receiptId || start.conditionsDigest !== this.conditionsDigest || !validTime(start.preparedAt) || !Number.isInteger(start.pageGeneration) || start.pageGeneration < 0 || new Set(start.subjectStates.map((entry) => entry.observationId)).size !== start.subjectStates.length || !start.subjectStates.every((entry) => entry.observationId && entry.subjectId && typeof entry.existed === "boolean" && validTime(entry.observedAt) && entry.observedAt <= start.preparedAt && entry.pageGeneration === start.pageGeneration)) return draft("candidate.start_unconfirmed");
      if (!await this.fresh()) return draft("candidate.stale_or_cancelled");
      const runId = `candidate.run.${randomUUID()}`;
      const execution = structuredClone(await this.input.ports.execute({ ...context, runId, start: structuredClone(start) }));
      if (!executionValid(execution, this.identity, runId, start)) return draft("candidate.execution_receipt_invalid");
      if (!await this.fresh()) return draft("candidate.stale_or_cancelled");
      if (execution.status !== "succeeded") return draft(`candidate.execution_${execution.status}`);
      const evidence = structuredClone(await this.input.ports.observe({ ...context, execution: structuredClone(execution), brief: structuredClone(this.brief), start: structuredClone(start) }));
      if (!await this.fresh()) return draft("candidate.stale_or_cancelled");
      if (!evidenceValid(evidence, execution, start)) return draft("candidate.observation_provenance_invalid");
      const requirements = evaluateAutomationStudioCandidateRequirements({ brief: this.brief, start, execution, evidence });
      const verdict = requirements.some((entry) => entry.outcome === "unsatisfied") ? "unsatisfied" : requirements.every((entry) => entry.outcome === "satisfied") ? "satisfied" : "unknown";
      const receipt: AutomationStudioCandidateVerificationReceipt = { schemaVersion: "candidate.verification.v1", receiptId: `candidate.receipt.${randomUUID()}`, identity: structuredClone(this.identity), runId, startReceipt: start, execution, evidence, requirements, verdict };
      if (verdict !== "satisfied") return draft(`candidate.requirements_${verdict}`, receipt);
      if (!await this.fresh()) return draft("candidate.stale_or_cancelled", receipt);
      try {
      const applied = await this.input.ports.promote({ expectedIdentity: structuredClone(this.identity), expectedBaseDigest: this.identity.baseDependencyDigest, idempotencyKey: receipt.receiptId, receipt: structuredClone(receipt), ...(this.input.signal ? { signal: this.input.signal } : {}) });
      if (applied === "promoted" || applied === "already_promoted") return { status: "promoted", receipt };
      return draft(applied === "stale" ? "candidate.promotion_stale" : "candidate.promotion_unconfirmed", receipt);
      } catch {
        // A lost acknowledgement may follow an applied promotion. Keep the
        // satisfied receipt for store reconciliation and never repeat it here.
        return draft("candidate.promotion_outcome_unknown", receipt);
      }
    } catch {
      return draft(this.input.signal?.aborted ? "candidate.cancelled" : "candidate.verification_unavailable");
    }
  }
}
function same(a: AutomationStudioCandidateVerificationIdentity, b: AutomationStudioCandidateVerificationIdentity | null): boolean {
  return b !== null && a.projectId === b.projectId && a.flowId === b.flowId && a.revision === b.revision && a.digest === b.digest && a.baseDependencyDigest === b.baseDependencyDigest && a.requirementsDigest === b.requirementsDigest;
}
function validTime(value: number): boolean { return Number.isFinite(value) && value >= 0; }
function executionValid(receipt: AutomationStudioCandidateExecutionReceipt, identity: AutomationStudioCandidateVerificationIdentity, runId: string, start: AutomationStudioCandidateStartReceipt): boolean {
  return ["succeeded", "failed", "cancelled", "not_run"].includes(receipt.status) && same(identity, receipt.identity) && receipt.runId === runId && receipt.startReceiptId === start.receiptId && validTime(receipt.startedAt) && receipt.startedAt >= start.preparedAt && validTime(receipt.finishedAt) && receipt.finishedAt >= receipt.startedAt && Number.isInteger(receipt.executedNodeCount) && receipt.executedNodeCount >= 0 && new Set(receipt.commands.map((entry) => entry.commandId)).size === receipt.commands.length && receipt.commands.every((entry) => entry.commandId && ["performed", "withheld", "no_op", "unknown"].includes(entry.outcome) && entry.subjectIds.length > 0 && entry.subjectIds.every((id) => id) && validTime(entry.finishedAt) && entry.finishedAt >= receipt.startedAt && entry.finishedAt <= receipt.finishedAt);
}
function evidenceValid(evidence: AutomationStudioCandidateObservedEvidence, execution: AutomationStudioCandidateExecutionReceipt, start: AutomationStudioCandidateStartReceipt): boolean {
  if (!same(execution.identity, evidence.identity) || evidence.runId !== execution.runId || evidence.startReceiptId !== start.receiptId || new Set([...evidence.observations, ...evidence.enumerations].map((entry) => entry.observationId)).size !== evidence.observations.length + evidence.enumerations.length || new Set(evidence.enumerations.map((entry) => entry.scopeId)).size !== evidence.enumerations.length) return false;
  return evidence.observations.every((entry) => entry.observationId && entry.subjectId && validTime(entry.observedAt) && entry.observedAt >= execution.finishedAt && Number.isInteger(entry.pageGeneration) && entry.pageGeneration >= start.pageGeneration && entry.completeFields.every((field) => Object.prototype.hasOwnProperty.call(entry.fields, field))) && evidence.enumerations.every((entry) => entry.scopeId && entry.observationId && validTime(entry.observedAt) && entry.observedAt >= execution.finishedAt && Number.isInteger(entry.pageGeneration) && entry.pageGeneration >= start.pageGeneration && typeof entry.complete === "boolean" && new Set(entry.subjectIds).size === entry.subjectIds.length && entry.subjectIds.every((id) => id));
}
