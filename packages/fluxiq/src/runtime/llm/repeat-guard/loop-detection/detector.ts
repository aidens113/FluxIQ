// Whether a loop's calls are getting anywhere, read from facts and never from
// how many calls there were.
//
// **Progress first.** A call made progress when it brought a page state this
// loop has not seen, a row whose digest it has not seen, an act that landed and
// moved the page for the first time from this page, a plan or revision accepted
// for the first time, a draft or a build key it has not stood at. Working through rows or pages does exactly that on every
// pass, so it never reaches the patterns below, however many calls it takes. A
// call whose effect landed where no page is reported cannot be told from real
// work, so it counts as progress: the doubt falls on not firing.
//
// **The patterns, each over the calls that made no progress.**
//
// - A near repeat is one call, free text out (`./meaningful-input.ts`), on one
//   page, that twice came to nothing. The repeat guard's own lifts stay lifts: a
//   call whose exact form the guard stopped refusing -- a handle since shown, a
//   precondition since met -- starts again from nothing here (`holds`).
// - A cycle is the last block of calls equal to the block before it, up to four
//   calls long and across pages, with nothing new in its last pass.
// - No progress is a window of such calls, whatever they were.
// - The same fix is a Flow the draft already stood at, come back by an edit, or a
//   submission already made. It is read off the attempt's record, so it still
//   holds after a fresh context (`./attempt-record.ts`).
//
// **A lasting act is not progress for moving the page.** Adding one more to a cart
// changes the page every time, so by every fact above it looks like work. The same
// stated-lasting act (`lasting`) on the same target, landing again with no new row
// read since, is `same_act`, whatever the page did: never progress, told on the
// first repeat and refused from then on, whatever else has moved. A new row
// identity starts it again, as does the task's own row binding (`rowBound`) or an
// undo of the build's act. This is the rule that a lasting act is never repeated
// meeting the detector. A task that really asks for repeats says so through its
// caller (`askedRepeats`, from the act record): up to that many landings are simply
// work, and words in the model's reply never lift it. Whether it is refused at all
// is the ladder's to say (`./watch.ts`).
//
// The same target is the same fingerprint at the same place. A fingerprint alone
// is not enough: the replay found 18 of 22 firings in passed runs were one "Add to
// cart" on different products' pages (the report has the table). With no place to
// go on, it is the same call as written.
//
// **A target is its fingerprint where there is one.** A handle names a control only
// while its page stands, and one reload renumbers it, so a call that says what it
// really ran with (`ranAs`) is keyed on that. Before a call runs only its handle is
// known, so what a handle ran as is remembered per page; a handle not seen yet runs
// once, and is known from then on.
//
// **What it cannot see it does not judge.** A call on a page the loop cannot name,
// that is keyed on nothing else either, says nothing either way, as with the
// repeat guard, which records nothing with no page seen. A loop whose tools report
// no state is watched only for the same fix and the same act. On the new path only
// (`judgesWithNoPage`), a call that did nothing and says what it stands for (`ranAs`) is
// keyed on that, so it is judged: the act gate above the domain answers with no page, by
// the act it refused, and a fresh round has seen none when it first asks
// (`../../../answer-first/act-record/gate/act-gate.ts`, t870). Another mode's unpaged
// calls are judged as they always were. Those calls are also counted by act alone, across
// pages: a clock on the page makes every read a new state, which is no progress on the act,
// and only a new row or an act that landed starts that count again.
//
// **What it never does.** It reads no words, holds no value, refuses nothing
// itself (`./watch.ts` is the ladder) and lifts nothing the guard refuses.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmLoopAttemptRecord } from "./attempt-record.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_MAX_CYCLE_PERIOD, AUTOMATION_STUDIO_LLM_LOOP_NEAR_REPEAT_AT, AUTOMATION_STUDIO_LLM_LOOP_NO_PROGRESS_WINDOW, AUTOMATION_STUDIO_LLM_LOOP_SAME_ACT_AT, AUTOMATION_STUDIO_LLM_LOOP_SINGLE_CYCLE_AT } from "./limits.ts";
import { automationStudioLlmLoopCallKey, automationStudioLlmLoopDigest, automationStudioLlmLoopRanKey } from "./meaningful-input.ts";
import type { AutomationStudioLlmLoopAmendment, AutomationStudioLlmLoopAskedRepeats, AutomationStudioLlmLoopCall, AutomationStudioLlmLoopFinding, AutomationStudioLlmLoopUnchanged } from "./types.ts";

/** Nothing new of any kind, which is what every finding over calls means. */
const NOTHING_NEW: readonly AutomationStudioLlmLoopUnchanged[] = Object.freeze(["page", "rows", "acts", "draft"] as const);

/** One call as the cycle reads it. */
type Token = { key: string; state: string; toolId: string; progressed: boolean; callId: string; look: boolean };

/** One call on one page that came to nothing, and how often. */
type NearEntry = { runs: number; toolId: string; look: boolean; answer: string | undefined; guarded: JsonObject[]; callId: string | undefined };

/** A caller's count, only as a whole number of at least one. */
function wholeCount(value: number | undefined): number | undefined {
  return value !== undefined && Number.isInteger(value) && value >= 1 ? value : undefined;
}

export type AutomationStudioLlmLoopDetector = {
  /** Asked before a call runs: drops what the guard has lifted since, and answers the finding this call would continue, if it is one of the calls a finding stands on. */
  repeating(toolId: string, input: JsonObject, context: string | undefined, state: string | undefined): AutomationStudioLlmLoopFinding | undefined;
  /** Asked before a call runs: whether it would do again a lasting act already told about, whatever has moved since. `targetWords` asks the domain for its target's name, only when that decides it. */
  actRepeats(toolId: string, input: JsonObject, context: string | undefined, targetWords: () => string | undefined): AutomationStudioLlmLoopFinding | undefined;
  /** A call ran. `guarded` says the repeat guard now holds an outcome for its exact form. Answers the pattern that now stands, or nothing. */
  ran(call: AutomationStudioLlmLoopCall, guarded?: boolean): { finding?: AutomationStudioLlmLoopFinding; progressed: boolean };
  /** A call was refused unrun, or answered from memory (`answered`, which is a look asked again and goes when looks go): one more without progress. */
  unrun(toolId: string, input: JsonObject, context: string | undefined, state: string | undefined, answered?: boolean): void;
  /** Whether this edit, on this draft, already led where it leads: refused before it runs once the ladder is refusing. */
  amendmentRepeats(key: string, draftBefore: string | undefined): AutomationStudioLlmLoopFinding | undefined;
  /** An `amend_draft` decision settled. */
  amended(amendment: AutomationStudioLlmLoopAmendment): { finding?: AutomationStudioLlmLoopFinding; progressed: boolean };
  /** Something moved the page unseen (a dry run): nothing the calls before it did says anything about the calls after it. */
  moved(): void;
};

/**
 * `holds` asks the repeat guard whether it still refuses this exact call on this
 * page (`../outcomes.ts`). `record` is the attempt's, shared by its loops.
 */
export function automationStudioLlmLoopDetector(options: {
  record: AutomationStudioLlmLoopAttemptRecord;
  holds?: ((toolId: string, input: JsonObject, state: string) => boolean) | undefined;
  askedRepeats?: AutomationStudioLlmLoopAskedRepeats | undefined;
  /** A call that did nothing and says what it stands for is judged with no page (header): the caller can act on what that leads to. */
  judgesWithNoPage?: boolean | undefined;
}): AutomationStudioLlmLoopDetector {
  const { record, holds, askedRepeats, judgesWithNoPage } = options;
  const visited = new Set<string>();
  const landed = new Set<string>();
  const rowsSeen = new Set<string>();
  const draftsStoodAt = new Set<string>();
  const contextsSeen = new Map<string, Set<string>>();
  const near = new Map<string, NearEntry>();
  const amendmentsLed = new Map<string, string>();
  // What a call as written ran as, by where it was written; and each lasting act, by what it ran as and by how it was written.
  const ranAsHere = new Map<string, string>();
  /** Calls that did nothing and said which act they stand for, by act, whatever page they came from: a page that moves by itself is no way round one (header). */
  const heldActs = new Map<string, { runs: number; rowsAt: number }>();
  const acts = new Map<string, { times: number; rowsAt: number; toolId: string; callId: string; asked: number | undefined }>();
  const actsWritten = new Map<string, { act: string; targetWords: string | undefined; place: string | undefined }>();
  // Where the work stands, as the last call that said left it.
  let place: string | undefined;
  // What was already in the record when this loop began: a Flow it names came back from an earlier context.
  const fromEarlier = new Set(record.data().tried.map((entry) => entry.key));
  let startingDraft: string | undefined;
  let last: string | undefined;
  let tokens: Token[] = [];
  let window: { count: number; at: Set<string>; toolIds: Set<string>; callId: string | undefined } = { count: 0, at: new Set(), toolIds: new Set(), callId: undefined };
  // The keys of the cycle standing, and the same fix standing: what a further such call continues.
  let cycleKeys: { keys: ReadonlySet<string>; finding: AutomationStudioLlmLoopFinding } | undefined;
  let draftReturns = 0;
  // The submission a trial would judge.
  let lastSubmission: string | undefined;

  const at = (key: string, state: string | undefined): string => `${key}@${state ?? ""}`;
  const progress = (): void => {
    window = { count: 0, at: new Set(), toolIds: new Set(), callId: undefined };
    cycleKeys = undefined;
    // A look asked again once the work has moved on is a fresh look; a call that failed on this page still failed here.
    for (const [where, entry] of near) if (entry.look) near.delete(where);
  };
  const counted = (key: string, state: string | undefined, toolId: string): void => {
    window.count += 1;
    window.at.add(at(key, state));
    window.toolIds.add(toolId);
  };
  const lifted = (key: string, state: string | undefined, toolId: string): boolean => {
    const entry = near.get(at(key, state));
    if (!holds || !entry?.guarded.length) return false;
    if (entry.guarded.every((input) => holds(toolId, input, state ?? ""))) return false;
    near.delete(at(key, state));
    return true;
  };
  const nearFinding = (entry: NearEntry): AutomationStudioLlmLoopFinding => ({ pattern: "near_repeat", repeats: entry.runs, toolIds: [entry.toolId], unchanged: NOTHING_NEW, ...(entry.callId ? { callId: entry.callId } : {}) });
  const windowFinding = (): AutomationStudioLlmLoopFinding => ({ pattern: "no_progress", repeats: window.count, toolIds: [...window.toolIds], unchanged: NOTHING_NEW, ...(window.callId ? { callId: window.callId } : {}) });

  /** The longest-standing block at the tail of the calls, whose last pass brought nothing. */
  const cycle = (): { finding: AutomationStudioLlmLoopFinding; keys: ReadonlySet<string> } | undefined => {
    // One call again and again from page to page: a toggle. On one page that is a near repeat.
    let single = 0;
    for (let index = tokens.length - 1; index >= 0 && tokens[index]!.key === tokens[tokens.length - 1]?.key && !tokens[index]!.progressed; index -= 1) single += 1;
    if (single >= AUTOMATION_STUDIO_LLM_LOOP_SINGLE_CYCLE_AT && new Set(tokens.slice(-single).map((token) => token.state)).size > 1) {
      const last = tokens[tokens.length - 1]!;
      return { finding: { pattern: "cycle", repeats: single, toolIds: [last.toolId], unchanged: NOTHING_NEW, callId: last.callId }, keys: new Set([last.key]) };
    }
    for (let period = 2; period <= AUTOMATION_STUDIO_LLM_LOOP_MAX_CYCLE_PERIOD; period += 1) {
      if (tokens.length < period * 2) break;
      const block = tokens.slice(-period);
      const before = tokens.slice(-period * 2, -period);
      if (new Set(block.map((token) => token.key)).size < 2) continue;
      if (block.some((token) => token.progressed)) continue;
      if (!block.every((token, index) => token.key === before[index]!.key)) continue;
      // What keeps a cycle going is its acts: a look in it costs nothing and may be what the page needs after a reload, so it is only refused when the cycle is all looks.
      const acts = block.filter((token) => !token.look);
      let passes = 2;
      while (tokens.length >= period * (passes + 1) && tokens.slice(-period * (passes + 1), -period * passes).every((token, index) => token.key === block[index]!.key)) passes += 1;
      return { finding: { pattern: "cycle", repeats: passes, toolIds: [...new Set(block.map((token) => token.toolId))], unchanged: NOTHING_NEW, callId: block.at(-1)!.callId }, keys: new Set(acts.length ? acts.map((token) => token.key) : block.map((token) => token.key)) };
    }
    return undefined;
  };

  return {
    actRepeats(toolId, input, context, targetWords) {
      const written = actsWritten.get(automationStudioLlmLoopCallKey(toolId, input, context));
      const act = written ? acts.get(written.act) : undefined;
      if (!written || !act || act.times < Math.max(AUTOMATION_STUDIO_LLM_LOOP_SAME_ACT_AT, act.asked ?? 0) || act.rowsAt !== rowsSeen.size) return undefined;
      // This is another place, or the domain now names something else under this handle: another target.
      if (place !== written.place) return undefined;
      const named = written.targetWords === undefined ? undefined : targetWords();
      if (named !== undefined && named !== written.targetWords) return undefined;
      return { pattern: "same_act", repeats: act.times, toolIds: [act.toolId], unchanged: ["rows"], callId: act.callId };
    },
    repeating(toolId, input, context, state) {
      const page = state ?? last;
      const written = automationStudioLlmLoopCallKey(toolId, input, context);
      const key = ranAsHere.get(at(written, page)) ?? written;
      if (lifted(key, page, toolId)) return undefined;
      const entry = near.get(at(key, page));
      if (entry && entry.runs >= AUTOMATION_STUDIO_LLM_LOOP_NEAR_REPEAT_AT) return nearFinding(entry);
      if (cycleKeys?.keys.has(key)) return cycleKeys.finding;
      if (window.count >= AUTOMATION_STUDIO_LLM_LOOP_NO_PROGRESS_WINDOW && window.at.has(at(key, page))) return windowFinding();
      return undefined;
    },
    ran(call, guarded) {
      const state = call.stateBefore ?? last;
      const written = automationStudioLlmLoopCallKey(call.toolId, call.input, call.context);
      const key = call.ranAs ? automationStudioLlmLoopRanKey(call.toolId, call.ranAs, call.context) : written;
      ranAsHere.set(at(written, state), key);
      const here = at(key, state);
      if (call.stateBefore !== undefined) visited.add(call.stateBefore);
      if (call.stateAfter !== undefined) last = call.stateAfter;
      // A look that came to nothing says nothing after an act that landed: a reload leaves the same page with its handles to show again. An act that reports no page moved it unseen, as a trial's replay does.
      const landedAct = call.effect === "mutate" && call.effectApplied;
      if (landedAct) for (const [where, entry] of near) if (entry.look) near.delete(where);
      if (landedAct && call.stateAfter === undefined && visited.size > 0) last = undefined;
      const newState = call.stateAfter !== undefined && !visited.has(call.stateAfter);
      if (call.stateAfter !== undefined) visited.add(call.stateAfter);
      const newRows = (call.rows ?? []).filter((row) => !rowsSeen.has(row)).length > 0;
      for (const row of call.rows ?? []) rowsSeen.add(row);
      const newDraft = call.draftKey !== undefined && !draftsStoodAt.has(call.draftKey) && draftsStoodAt.size > 0;
      if (call.draftKey !== undefined) {
        startingDraft ??= call.draftKey;
        draftsStoodAt.add(call.draftKey);
      }
      const contexts = contextsSeen.get(call.toolId);
      const newContext = call.context !== undefined && contexts !== undefined && !contexts.has(call.context);
      if (call.context !== undefined) contextsSeen.set(call.toolId, (contexts ?? new Set()).add(call.context));
      const moved = call.stateAfter === undefined || call.stateAfter !== state;
      const look = call.effect === "observe" && call.rows === undefined;
      const newAct = call.effect === "mutate" && !call.refused && ((call.effectApplied && moved) || call.accepted === true) && !landed.has(here);
      if (newAct) {
        landed.add(here);
        heldActs.clear();
      }
      let sameAct: AutomationStudioLlmLoopFinding | undefined;
      if (call.undo === true && call.effectApplied) {
        acts.clear();
        actsWritten.clear();
      } else if (call.lasting === true && call.effectApplied && !call.refused && call.exempt !== true && call.rowBound !== true) {
        const act = automationStudioLlmLoopDigest([key, place ?? written]);
        const earlier = acts.get(act);
        const again = earlier !== undefined && earlier.rowsAt === rowsSeen.size;
        const times = again ? earlier.times + 1 : 1;
        // Read at the target's first landing and kept: a later call naming another act does not raise it.
        const asked = earlier ? earlier.asked : wholeCount(askedRepeats?.({ toolId: call.toolId, input: call.input, ...(call.act !== undefined ? { act: call.act } : {}) }));
        acts.set(act, { times, rowsAt: rowsSeen.size, toolId: call.toolId, callId: call.callId, asked });
        actsWritten.set(written, { act, targetWords: call.targetWords, place });
        if (times >= AUTOMATION_STUDIO_LLM_LOOP_SAME_ACT_AT && times > (asked ?? 0)) sameAct = { pattern: "same_act", repeats: times, toolIds: [call.toolId], unchanged: ["rows"], callId: call.callId };
      }
      if (call.placeAfter !== undefined) place = call.placeAfter;
      const progressed = !sameAct && (newState || newRows || newDraft || newContext || newAct);
      let sameFix: AutomationStudioLlmLoopFinding | undefined;
      if (call.fix === true) {
        // Only a submission known not to have worked: one accepted and never judged may well come back.
        const known = record.known(key);
        if (known?.outcome === "failed") sameFix = { pattern: "same_fix", repeats: known.times + 1, toolIds: [call.toolId], unchanged: ["draft"], callId: call.callId };
        record.tried({ kind: "fix", key, toolId: call.toolId, outcome: call.refused ? "failed" : "applied" });
        lastSubmission = key;
      }
      if (call.judges === true && call.refused && call.effectApplied && lastSubmission !== undefined) record.failed(lastSubmission);
      if (progressed) {
        near.delete(here);
        progress();
        tokens.push({ key, state: state ?? "", toolId: call.toolId, progressed: true, callId: call.callId, look });
        tokens = tokens.slice(-AUTOMATION_STUDIO_LLM_LOOP_MAX_CYCLE_PERIOD * 3);
        return { progressed: true, ...(sameFix ? { finding: sameFix } : {}) };
      }
      // Told, and no other pattern's to count: what refuses it, where anything does, is the ladder's reading of this one.
      if (sameAct) {
        record.tried({ kind: "call", key, toolId: call.toolId, outcome: "applied" });
        record.caught(key, "same_act");
        return { progressed: false, finding: sameAct };
      }
      const standsForItself = judgesWithNoPage === true && call.ranAs !== undefined && !call.effectApplied;
      const keyedOnNothing = state === undefined && call.context === undefined && !standsForItself;
      if (call.exempt === true || keyedOnNothing) return { progressed: false, ...(sameFix ? { finding: sameFix } : {}) };
      counted(key, state, call.toolId);
      window.callId = call.callId;
      tokens.push({ key, state: state ?? "", toolId: call.toolId, progressed: false, callId: call.callId, look });
      tokens = tokens.slice(-AUTOMATION_STUDIO_LLM_LOOP_MAX_CYCLE_PERIOD * 3);
      const earlier = near.get(here);
      // A look that answered differently on the same page is not the same look again; a read that kept no new row, or a call that failed or changed nothing, is.
      const sameAgain = !look || call.refused || earlier?.answer === undefined || earlier.answer === call.answer;
      const entry: NearEntry = { runs: sameAgain ? (earlier?.runs ?? 0) + 1 : 1, toolId: call.toolId, look, answer: call.answer, guarded: [...(sameAgain ? earlier?.guarded ?? [] : []), ...(guarded ? [call.input] : [])], callId: call.callId };
      near.set(here, entry);
      if (!call.effectApplied || call.refused) record.tried({ kind: "call", key, toolId: call.toolId, outcome: call.refused ? "failed" : "changed_nothing" });
      if (sameFix) {
        record.caught(key, "same_fix");
        return { progressed: false, finding: sameFix };
      }
      if (entry.runs >= AUTOMATION_STUDIO_LLM_LOOP_NEAR_REPEAT_AT) {
        record.caught(key, "near_repeat");
        return { progressed: false, finding: nearFinding(entry) };
      }
      if (standsForItself) {
        const held = heldActs.get(key);
        const runs = held && held.rowsAt === rowsSeen.size ? held.runs + 1 : 1;
        heldActs.set(key, { runs, rowsAt: rowsSeen.size });
        if (runs >= AUTOMATION_STUDIO_LLM_LOOP_NEAR_REPEAT_AT) {
          record.caught(key, "near_repeat");
          return { progressed: false, finding: { ...nearFinding(entry), repeats: runs } };
        }
      }
      const cycled = cycle();
      if (cycled) {
        for (const member of cycled.keys) record.caught(member, "cycle");
        cycleKeys = { keys: cycled.keys, finding: cycled.finding };
        return { progressed: false, finding: cycled.finding };
      }
      return { progressed: false, ...(window.count >= AUTOMATION_STUDIO_LLM_LOOP_NO_PROGRESS_WINDOW ? { finding: windowFinding() } : {}) };
    },
    unrun(toolId, input, context, state, answered) {
      const key = automationStudioLlmLoopCallKey(toolId, input, context);
      const page = state ?? last;
      if (page === undefined && context === undefined) return;
      counted(key, page, toolId);
      const earlier = near.get(at(key, page));
      near.set(at(key, page), { runs: (earlier?.runs ?? 0) + 1, toolId, look: earlier?.look ?? answered === true, answer: earlier?.answer, guarded: earlier?.guarded ?? [], callId: earlier?.callId });
    },
    amendmentRepeats(key, draftBefore) {
      const leads = amendmentsLed.get(automationStudioLlmLoopDigest([key, draftBefore ?? ""]));
      return leads === undefined ? undefined : { pattern: "same_fix", repeats: record.known(leads)?.times ?? 2, toolIds: ["amend_draft"], unchanged: ["draft"] };
    },
    amended(amendment) {
      const { key, draftBefore, draftAfter, applied, undone, changes } = amendment;
      counted(key, draftBefore, "amend_draft");
      if (draftBefore !== undefined) {
        startingDraft ??= draftBefore;
        draftsStoodAt.add(draftBefore);
        if (!record.known(draftBefore)) record.tried({ kind: "fix", key: draftBefore, toolId: "amend_draft", outcome: "applied" });
      }
      if (draftAfter === undefined || draftAfter === draftBefore || !applied) {
        const unchanged = record.tried({ kind: "fix", key: automationStudioLlmLoopDigest([key, draftBefore ?? ""]), toolId: "amend_draft", outcome: "changed_nothing", ...(changes ? { changes } : {}) });
        return { progressed: false, ...(unchanged.times >= 2 ? { finding: { pattern: "same_fix" as const, repeats: unchanged.times, toolIds: ["amend_draft"], unchanged: ["draft" as const] } } : {}) };
      }
      const cameBack = draftsStoodAt.has(draftAfter);
      const fromEarlierContext = !cameBack && fromEarlier.has(draftAfter) && draftAfter !== startingDraft;
      if (cameBack) draftReturns += 1;
      draftsStoodAt.add(draftAfter);
      amendmentsLed.set(automationStudioLlmLoopDigest([key, draftBefore ?? ""]), draftAfter);
      const stood = record.tried({ kind: "fix", key: draftAfter, toolId: "amend_draft", outcome: undone ? "undone" : "applied", ...(changes ? { changes } : {}) });
      if (!cameBack && !fromEarlierContext) {
        draftReturns = 0;
        progress();
        return { progressed: true };
      }
      // Twice in a row back to a draft is the same fix only if an edit has led to this one before. A draft only ever
      // built by running its steps, dropped back to, has not been tried: taking steps out edit by edit is not a fix
      // coming back, and telling the model it "did not work" would not be true (t867, bigbox-run6's decision 23).
      if ((draftReturns < 2 || stood.times < 2) && !fromEarlierContext) return { progressed: false };
      return { progressed: false, finding: { pattern: "same_fix", repeats: stood.times, toolIds: ["amend_draft"], unchanged: ["draft"] } };
    },
    moved() {
      last = undefined;
      tokens = [];
      progress();
    }
  };
}
