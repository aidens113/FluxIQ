// What each attempt did, held for the whole attempt across a resume (t963): the judge of a carried-on attempt's
// result still sees every call and every saved Flow step that produced it, not only those after the person's press.
//
// Private raw views remain in memory. An explicitly opted-in binding also keeps a versioned semantic journal beside
// the attempt: screened findings, actual framework outcomes and semantic witnesses, never a raw capture or callback.
// A restart reopens that journal. Legacy absence still honestly says the earlier calls are unavailable; explicitly
// malformed new metadata remains a gap, rather than falling back to a raw legacy view.
//
// Keyed by the attempt. A carry-on keeps its attempt's id and so its trail. A person's Run again is judged on its own
// change (`../completion/check.ts`), so it starts an empty one.

import { automationStudioMakeJudgeCheckpoint, type AutomationStudioJudgeEvidenceCheckpoint, type AutomationStudioResultTrailSemanticOptions, type AutomationStudioResultTrailStep } from "../../../../../runtime/result-verification/index.ts";
import { automationStudioJudgeEvidenceCapability } from "../../../../../runtime/llm/harness-options/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioAnswerFirstJudgeEvidenceIssue } from "../attempt-store/index.ts";
import { automationStudioAnswerFirstJournalOwners } from "./source-owner.ts";
import { AutomationStudioJudgeEvidenceOrigins } from "../../../../../runtime/result-verification/judge-evidence/index.ts";
import type { AutomationStudioResultEvidenceSourceRef } from "../../../../../runtime/result-verification/result-evidence/index.ts";
import type { AutomationStudioJudgeWitnessAssociation } from "../../../../../runtime/result-verification/judge-evidence/index.ts";
import { AutomationStudioJudgeEvidenceRetry } from "../../../../../runtime/result-verification/judge-evidence/index.ts";

type Witnesses = { before?: JsonObject; after?: JsonObject; association?: AutomationStudioJudgeWitnessAssociation };

/** The most attempts whose trail is held per service: the oldest goes first. */
const MOST_HELD = 32;

/** Core's entry for the calls a carried-on attempt made before its resume, where this Core holds none of them. */
const NOT_HELD: AutomationStudioResultTrailStep = {
  did: "core.earlier_calls_not_held",
  outcome: "not_held",
  found: "This attempt carried on from an earlier part whose calls this Core no longer holds, as it restarted since. What those calls produced is in the rows, the acts and the reads' accounts; the entries after this one are the calls made since the attempt carried on."
};

export type AutomationStudioAnswerFirstTrails = {
  /** The trail `attemptId` adds to: the one held for it on a carry-on, a fresh one otherwise. */
  of(attemptId: string, opening: { carriedOn: boolean; askedAgain: boolean; judgeEvidence?: AutomationStudioJudgeEvidenceCheckpoint | null; judgeEvidenceIssue?: AutomationStudioAnswerFirstJudgeEvidenceIssue | null }): AutomationStudioResultTrailStep[];
  capability(trail: readonly AutomationStudioResultTrailStep[], binding: { judgeEvidenceVersion?: 1 | undefined } | undefined): { judgeEvidenceVersion?: 1 | undefined };
  checkpoint(trail: readonly AutomationStudioResultTrailStep[], witnesses: Witnesses, options: AutomationStudioResultTrailSemanticOptions): AutomationStudioJudgeEvidenceCheckpoint | undefined;
  witnesses(trail: readonly AutomationStudioResultTrailStep[], current: Witnesses): Witnesses;
  sourceRecorded(trail: readonly AutomationStudioResultTrailStep[], refs: readonly AutomationStudioResultEvidenceSourceRef[], call?: object): void;
  sourceOwner(trail: readonly AutomationStudioResultTrailStep[]): object | undefined;
  recovered(trail: AutomationStudioResultTrailStep[], proof: { recoveredReceipt: string; revision: number } | undefined): void;
};

const HELD = new WeakMap<object, AutomationStudioAnswerFirstTrails>();

/** The service's trails, made on first ask. */
export function automationStudioAnswerFirstTrailsOf(owner: object): AutomationStudioAnswerFirstTrails {
  const known = HELD.get(owner);
  if (known) return known;
  const trails = new Map<string, AutomationStudioResultTrailStep[]>();
  const checkpoints = new WeakMap<readonly AutomationStudioResultTrailStep[], AutomationStudioJudgeEvidenceCheckpoint | null>();
  const sourceOwners = new WeakMap<readonly AutomationStudioResultTrailStep[], object>();
  const made: AutomationStudioAnswerFirstTrails = {
    of(attemptId, opening) {
      const earlier = opening.carriedOn && !opening.askedAgain ? trails.get(attemptId) : undefined;
      const carried = opening.carriedOn && !opening.askedAgain;
      const stored = carried && Object.hasOwn(opening, "judgeEvidence");
      const invalid: AutomationStudioResultTrailStep = { did: "core.judge_checkpoint_unreadable", outcome: "not_held", judgeEvidence: { version: 1, missing: ["judge_evidence.checkpoint_invalid"], withheld: true } };
      const trail = earlier ?? (stored ? opening.judgeEvidence === null || opening.judgeEvidence === undefined ? [invalid] : structuredClone(opening.judgeEvidence.trail) : carried ? [NOT_HELD] : []);
      const issuePresent = carried && Object.hasOwn(opening, "judgeEvidenceIssue");
      if (!earlier && !carried) sourceOwners.set(trail, automationStudioAnswerFirstJournalOwners.create());
      if (issuePresent) {
        const issue = opening.judgeEvidenceIssue;
        const receipt = issue?.receipt;
        const recovered = issue?.recoveredAtRevision;
        const did = recovered === undefined ? "core.judge_journal_coverage" : "core.judge_journal_recovered";
        const known = trail.some((step) => step.did === did && (step.judgeEvidence?.evidence as JsonObject | undefined)?.receipt === receipt);
        if (!known) trail.push(recovered !== undefined && receipt !== undefined ? recoveredStep(receipt, recovered) : { did, judgeEvidence: { version: 1, role: "observation", evidence: { coverage: "historical_incomplete", ...(receipt === undefined ? {} : { receipt }), code: issue?.code ?? "checkpoint_issue_invalid", ...(issue === null || issue === undefined ? {} : { revision: issue.revision }), note: "Core could not safely keep all historical semantic evidence at this boundary. Prior facts remain actual; an omitted call or witness has no invented outcome. Judge any independently complete current proof, and require the relevant missing state/data rather than treating this historical warning as success." }, missing: [], withheld: false } });
      }
      const current = checkpoints.get(trail);
      if (stored && (current == null || (opening.judgeEvidence != null && opening.judgeEvidence.revision > current.revision))) checkpoints.set(trail, opening.judgeEvidence ?? null);
      if (earlier && stored && opening.judgeEvidence == null) trail.push(invalid);
      trails.delete(attemptId);
      trails.set(attemptId, trail);
      for (const oldest of trails.keys()) {
        if (trails.size <= MOST_HELD) break;
        trails.delete(oldest);
      }
      return trail;
    },
    capability(trail, binding) {
      const explicit = automationStudioJudgeEvidenceCapability(binding);
      return Object.hasOwn(explicit, "judgeEvidenceVersion") ? explicit : checkpoints.has(trail) || trail.some((step) => Object.hasOwn(step, "judgeEvidence")) ? { judgeEvidenceVersion: 1 } : {};
    },
    checkpoint(trail, witnesses, options) {
      const capability = made.capability(trail, options);
      if (!Object.hasOwn(capability, "judgeEvidenceVersion")) return undefined;
      const prior = checkpoints.get(trail);
      const checkpoint = automationStudioMakeJudgeCheckpoint(trail, witnesses, { ...options, ...capability }, prior ?? undefined);
      checkpoints.set(trail, checkpoint);
      return checkpoint;
    },
    witnesses(trail, current) {
      const saved = checkpoints.get(trail)?.witnesses;
      const before = saved?.before;
      const prior = saved?.association;
      const association = current.association === undefined ? prior === undefined ? undefined : { version: 1 as const, before: structuredClone(prior.before), after: [] } : { ...current.association, before: [...(prior?.before ?? []), ...current.association.before].filter((ref, at, all) => all.findIndex((other) => other.callId === ref.callId && other.actId === ref.actId) === at) };
      const wrapper = before === undefined ? undefined : { judgeEvidence: before };
      if (before !== undefined && wrapper !== undefined) AutomationStudioJudgeEvidenceRetry.carry(before, wrapper);
      return { ...current, ...(wrapper === undefined ? {} : { before: wrapper }), ...(association === undefined ? {} : { association }) };
    },
    sourceRecorded: (trail, refs, call) => AutomationStudioJudgeEvidenceOrigins.recorded(trail, refs, call),
    sourceOwner: (trail) => sourceOwners.get(trail),
    recovered(trail, proof) {
      if (proof === undefined || sourceOwners.get(trail) === undefined) return;
      if (trail.some((step) => step.did === "core.judge_journal_recovered" && (step.judgeEvidence?.evidence as JsonObject | undefined)?.receipt === proof.recoveredReceipt)) return;
      trail.push(recoveredStep(proof.recoveredReceipt, proof.revision));
    }
  };
  HELD.set(owner, made);
  return made;
}

function recoveredStep(receipt: string, revision: number): AutomationStudioResultTrailStep {
  return { did: "core.judge_journal_recovered", judgeEvidence: { version: 1, role: "observation", evidence: { coverage: "recovered", receipt, recoveredAtRevision: revision, note: "Core successfully saved the complete semantic snapshot from the same uninterrupted source owner and resolved this exact historical storage warning. Earlier history remains recorded. This storage proof does not establish any domain effect or task success; current state and data still require verification." }, missing: [], withheld: false } };
}
