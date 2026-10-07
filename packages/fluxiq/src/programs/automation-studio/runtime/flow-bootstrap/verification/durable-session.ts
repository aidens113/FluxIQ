import type { AutomationStudioCandidateDurableBinding, AutomationStudioCandidateLedgerRequest, AutomationStudioCandidateLedgerStage } from "../../../storage/project/candidate-verification/index.ts";
import { AutomationStudioCandidateVerificationStore } from "../../../storage/project/candidate-verification/index.ts";
import { AutomationStudioCandidateVerificationController } from "./controller.ts";
import type { AutomationStudioCandidateVerificationOutcome, AutomationStudioCandidateVerificationPorts } from "./contracts.ts";

/** Internal trusted-port orchestration; production promotion is deliberately closed. */
export class AutomationStudioCandidateDurableSession {
  private attempt: Promise<AutomationStudioCandidateVerificationOutcome> | undefined;
  private readonly request: AutomationStudioCandidateLedgerRequest;
  constructor(private readonly input: {
    request: AutomationStudioCandidateLedgerRequest;
    store: AutomationStudioCandidateVerificationStore | null;
    currentBinding(): Promise<AutomationStudioCandidateDurableBinding | null>;
    ports: Omit<AutomationStudioCandidateVerificationPorts, "promote" | "currentIdentity">;
    signal?: AbortSignal;
  }) { this.request = structuredClone(input.request); }
  async verify(): Promise<AutomationStudioCandidateVerificationOutcome> {
    this.attempt ??= this.run(); return structuredClone(await this.attempt);
  }
  private async run(): Promise<AutomationStudioCandidateVerificationOutcome> {
    const draft = (code: string): AutomationStudioCandidateVerificationOutcome => ({ status: "draft", code });
    const store = this.input.store;
    if (!store) return draft("candidate.promotion_unsupported_storage_authority");
    let claimed = false, uncertain = false, verificationWritten = false;
    const fresh = async () => !this.input.signal?.aborted && canonical(await this.input.currentBinding()) === canonical(this.request.binding);
    const stage = async <T>(name: AutomationStudioCandidateLedgerStage, operation: () => Promise<T>): Promise<T> => {
      if (!await fresh()) throw new Error("candidate.stale_or_cancelled");
      await store.beginStage(this.request.attemptId, name);
      try {
        const result = await operation();
        await store.commitStage(this.request.attemptId, name, result);
        return result;
      } catch (error) { uncertain = true; throw error; }
    };
    try {
      if (!await fresh()) return draft(this.input.signal?.aborted ? "candidate.cancelled" : "candidate.stale");
      const claim = await store.claim(this.request);
      if (!claim.claimed) {
        if (claim.record.status === "committed" && claim.record.outcome) return claim.record.outcome;
        return draft("candidate.verification_outcome_unknown");
      }
      claimed = true;
      const controller = new AutomationStudioCandidateVerificationController({
        candidate: this.request.binding.identity, brief: this.request.brief, conditionsDigest: this.request.conditionsDigest,
        ...(this.input.signal ? { signal: this.input.signal } : {}),
        ports: {
          currentIdentity: async () => await fresh() ? structuredClone(this.request.binding.identity) : null,
          prepareStart: args => stage("start", () => this.input.ports.prepareStart(args)),
          execute: args => stage("execution", () => this.input.ports.execute(args)),
          observe: args => stage("evidence", () => this.input.ports.observe(args)),
          promote: async args => {
            await stage("verification", async () => args.receipt); verificationWritten = true;
            return "unsupported_storage_authority";
          }
        }
      });
      const result = await controller.verifyAndPromote();
      if (uncertain || result.status !== "draft") throw new Error("candidate.verification_outcome_unknown");
      if (result.receipt && !verificationWritten) await stage("verification", async () => result.receipt);
      await store.finish(this.request.attemptId, result);
      return result;
    } catch {
      // Includes lost claim/stage/finish acknowledgements: only the durable
      // committed record can reconcile success. Never repeat side effects.
      if (claimed) await store.markUnknown(this.request.attemptId).catch(/* best-effort: pending claim still blocks side effect replay if uncertainty cannot be written */ () => undefined);
      try {
        const stored = await store.get(this.request.attemptId);
        if (stored?.status === "committed" && stored.outcome && canonical(stored.request) === canonical(this.request)) return stored.outcome;
      } catch { /* best-effort: unreadable durable state keeps the outward outcome unknown and never releases execution */ }
      return draft("candidate.verification_outcome_unknown");
    }
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
