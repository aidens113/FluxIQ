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
  of(attemptId: string, opening: { carriedOn: boolean; askedAgain: boolean; judgeEvidence?: AutomationStudioJudgeEvidenceCheckpoint | null }): AutomationStudioResultTrailStep[];
  capability(trail: readonly AutomationStudioResultTrailStep[], binding: { judgeEvidenceVersion?: 1 | undefined } | undefined): { judgeEvidenceVersion?: 1 | undefined };
  checkpoint(trail: readonly AutomationStudioResultTrailStep[], witnesses: { before?: JsonObject; after?: JsonObject }, options: AutomationStudioResultTrailSemanticOptions): AutomationStudioJudgeEvidenceCheckpoint | undefined;
  witnesses(trail: readonly AutomationStudioResultTrailStep[], current: { before?: JsonObject; after?: JsonObject }): { before?: JsonObject; after?: JsonObject };
};

const HELD = new WeakMap<object, AutomationStudioAnswerFirstTrails>();

/** The service's trails, made on first ask. */
export function automationStudioAnswerFirstTrailsOf(owner: object): AutomationStudioAnswerFirstTrails {
  const known = HELD.get(owner);
  if (known) return known;
  const trails = new Map<string, AutomationStudioResultTrailStep[]>();
  const checkpoints = new WeakMap<readonly AutomationStudioResultTrailStep[], AutomationStudioJudgeEvidenceCheckpoint | null>();
  const made: AutomationStudioAnswerFirstTrails = {
    of(attemptId, opening) {
      const earlier = opening.carriedOn && !opening.askedAgain ? trails.get(attemptId) : undefined;
      const carried = opening.carriedOn && !opening.askedAgain;
      const stored = carried && Object.hasOwn(opening, "judgeEvidence");
      const invalid: AutomationStudioResultTrailStep = { did: "core.judge_checkpoint_unreadable", outcome: "not_held", judgeEvidence: { version: 1, missing: ["judge_evidence.checkpoint_invalid"], withheld: true } };
      const trail = earlier ?? (stored ? opening.judgeEvidence === null || opening.judgeEvidence === undefined ? [invalid] : structuredClone(opening.judgeEvidence.trail) : carried ? [NOT_HELD] : []);
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
      const before = checkpoints.get(trail)?.witnesses?.before;
      return { ...current, ...(before === undefined ? {} : { before: { judgeEvidence: before } }) };
    }
  };
  HELD.set(owner, made);
  return made;
}
