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
//
// **The rows listed are the answer set's (t752).** A trial's feedback sums
// every record set it stored (`stored.rows`), a working read's included, so a
// trial with a few wrong answer rows beside a large working set listed more
// rows than a later one whose answer was exactly right. The rows listed are
// the answer set's (`stored.answerRows`, `../../service/candidate-trial/`
// `feedback.ts`); only feedback that names no answer set lists the sum.
//
// **The verdict listed is the gate's (t634).** The port answers before the
// brief's gate weighs the trial, and the gate may weigh it otherwise: a no the
// build's own record contradicts is unsure (t633). The gate tells the port
// what it kept (`weighed`, `./trial-port.ts`), and the reference listed for
// that trial is then made again from the gate's answer -- the same receipt id,
// its verdict and digest the gate's -- so the supervisor reads and a repair
// names what the gate said.

/** The most trials a return carries (`contracts/builder-return.ts`); the latest are kept. */
const MAX_TRIALS = 100;
const VERSION = "project.subflow_trial_receipt.v1";

export class AutomationStudioProjectDispatchReceipts {
  private readonly refs: AutomationStudioProjectTrialRef[] = [];
  /** The trial the port last answered, until its gate's answer is told (header, t634). */
  private pending: { at: number; result: AutomationStudioSubflowTrialResult } | undefined;

  constructor(private readonly briefId: string) {}

  /** `port`, telling this record of every trial it answers. */
  wrap(port: AutomationStudioSubflowTrialPort): AutomationStudioSubflowTrialPort {
    return async (request) => {
      this.pending = undefined;
      const result = await port(request);
      this.add(result);
      this.pending = { at: this.refs.length - 1, result };
      return result;
    };
  }

  /**
   * The gate's answer for the trial the port last answered (header, t634):
   * where it is about the same brief, revision and digest and the gate's
   * verdict or entry differs, that trial's reference is made again from it
   * and returned; otherwise nothing changes and nothing is returned.
   */
  weighed(answer: AutomationStudioSubflowTrialResult): AutomationStudioProjectTrialRef | undefined {
    const pending = this.pending;
    this.pending = undefined;
    if (!pending) return undefined;
    const { at, result } = pending;
    const same = answer.identity.briefId === result.identity?.briefId && answer.revision === result.revision && answer.digest === result.digest;
    if (!same || (answer.verdict === result.verdict && answer.entryPrepared === result.entryPrepared)) return undefined;
    this.refs[at] = refOf(this.refs[at]!.receiptId, answer);
    return { ...this.refs[at]! };
  }

  /** The references so far, the latest `MAX_TRIALS`. */
  list(): AutomationStudioProjectTrialRef[] {
    return this.refs.slice(-MAX_TRIALS).map((ref) => ({ ...ref }));
  }

  private add(result: AutomationStudioSubflowTrialResult): void {
    this.refs.push(refOf(result.trialRunId ?? `${this.briefId}.trial-${this.refs.length + 1}`, result));
  }
}

/** The reference of trial `receiptId`, which answered `result`: its digest made from the same fields as always, its verdict and rows beside it. */
function refOf(receiptId: string, result: AutomationStudioSubflowTrialResult): AutomationStudioProjectTrialRef {
  const digest = automationStudioProjectDigest(VERSION, {
    receiptId,
    identity: result.identity,
    revision: result.revision,
    digest: result.digest,
    verdict: result.verdict,
    entryPrepared: result.entryPrepared
  });
  const rows = storedRows(result);
  return { kind: "subflow_trial", receiptId, digest, verdict: result.verdict, ...(rows !== undefined ? { rows } : {}) };
}

/**
 * The rows of the trial's answer set, as its feedback says them (`feedback.stored.answerRows`), or every set's sum
 * (`feedback.stored.rows`) where it names no answer set (header, t752); undefined where it says neither.
 */
function storedRows(result: AutomationStudioSubflowTrialResult): number | undefined {
  const stored = result.feedback.stored;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return undefined;
  return count(stored.answerRows) ?? count(stored.rows);
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}
