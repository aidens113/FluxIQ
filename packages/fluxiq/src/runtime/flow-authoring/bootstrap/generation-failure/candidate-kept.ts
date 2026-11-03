// What a candidate-mode build that failed had made, beside its failure (t362).
//
// **Why.** Lane A round 4 (`run-muyrpbnk-fef374e7`) wrote a whole Flow as a
// script, had it test-run twice from a reset page, and then stopped for no
// progress. The failure carried only the loop's code, so the chat told the
// person the Flow "has no steps yet" as if nothing had been written, and the
// Lab recorded `candidate: null` for the build: which candidate it was, how
// often it was test-run and what each test run was judged were lost with it.
//
// So a candidate build's failure says, in ids, counts and closed words only:
// the candidate's id, the latest revision Core accepted and its digest, whether
// that revision was kept as an unverified draft, and each trial's verdict. No
// plan, no feedback, nothing the model wrote. The draft it names is never
// promotable from here: only a standing yes for its exact revision and digest
// is ever proposed (`../../service/candidate-trial/promotion.ts`).

/** The trial verdicts, as `../candidate/contracts.ts` names them; written out here so the diagnostic imports nothing of the authoring loop. */
const VERDICTS = ["yes", "no", "unsure", "not_judged", "execution_failed"] as const;
/** The most trials a failure names; later ones are counted only by `trialCount`. */
const MAX_TRIALS = 16;
const MAX_COUNT = 10_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u;
const CODE = /^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/u;

/** One trial of the candidate: the revision it ran, its own run, and the verdict it was given. */
export type AutomationStudioFlowBootstrapCandidateKeptTrial = {
  revision: number;
  verdict: (typeof VERDICTS)[number];
  /** The trial's runtime session; absent when its start failed before one opened. */
  trialRunId?: string;
  /** Why it was not judged yes, as a code; absent on a yes. */
  code?: string;
};

/**
 * The candidate behind a failed candidate-mode build.
 *
 * - `draft`: `saved` when the latest revision Core accepted was kept as an
 *   unverified draft; `none` when no submission was ever accepted, or the
 *   accepted one could not be kept (the Flow or its settings changed, or the
 *   build was stopped).
 * - `revision`, `digest`: that latest accepted revision; absent with no
 *   accepted submission.
 * - `trials`: the first sixteen trials in the order they ran; `trialCount`
 *   counts them all.
 */
export type AutomationStudioFlowBootstrapCandidateKept = {
  candidateId: string;
  draft: "saved" | "none";
  revision?: number;
  digest?: string;
  trialCount: number;
  trials: AutomationStudioFlowBootstrapCandidateKeptTrial[];
};

/** The record read back: `undefined` for none, `null` for one Core did not write. */
export function parseAutomationStudioFlowBootstrapCandidateKept(value: unknown): AutomationStudioFlowBootstrapCandidateKept | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !exact(value, ["candidateId", "draft", "revision", "digest", "trialCount", "trials"])) return null;
  if (typeof value.candidateId !== "string" || !ID.test(value.candidateId)) return null;
  if (value.draft !== "saved" && value.draft !== "none") return null;
  if ((value.revision === undefined) !== (value.digest === undefined)) return null;
  if (value.revision !== undefined && (!count(value.revision) || typeof value.digest !== "string" || !ID.test(value.digest))) return null;
  if (value.draft === "saved" && value.revision === undefined) return null;
  if (!count(value.trialCount) || !Array.isArray(value.trials) || value.trials.length > MAX_TRIALS || value.trials.length > (value.trialCount as number)) return null;
  const trials: AutomationStudioFlowBootstrapCandidateKeptTrial[] = [];
  for (const trial of value.trials) {
    if (!isRecord(trial) || !exact(trial, ["revision", "verdict", "trialRunId", "code"]) || !count(trial.revision)) return null;
    if (typeof trial.verdict !== "string" || !(VERDICTS as readonly string[]).includes(trial.verdict)) return null;
    if (trial.trialRunId !== undefined && (typeof trial.trialRunId !== "string" || !ID.test(trial.trialRunId))) return null;
    if (trial.code !== undefined && (typeof trial.code !== "string" || !CODE.test(trial.code))) return null;
    trials.push({ revision: trial.revision as number, verdict: trial.verdict as AutomationStudioFlowBootstrapCandidateKeptTrial["verdict"],
      ...(trial.trialRunId !== undefined ? { trialRunId: trial.trialRunId as string } : {}), ...(trial.code !== undefined ? { code: trial.code as string } : {}) });
  }
  return {
    candidateId: value.candidateId, draft: value.draft,
    ...(value.revision !== undefined ? { revision: value.revision as number, digest: value.digest as string } : {}),
    trialCount: value.trialCount as number, trials
  };
}

/**
 * The record for a failure, from what the build knows: trials past the
 * sixteenth are counted, not named, and a code or id that would not read back
 * is left out rather than taking the whole diagnostic down with it.
 */
export function automationStudioFlowBootstrapCandidateKept(input: {
  candidateId: string;
  draft: "saved" | "none";
  latest?: { revision: number; digest: string } | undefined;
  trials: ReadonlyArray<{ revision: number; verdict: string; trialRunId?: string | undefined; code?: string | undefined }>;
}): AutomationStudioFlowBootstrapCandidateKept {
  const trials = input.trials.slice(0, MAX_TRIALS).flatMap((trial): AutomationStudioFlowBootstrapCandidateKeptTrial[] => (VERDICTS as readonly string[]).includes(trial.verdict) && count(trial.revision)
    ? [{ revision: trial.revision, verdict: trial.verdict as AutomationStudioFlowBootstrapCandidateKeptTrial["verdict"],
        ...(trial.trialRunId && ID.test(trial.trialRunId) ? { trialRunId: trial.trialRunId } : {}), ...(trial.code && CODE.test(trial.code) ? { code: trial.code } : {}) }]
    : []);
  const latest = input.latest && count(input.latest.revision) && ID.test(input.latest.digest) ? input.latest : undefined;
  return {
    candidateId: input.candidateId, draft: latest ? input.draft : "none",
    ...(latest ? { revision: latest.revision, digest: latest.digest } : {}),
    trialCount: Math.min(Math.max(input.trials.length, trials.length), MAX_COUNT), trials
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function count(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_COUNT;
}
