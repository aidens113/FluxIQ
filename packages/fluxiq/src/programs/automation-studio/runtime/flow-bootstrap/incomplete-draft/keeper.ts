// One build's side of the incomplete draft: whether it continues one, what it
// keeps when it stops short, and what it clears when it finishes.
//
// The build has two ways of ending without an accepted completion, and each
// reaches the caller differently, which is why this is a small object and not
// one function:
//
//   - **It ran out** (`llm_evidence_loop.iteration_limit`). The loop returns a
//     failed result carrying its whole draft and the exhaustion record, and the
//     caller builds the failure from it (`exhausted`).
//   - **Its decisions kept coming back unusable** -- most often completions the
//     checks kept refusing. The loop builds that failure through the caller's
//     `stalled` hook and throws it, with no draft attached. The draft this keeps
//     then is the one the last attempt to finish was checked against, which is
//     the most complete draft the build ever offered as a Flow (`attempted`,
//     `stalled`, `settle`).
//
// Either way the ending's own code is left exactly as it was. The pointer added
// beside it says only that the work was kept, never that the build succeeded.
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../llm/evidence-loop/index.ts";
import { AutomationStudioFlowBootstrapGenerationError, type AutomationStudioFlowBootstrapFailureDiagnostic } from "../generation-failure/index.ts";
import { automationStudioFlowBootstrapIncompleteDraftContinuation, type AutomationStudioFlowBootstrapIncompleteDraftContinuation } from "./continuation.ts";
import { automationStudioFlowBootstrapIncompleteDraftKept } from "./kept.ts";
import type { AutomationStudioFlowBootstrapIncompleteDraft } from "./record.ts";

/** What a failure says about the draft it kept (`generation-failure/diagnostic.ts`). */
export type AutomationStudioFlowBootstrapIncompleteDraftPointer = NonNullable<NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["evidenceLoop"]>["incompleteDraft"]>;

export type AutomationStudioFlowBootstrapIncompleteDraftKeeper = {
  /** The loop's `draft` for a continuation, or nothing for a build that starts afresh. */
  draft: AutomationStudioFlowBootstrapIncompleteDraftContinuation | undefined;
  /** Called with the draft each attempt to finish was checked against. */
  attempted(steps: readonly AutomationStudioFlowDraftStep[]): void;
  /**
   * The build ran out: keep its draft, and return the failure to throw --
   * `failure` is called with the pointer to what was kept, or with nothing when
   * there was nothing worth keeping or the write did not happen, so the failure
   * never points at a record that does not exist.
   */
  exhausted<E>(result: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }>, failure: (kept: AutomationStudioFlowBootstrapIncompleteDraftPointer | undefined) => E): Promise<E>;
  /**
   * A build that ended after its Flow was tested, judged and repaired
   * (`../unfinished-build/`): keep the draft its last round left, and return
   * the pointer to it, or nothing when nothing was worth keeping or the write
   * did not happen.
   */
  unfinished(stopped: AutomationStudioFlowBootstrapIncompleteDraft["stopped"], outstanding: readonly string[], steps: readonly AutomationStudioFlowDraftStep[], completionAttempts: number): Promise<AutomationStudioFlowBootstrapIncompleteDraftPointer | undefined>;
  /** The loop's stall failure, with the pointer to the draft it is about to keep. */
  stalled(error: AutomationStudioFlowBootstrapGenerationError): AutomationStudioFlowBootstrapGenerationError;
  /** Awaits the loop, writing a stalled build's draft before its failure travels on. */
  settle<T>(loop: Promise<T>): Promise<T>;
  /** The build proposed a Flow: an incomplete draft of this Flow is no longer anything to continue. */
  finished(): Promise<void>;
};

/**
 * The keeper for one build.
 *
 * `enabled` is false for a build that does not start from nothing -- an
 * extend, whose draft is the Flow as it stands -- and such a build neither
 * continues nor keeps an incomplete draft. `stored` is whatever record the
 * store holds for this Flow; whether it is continued is
 * `./continuation.ts`'s decision, and only a continued one decides the next
 * revision.
 */
export function automationStudioFlowBootstrapIncompleteDraftKeeper(input: {
  enabled: boolean;
  stored: AutomationStudioFlowBootstrapIncompleteDraft | undefined;
  projectId: string;
  flowId: string;
  baseDependencyDigest: string;
  sourceInstructionIds: readonly string[];
  save(record: AutomationStudioFlowBootstrapIncompleteDraft): Promise<unknown>;
  discard(): Promise<unknown>;
  now?: () => number;
}): AutomationStudioFlowBootstrapIncompleteDraftKeeper {
  const now = input.now ?? Date.now;
  const draft = input.enabled ? automationStudioFlowBootstrapIncompleteDraftContinuation(input.stored, input) : undefined;
  const previous = draft ? input.stored : undefined;
  let lastAttempt: AutomationStudioFlowDraftStep[] | undefined;
  let attempts = 0;
  // A stalled build's record, built when the failure is and written by `settle`,
  // with the failure as it was before the pointer: what travels if the write fails.
  let pending: { record: AutomationStudioFlowBootstrapIncompleteDraft; pointed: AutomationStudioFlowBootstrapGenerationError; unpointed: AutomationStudioFlowBootstrapGenerationError } | undefined;
  const kept = (stopped: AutomationStudioFlowBootstrapIncompleteDraft["stopped"], outstanding: readonly string[], steps: readonly AutomationStudioFlowDraftStep[], completionAttempts: number) => input.enabled
    ? automationStudioFlowBootstrapIncompleteDraftKept({ projectId: input.projectId, flowId: input.flowId, baseDependencyDigest: input.baseDependencyDigest, sourceInstructionIds: input.sourceInstructionIds, stopped, outstandingIssueCodes: outstanding, completionAttempts, steps, ...(previous ? { previous } : {}), now: now() })
    : undefined;
  return {
    draft,
    attempted(steps) {
      attempts += 1;
      lastAttempt = steps.map((step) => structuredClone(step));
    },
    async exhausted(result, failure) {
      const record = result.exhaustion ? kept(result.exhaustion.bound, result.exhaustion.outstandingIssueCodes, result.steps, result.exhaustion.completionAttempts) : undefined;
      if (!record) return failure(undefined);
      try {
        await input.save(record);
      } catch {
        /* best-effort: the build's own ending is still what is reported, only without a pointer to a record that was not written */
        return failure(undefined);
      }
      return failure({ revision: record.revision, steps: record.steps.length });
    },
    async unfinished(stopped, outstanding, steps, completionAttempts) {
      const record = kept(stopped, outstanding, steps, completionAttempts);
      // Best-effort, as `exhausted` is: a write that failed leaves the ending as it is, only without a pointer to a record that does not exist.
      const written = record ? await input.save(record).then(() => true, () => false) : false;
      return record && written ? { revision: record.revision, steps: record.steps.length } : undefined;
    },
    stalled(error) {
      const record = lastAttempt ? kept("unusable_decisions", error.diagnostic.issueCodes ?? [], lastAttempt, attempts) : undefined;
      if (!record || !error.diagnostic.evidenceLoop) return error;
      const pointed = new AutomationStudioFlowBootstrapGenerationError({
        ...error.diagnostic,
        evidenceLoop: { ...error.diagnostic.evidenceLoop, incompleteDraft: { revision: record.revision, steps: record.steps.length } }
      });
      pending = { record, pointed, unpointed: error };
      return pointed;
    },
    async settle(loop) {
      try {
        return await loop;
      } catch (error) {
        const written = pending;
        pending = undefined;
        // Only the failure that carries the pointer is what the record is written for.
        if (!written || error !== written.pointed) throw error;
        try {
          await input.save(written.record);
        } catch {
          /* best-effort: the stall is still the ending, reported without a pointer to a record that was not written */
          throw written.unpointed;
        }
        throw error;
      }
    },
    async finished() {
      if (input.enabled && input.stored) await input.discard();
    }
  };
}
