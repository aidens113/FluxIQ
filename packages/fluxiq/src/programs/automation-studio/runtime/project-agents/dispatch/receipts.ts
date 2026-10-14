import type { AutomationStudioSubflowTrialPort, AutomationStudioSubflowTrialResult } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioProjectDigest, type AutomationStudioProjectReceiptRef } from "../contracts/index.ts";

// The partial trials one brief ran, as receipt references for its return
// (`contracts/receipt-ref.ts`). The receipt itself stays with the subflow
// trial port's records; the reference names its run and binds what it
// answered -- whose brief, which revision, which verdict -- by digest, so two
// trials never share a reference.

/** The most trials a return carries (`contracts/builder-return.ts`); the latest are kept. */
const MAX_TRIALS = 100;
const VERSION = "project.subflow_trial_receipt.v1";

export class AutomationStudioProjectDispatchReceipts {
  private readonly refs: AutomationStudioProjectReceiptRef[] = [];

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
  list(): AutomationStudioProjectReceiptRef[] {
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
    this.refs.push({ kind: "subflow_trial", receiptId, digest });
  }
}
