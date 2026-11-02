import type { JsonObject } from "../../../../../core/index.ts";
import { createGateReentryAuthority, type GateReentryBinding, type GateReentryPermit } from "../../../../../runtime/agents/gates/reentry/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../llm/evidence-loop/index.ts";
import { candidateTrialAuthority, candidateTrialRequestKey } from "../authority/index.ts";
import type { CandidateTrialAuthority, CandidateTrialCompletion, CandidateTrialCheckoutSnapshot } from "../contracts/index.ts";
import type { CandidateTrialReentryInput } from "./input.ts";

/** Only original completed source evidence can lift this gate's stale repeat/memo once. */
export class CandidateTrialReentry {
  private readonly proofs = new WeakMap<object, GateReentryBinding>();
  private readonly authority = createGateReentryAuthority({ scope: this, readCompleted: (proof) => this.proofs.get(proof) ?? null });
  private ready: { permit: GateReentryPermit; binding: GateReentryBinding; snapshot: CandidateTrialCheckoutSnapshot; source: CandidateTrialAuthority; retained: object | undefined } | undefined;
  private prepared: CandidateTrialAuthority | undefined;

  constructor(private readonly input: CandidateTrialReentryInput) {}

  entered(): void {
    this.authority.issuer.invalidate(this.input.gate);
    this.ready = undefined;
  }

  completed(original: { authority: CandidateTrialAuthority; proof: CandidateTrialCompletion } | undefined): void {
    if (!original) return;
    const completed = original.authority.consumeCompletion(original.proof);
    const latest = this.input.latest();
    const available = this.input.available();
    if (!completed || !latest || "why" in available || available.trials < 1 || available.trials >= this.input.maxTrials) return;
    const snapshot = completed.checkout;
    if (snapshot.gate !== this.input.gate || snapshot.receipt.revision !== latest.revision || snapshot.receipt.digest !== latest.digest
      || snapshot.receipt.baseDependencyDigest !== latest.baseDependencyDigest || candidateTrialAuthority(snapshot.port) !== original.authority) return;
    const binding: GateReentryBinding = Object.freeze({ scope: this, gate: this.input.gate, requestKey: snapshot.requestKey, generation: completed.generation, completedOrdinal: this.input.completedOrdinal(), remaining: this.input.maxTrials - available.trials });
    const proof = Object.freeze({});
    this.proofs.set(proof, binding);
    const permit = this.authority.issuer.issue(proof);
    this.proofs.delete(proof);
    this.ready = permit ? { permit, binding, snapshot, source: original.authority, retained: completed.kind === "read_only" ? completed.retained : undefined } : undefined;
  }

  claim(tool: AutomationStudioLlmEvidenceTool, value: JsonObject): boolean {
    const ready = this.ready;
    if (!ready || tool !== this.input.tool) return false;
    const latest = this.input.latest();
    const available = this.input.available();
    if (!latest || "why" in available || this.input.completedOrdinal() !== ready.binding.completedOrdinal
      || latest.revision !== ready.snapshot.receipt.revision || latest.digest !== ready.snapshot.receipt.digest
      || latest.baseDependencyDigest !== ready.snapshot.receipt.baseDependencyDigest
      || candidateTrialAuthority(ready.snapshot.port) !== ready.source
      || !matchesPair(value, latest)
      || candidateTrialRequestKey(ready.snapshot.candidateId, latest, value) !== ready.binding.requestKey) return false;
    if (ready.retained) {
      if (!ready.source.pinReadOnly(this.input.gate, latest, value, ready.retained)) return false;
      this.prepared = ready.source;
    }
    this.ready = undefined;
    return this.authority.consumer.consume(ready.permit, ready.binding);
  }

  dispose(): void {
    this.prepared?.discardPrepared(this.input.gate);
    this.prepared = undefined;
    this.ready = undefined;
    this.authority.issuer.dispose();
  }
}

function matchesPair(value: JsonObject, latest: { revision: number; digest: string }): boolean {
  if (Object.keys(value).some(key => key !== "revision" && key !== "digest" && key !== "cannotUndo")) return false;
  if (value.revision !== undefined || value.digest !== undefined) return value.revision === latest.revision && value.digest === latest.digest;
  return true;
}
