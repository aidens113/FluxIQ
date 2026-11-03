import type { ExecutionObservationContext } from "../../execution-admission/index.ts";
import type { ExecutionCallbackCompletion, ExecutionCallbackObservation, ExecutionCallbackSettlement, ManagedExecutionCallbackRegistration, PreparedExecutionCallback } from "../contracts/index.ts";
import { ExecutionObservationBindings } from "../bindings.ts";
import { ExecutionObservationSource } from "../source.ts";

type Managed = Extract<ManagedExecutionCallbackRegistration<unknown, unknown[], unknown>, { contract: "managed_direct_effects" }>;
type Issued = { source: ExecutionObservationSource; parent: ExecutionObservationContext; completion: ExecutionCallbackCompletion; rejected?: { readonly error: unknown } };

// These are the canonical private-state readers, pinned before any producer awaits.
const contextOf = ExecutionObservationSource.prototype.context;
const frameCompletion = ExecutionObservationSource.prototype.frameCompletion;
const completionOf = ExecutionObservationSource.prototype.completion;

/** Retains explicit owning-commit receipts; it never infers completion from a Promise. */
export class OriginalExecutionPromiseReceipts {
  private readonly issued = new WeakMap<Promise<unknown>, Issued>();
  private readonly used = new WeakSet<Promise<unknown>>();

  issueObserved(original: Promise<unknown>, observation: ExecutionCallbackObservation, completion: ExecutionCallbackCompletion): void {
    const observed = ExecutionObservationBindings.read(observation);
    this.issue(original, observed.source, observed.parent, completion);
  }

  /** Only an actual completed owner may attest its original rejected operation. */
  issueRejectedObserved(original: Promise<unknown>, error: unknown, observation: ExecutionCallbackObservation, completion: ExecutionCallbackCompletion): void {
    const observed = ExecutionObservationBindings.read(observation);
    this.issueOutcome(original, observed.source, observed.parent, completion, { error });
  }

  issue(original: Promise<unknown>, source: ExecutionObservationSource, parent: ExecutionObservationContext, completion: ExecutionCallbackCompletion): void {
    this.issueOutcome(original, source, parent, completion);
  }

  private issueOutcome(original: Promise<unknown>, source: ExecutionObservationSource, parent: ExecutionObservationContext, completion: ExecutionCallbackCompletion, rejected?: { readonly error: unknown }): void {
    if (this.used.has(original)) throw new Error("execution.queue_receipt.reissued");
    this.used.add(original);
    this.issued.set(original, {
      source,
      parent: Object.freeze({ reservation: parent.reservation, parent: parent.parent }),
      completion: Object.freeze({ disposition: completion.disposition, completionDigest: completion.completionDigest, assessmentDigest: completion.assessmentDigest }),
      ...(rejected ? { rejected: Object.freeze(rejected) } : {})
    });
  }

  consume(input: Parameters<Managed["consumeCompletion"]>[0]): ExecutionCallbackSettlement {
    const returned = input.returned;
    const receipt = returned !== null && (typeof returned === "object" || typeof returned === "function")
      ? this.issued.get(returned as Promise<unknown>) : undefined;
    if (returned !== null && (typeof returned === "object" || typeof returned === "function")) this.issued.delete(returned as Promise<unknown>);
    if (input.outcome.kind === "rejected" && (!receipt?.rejected || receipt.rejected.error !== input.outcome.error)) return { disposition: "pending", reason: "callback_threw" };
    if (input.outcome.kind === "fulfilled" && receipt?.rejected) return { disposition: "unknown", code: "execution.queued_writer.outcome_mismatch" };
    if (receipt) {
      let actual: ExecutionObservationContext;
      try { actual = contextOf.call(receipt.source, input.invocation as PreparedExecutionCallback); }
      catch (error) {
        // A copied or foreign private handle is an explicit authority denial.
        if (error instanceof Error && error.message === "execution_observation.foreign_invocation") return { disposition: "unknown", code: "execution.queued_writer.foreign_invocation" };
        throw error;
      }
      if (receipt.source.owner === receipt.source && actual.reservation === receipt.parent.reservation && actual.parent === receipt.parent.parent
        && completionOf.call(receipt.source, input.invocation as PreparedExecutionCallback) === "pending"
        && frameCompletion.call(receipt.source, input.invocation)?.disposition === "settled") return receipt.completion;
    }
    return { disposition: "unknown", code: "execution.queued_writer.completion_unknown" };
  }
}
