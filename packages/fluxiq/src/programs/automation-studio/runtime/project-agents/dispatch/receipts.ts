import type { AutomationStudioSubflowTrialPort, AutomationStudioSubflowTrialResult } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioProjectDigest, type AutomationStudioProjectTrialRef } from "../contracts/index.ts";

// The partial trials one brief ran, as receipt references for its return
// (`contracts/receipt-ref.ts`). The receipt itself stays with the subflow
// trial port's records; the reference names its run and binds what it
// answered -- whose brief, which revision, which verdict -- by digest, so two
// trials never share a reference.
//
// Each reference also carries, beside it, the trial's verdict and the rows it
// stored (t606), so the supervisor can send a repair the trial closest to
// passing rather than the latest (`../contracts/builder-return.ts`, `closestTrial`). They are
// not part of the reference's identity: the digest is made from exactly the
// fields it always was, so a reference a brief copies, `kind`, `receiptId`
// and `digest`, matches the one listed here as before.

/** The most trials a return carries (`contracts/builder-return.ts`); the latest are kept. */
const MAX_TRIALS = 100;
const VERSION = "project.subflow_trial_receipt.v1";

export class AutomationStudioProjectDispatchReceipts {
  private readonly refs: AutomationStudioProjectTrialRef[] = [];

  constructor(private readonly briefId: string) {}

  /** `port`, telling this record of every trial it answers. */
  wrap(port: AutomationStudioSubflowTrialPort): AutomationStudioSubflowTrialPort {
    return async (request) => {
      const result = await port(request);
      this.add(result);
      return result;
    };
  }

  /** The references so far, the latest `MAX_TRIALS`. */
  list(): AutomationStudioProjectTrialRef[] {
    return this.refs.slice(-MAX_TRIALS).map((ref) => ({ ...ref }));
  }

  private add(result: AutomationStudioSubflowTrialResult): void {
    const receiptId = result.trialRunId ?? `${this.briefId}.trial-${this.refs.length + 1}`;
    const digest = automationStudioProjectDigest(VERSION, {
      receiptId,
      identity: result.identity,
      revision: result.revision,
      digest: result.digest,
      verdict: result.verdict,
      entryPrepared: result.entryPrepared
    });
    const rows = storedRows(result);
    this.refs.push({ kind: "subflow_trial", receiptId, digest, verdict: result.verdict, ...(rows !== undefined ? { rows } : {}) });
  }
}

/** The rows a trial stored, as its feedback says them (`feedback.stored.rows`); undefined where it does not. */
function storedRows(result: AutomationStudioSubflowTrialResult): number | undefined {
  const stored = result.feedback.stored;
  const rows = stored && typeof stored === "object" && !Array.isArray(stored) ? stored.rows : undefined;
  return typeof rows === "number" && Number.isInteger(rows) && rows >= 0 ? rows : undefined;
}
