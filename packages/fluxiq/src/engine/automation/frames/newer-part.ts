// A step that pins a saved part failed there, and the library has a newer version with the
// same interface. The newer version runs first, at no model call, as a fix held in place:
// the call step is overlaid with the newer pin and attempted again where the run stood, so
// it goes through the one execution path, with the same gates and the same ledger. Its pin
// moves only as any held fix is kept, after the run's judged yes.
//
// **Never after something lasting may have landed.** Running a version runs it from its
// start, which would do that act a second time. So a version is offered only while the
// failed attempt's steps did nothing lasting, read by the library (`newerParts.mayHaveLanded`).
// A run's uncertain state, a permission gate and an item found gone stop it earlier: all
// three stop a repair (`../step-loop/incident-repair.ts`), and this is asked for as one.
//
// **No model inside it first.** A step inside the failing version would otherwise ask for a
// fix before its caller could try the newer version, so while a version is waiting to be
// tried, or is being tried, a step inside it asks for nothing and its frame ends failed.
// Once something lasting has landed there, it asks as usual: a fix at that step goes on from
// where it stands and repeats nothing.

import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../index.ts";
import type { AutomationStudioInvocationOptions, AutomationStudioNewerPartVersions } from "./invocation-options.ts";
import { AUTOMATION_STUDIO_TARGET_GONE_CODE } from "../target-reacquire/gone-code.ts";
import { automationStudioPinOfSubflowId, type AutomationStudioPartPin } from "./part-pin.ts";

const TRIAL_REPAIR_PREFIX = "part-newer.";

/** Where a tried version's adaptation names the version it tried. */
export const AUTOMATION_STUDIO_PART_NEWER_TRIAL_KEY = "partNewerTrial";

/** The id a tried version's held fix goes by, which tells it from a model's fix. */
export function automationStudioNewerPartRepairId(runId: string, incidentId: string, pin: AutomationStudioPartPin): string {
  return `${TRIAL_REPAIR_PREFIX}${runId}.${incidentId}.v${pin.version}`;
}

/** Whether a held fix is a newer version being tried, whose failure leaves the normal repair to run. */
export function automationStudioIsNewerPartRepair(repairId: string | undefined): boolean {
  return repairId?.startsWith(TRIAL_REPAIR_PREFIX) === true;
}

/** What may be tried in place of the version a failed call attempt ran. */
export type AutomationStudioNewerPartOffer = { pin: AutomationStudioPartPin; versions: AutomationStudioNewerPartVersions; candidates: readonly AutomationStudioPartPin[] };

/** What a failed call attempt may try, or nothing: not a pinned call, a run that cannot say, something lasting may have landed, or no version left. */
export async function automationStudioNewerPartOfAttempt(options: AutomationStudioGraphExecutionOptions, attempt: AutomationStudioNodeAttemptTrace): Promise<AutomationStudioNewerPartOffer | undefined> {
  const pinnedId = attempt.subflowTarget?.subflowId;
  const pin = automationStudioPinOfSubflowId(pinnedId);
  if (!pin || !pinnedId || attempt.status !== "failed") return undefined;
  const versions = (await options.subflowGraphs?.load(pinnedId))?.newerParts;
  if (!versions || await versions.mayHaveLanded(attempt.childTrace?.attempts ?? [], options)) return undefined;
  const candidates = await versions.candidates();
  return candidates.length ? { pin, versions, candidates } : undefined;
}

/**
 * Whether a step should ask for no model's fix because a frame it runs in is a saved version
 * its caller will try another for, or one being tried. A failed step that is itself such a
 * caller does not wait: what it is about to ask for is that version.
 */
export async function automationStudioNewerPartWaits(input: {
  options: AutomationStudioGraphExecutionOptions;
  invocation: AutomationStudioInvocationOptions;
  /** This frame's attempts so far, the failed one last. */
  attempts: readonly AutomationStudioNodeAttemptTrace[];
  failedAttempt: AutomationStudioNodeAttemptTrace;
}): Promise<boolean> {
  const { options, invocation } = input;
  const { stack, lifecycle, newerPartTrials } = invocation.run;
  const source = options.subflowGraphs;
  if (!source) return false;
  if (await automationStudioNewerPartOfAttempt(options, input.failedAttempt)) return false;
  for (let at = stack.indexOf(invocation.frame); at >= 0; at -= 1) {
    const frame = stack[at]!;
    const pinnedId = automationStudioPinOfSubflowId(frame.subflowId) ? frame.subflowId : null;
    if (!pinnedId) return false;
    const versions = (await source.load(pinnedId))?.newerParts;
    const attempts = frame === invocation.frame ? input.attempts : lifecycle.frames.get(frame.invocationId)?.attempts ?? [];
    if (!versions || await versions.mayHaveLanded(attempts, options)) return false;
    if (newerPartTrials.has(pinnedId) || (await versions.candidates()).length > 0) return true;
  }
  return false;
}

/**
 * An attempt with the versions it ran no longer named at a revision. A judged end stands for
 * the versions a run names, and a run that got past a failed version on another one, or on a
 * fix, did not prove the version that failed. Another caller's trust in it is untouched.
 */
export function automationStudioWithoutPinnedCredit(attempt: AutomationStudioNodeAttemptTrace): AutomationStudioNodeAttemptTrace {
  const target = attempt.subflowTarget;
  const pinned = target && automationStudioPinOfSubflowId(target.subflowId);
  return {
    ...attempt,
    ...(pinned ? { subflowTarget: { ...target, graphRevision: null } } : {}),
    ...(attempt.childTrace ? { childTrace: { ...attempt.childTrace, attempts: attempt.childTrace.attempts.map(automationStudioWithoutPinnedCredit) } } : {})
  };
}

/**
 * The saved versions a finished run executed as saved: every pinned frame it ran, less any that
 * ran with a fix held in it, here or in a frame it called (a held fix, or a fix dropped after its
 * trial, left the version as saved no longer what ran). A judged end stands for exactly these.
 * A version a fix replaced for the rest of the run is as fixed in each later call to it.
 */
export function automationStudioPinsRanAsSaved(attempts: readonly AutomationStudioNodeAttemptTrace[]): AutomationStudioPartPin[] {
  const ran = new Map<string, AutomationStudioPartPin>();
  const fixed = new Set<string>();
  const visit = (list: readonly AutomationStudioNodeAttemptTrace[], enclosing: readonly string[]): void => {
    for (const attempt of list) {
      const id = attempt.subflowTarget?.subflowId;
      const pin = automationStudioPinOfSubflowId(id);
      const within = pin && id ? [...enclosing, id] : enclosing;
      if (pin && id) ran.set(id, pin);
      if (attempt.repair && attempt.repair.outcome !== "none") {
        for (const held of within) fixed.add(held);
        if (attempt.repair.unit.kind === "part") fixed.add(attempt.repair.unit.subflowId);
      }
      if (attempt.childTrace) visit(attempt.childTrace.attempts, within);
    }
  };
  visit(attempts, []);
  return [...ran].filter(([id]) => !fixed.has(id)).map(([, pin]) => pin);
}

/** What `automationStudioPinnedCallStoppedSafely` reads of a call attempt and of the attempts inside it: a trace attempt has all of it. */
export type AutomationStudioInnerAttemptProbe = { status: string; failure?: { category: string; code?: string | undefined } | undefined; childTrace?: { attempts: readonly AutomationStudioInnerAttemptProbe[] } | undefined };
export type AutomationStudioCallAttemptProbe = { subflowTarget?: { subflowId: string } | undefined; childTrace?: { attempts: readonly AutomationStudioInnerAttemptProbe[] } | undefined };

const PERMISSION_CATEGORIES: ReadonlySet<string> = new Set(["external_side_effect_denied", "blocked_by_capability_or_policy"]);

/**
 * Whether a pinned call stopped where nothing can change it: a step inside the called version met a
 * permission gate, or found its item gone. Read from the call attempt's own child trace, because the
 * call step's failure carries no category of its own. False for a call to a Flow's own Subflow.
 */
export function automationStudioPinnedCallStoppedSafely(attempt: AutomationStudioCallAttemptProbe | undefined): boolean {
  if (!attempt || !automationStudioPinOfSubflowId(attempt.subflowTarget?.subflowId)) return false;
  const stopped = (inner: AutomationStudioInnerAttemptProbe): boolean => {
    const { failure } = inner;
    if (inner.status === "failed" && failure && (PERMISSION_CATEGORIES.has(failure.category) || failure.code === AUTOMATION_STUDIO_TARGET_GONE_CODE)) return true;
    return inner.childTrace?.attempts.some(stopped) ?? false;
  };
  return attempt.childTrace?.attempts.some(stopped) ?? false;
}
