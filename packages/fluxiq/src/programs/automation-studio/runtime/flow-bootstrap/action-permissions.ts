// The permission gate on the authoring path: building a Flow from nothing.
//
// Every failure measured live on the jobs that change a page was an authoring
// build, and authoring had no way to say "this needs a person": the recovery
// path at least had a stop reason for it, and a build had only `flow_bootstrap.*`
// codes for things that went wrong. So a build that needed to press a control
// with a lasting consequence either had the press refused on the domain's own
// judgement -- and ended, some calls later, as a build that made no progress --
// or had nobody stop it, and built a Flow that would take the action every time
// it ran.
//
// This puts one gate in front of both. The consequences a person permitted the
// build say which it may have. The domain declares, action by action,
// which ones it would: for a step the build takes now while exploring, and for
// a step the finished Flow would take each time it runs, as it resolves that
// step's parameters. The first action the build does not hold ends it with
// `flow_bootstrap.permission_required`, carrying the request, and a later
// build's permitted consequences carry the person's answer.
//
// **An exploration refusal is recoverable; a plan refusal ends the build.** The
// two are not the same event and used to be treated as one. An exploration step
// the build is not permitted comes back to the model as the domain wrote it --
// `permission_required`, carrying which classes are missing and which request
// carries them -- so the model can do something else and the build can still
// finish. It used to throw here, which ended the build at the first refusal and
// left a person asked about a build that had produced nothing. A plan step,
// by contrast, is refused inside the completion check, which the loop cannot
// see into: handing that refusal back would ask the model again for a refusal
// no rewrite can answer, so it aborts the loop's signal and the build ends on
// the request. Should the refusal instead trip the unusable-decision guard,
// that ending is read through `endedOnRequest` too. Whichever way it stops, the
// caller asks `endedOnRequest` first.
//
// **The request goes to a person, and the build waits for the answer.** The
// conversation already has a `permission` ask keyed by the request's own
// `requestId` (`runtime/conversations/ask.ts`), and a parking port that opens
// one and holds the work in place until it is settled. This is the wiring
// between them: the gate raises the request, the ask puts it in the Flow's
// thread, and an answer that allows it widens what the build holds and lets the same action go
// ahead. Nothing new was invented for it.
//
// That changes the model's incentive as much as its capability. While a
// declared consequence dead-ended in a refusal and an undeclared one did not,
// the answer that let a build finish was the dishonest one. Now declaring leads
// to being asked and the build carries on, so honesty is the cheap path.
//
// One question at a time, and a person is never asked the same question twice.
// A request nobody answered -- the wait ran out, the thread could not be
// reached, the build was cancelled -- stays in force, and every later refusal
// reports that same request rather than asking again. So a build nobody is
// watching costs one wait, not one per action. A person who answered no is
// still there, though, and their no was about one control: that question --
// the same control, the same kind, the same classes -- is refused from then on
// without asking and is told to the domain as `declined`, while a different
// question is a new request and is asked. Until t195-w18 one decline ended
// every later ask too, so a build whose model declared money on "Continue to
// checkout" and was told no could never ask about "Place order", the press
// the task actually needed.
//
// **What every step declared travels with the build, not only the refused one.**
// A build's proposal carries the gate's whole record and Core's cross-check of
// it against the person's own instruction (`action-permissions/cross-check.ts`).
// Until this existed a permitted declaration was discarded where it was read,
// so the one question the seam exists to answer -- what did this step say it
// would do? -- could only be deduced from the absence of a refusal.
//
// The cross-check costs a provider call the build would not otherwise make,
// and only in the case worth paying for: at least one action was put to the
// gate and not one of them declared anything lasting, so the derivation that
// reads the instruction was never triggered. A build that declared something
// has already paid for it, and a build that acted on nothing has nothing to
// compare.
//
// **The read is made before a press, never inside one (t174-w107).** The gate
// derives the instruction's read when an action first declares something
// lasting -- from inside the domain's permission check, mid-press: run
// `run-musp8nz1-dbd3905a` read (0031) inside its Add to cart (0030). So
// `executeTool` makes the read before handing the domain a call whose input
// declares a lasting consequence, and the gate's check finds it made. Later
// points run no press: the first test (`instructedLastingActs`), the
// completion check, the cross-check. One read per build, whichever is first;
// only a class the domain adds to a call that declared none is read in the
// check. An act the read gave no answer (skipped, or a failed read) is read as
// lasting, so the tests check it rather than do it again, and the Flow's
// thread is told once which act, in the person's words. Which acts the tests
// check is composed in `instructedLastingActs` below: an act's kind (lane B,
// F1), a grounded quote (t174-w83, split acts by their clause since t262), or
// the act's own answer (t174-w107).
//
// A build that finishes while carrying an unanswered request is proposed with
// the request on it. The person is asked before anything is applied, never
// instead of getting a Flow:
// `assertAutomationStudioBootstrapPermissionRequestAnswered` is what stops an
// unanswered one reaching a replay, where there is no gate.
//
// **Which explored presses the domain answered as a toggle (t775).** Every call
// that ran is also told to the build's record of toggles
// (`./explored-toggles.ts`), which a submission reads to make a step on the
// same control safe to run again (`./script-statements/toggle-idempotent.ts`).

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import {
  AutomationStudioActionPermissionGate,
  automationStudioActionDeclarationCrossCheck,
  automationStudioConsequencesInOrder,
  automationStudioDestructiveConsequences,
  automationStudioInstructedActReads,
  readAutomationStudioActionDeclaration,
  type AutomationStudioActionDeclaration,
  type AutomationStudioActionDeclarationCrossCheck,
  type AutomationStudioActionDeclarationRecord,
  type AutomationStudioActionPermissionAction,
  type AutomationStudioActionPermissionCheck,
  type AutomationStudioActionPermissionRequest,
  type AutomationStudioInstructedConsequence,
  type AutomationStudioReadActionDeclaration
} from "../action-permissions/index.ts";
import type { AutomationStudioAuthoringMode } from "../../model/authoring-mode/index.ts";
import { automationStudioActivityAskPort } from "../activity/index.ts";
import { automationStudioFlowDraftDeclaresLasting } from "../flow-draft/index.ts";
import type { AutomationStudioHarnessOptionLoopBinding, AutomationStudioLlmEvidenceLoopAccounting, AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceLoopTrace, AutomationStudioLlmEvidenceToolExecutionResult } from "../llm/index.ts";
import { AUTOMATION_STUDIO_PERMISSION_ASK_TIMEOUT_MS, automationStudioPermissionAskOutcome, type AutomationStudioPermissionAsk } from "../parking/index.ts";
import type { AutomationStudioInstructedActKind } from "./instructed-acts/index.ts";
import { flowBootstrapPermissionRequiredFailure, type AutomationStudioFlowBootstrapFailureDiagnostic, type AutomationStudioFlowBootstrapGenerationError } from "./generation-failure/index.ts";
import {
  AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY,
  type AutomationStudioSiteResetCalls,
  type AutomationStudioSiteResetClaim,
  type AutomationStudioSiteResetDeclared,
  type AutomationStudioSiteResetSpot,
  type AutomationStudioSiteResetTarget
} from "./site-reset/contracts.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS } from "./site-reset/words.ts";
import { AutomationStudioExploredToggles } from "./explored-toggles.ts";
import { automationStudioSiteResetWitnessStampValid, type AutomationStudioSiteResetAdmissionDeclared, type AutomationStudioSiteResetWitness, type AutomationStudioSiteResetWitnessStamp } from "./reset-admission/index.ts";

/**
 * How long a build waits for an answer, for a caller that waits at all.
 *
 * The one Core bound, under the name this path has always exported it by. The
 * mechanism and the reasoning moved to `parking/permission-ask.ts` on
 * 2026-09-22, when the repair path had to ask the same question the same way.
 */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERMISSION_ASK_TIMEOUT_MS = AUTOMATION_STUDIO_PERMISSION_ASK_TIMEOUT_MS;

/** Where a build's permission question goes, and where its answer comes back from. */
export type AutomationStudioFlowBootstrapPermissionAsk = AutomationStudioPermissionAsk;

export type AutomationStudioFlowBootstrapActionPermissions = {
  /** The domain's executor, with the build's permission check handed to every action. */
  executeTool: AutomationStudioLlmEvidenceLoopInput["executeTool"];
  /**
   * The check for one step of the Flow being built, handed to the domain as it resolves the step. `witnessed`, when given,
   * is told the reset witness stamp of each reversible lasting declaration the domain puts to it (t751, R3 door 2;
   * `stepWitness`), or `undefined` where the build's site reset found none or has no step admission.
   */
  planStep: (step: { definitionId: string; ref: string; witnessed?: ((stamp: AutomationStudioSiteResetWitnessStamp | undefined) => void) | undefined }) => AutomationStudioActionPermissionCheck;
  /**
   * Aborted when a *plan* step is refused, which is the refusal the loop cannot
   * see. The evidence loop runs under it. An exploration refusal leaves it
   * alone: the loop saw that one and the model may act on it.
   */
  signal: AbortSignal;
  /** What the instruction was read to ask for, once the build first needed to know; stored with what it builds. */
  instructed(): readonly AutomationStudioInstructedConsequence[] | undefined;
  /**
   * The ids of the instruction's acts that ask for something lasting, for the
   * build's tests (`../flow-draft/verify-only.ts`): a step claiming one is
   * checked rather than run again, whatever it declared.
   *
   * Forces the instruction's read now -- the one read the build makes, which
   * the cross-check after the build reuses rather than paying for again -- so
   * a caller asks before the first test, even when every act is lasting by its
   * kind. An act is lasting when any of three holds:
   *
   * (a) **Its kind.** An act whose kind does something to an item that stays
   * done -- `add_to`, `save`, `claim`, `move`, `submit`, the kinds
   * `./instructed-acts/instruction-acts.ts` already counts per item -- whatever
   * the read quoted. Run `run-musp4h2f-72e8ed99` (lane B, F1) is why: Core
   * split "add two packs of ... and one pack of ... to my cart" into two adds,
   * the read quoted the coordinated sentence, neither quote contained the
   * other, and the four tests pressed both Add to cart steps again until the
   * cart held 12 items.
   *
   * (b) **A grounded quote** (t174-w83). One of the read's quotes contains the
   * act's words, or its words contain the quote, after case and spacing are
   * set aside: the read quotes the person's words and so does the act, each
   * bounded its own way, so neither is reliably the longer. An act split from
   * one clause (`source`, t262) has a display quote Core assembled, so it is
   * grounded in its original clause and its own object's words instead: a
   * sibling's narrow quote or the shared verb alone proves nothing for it.
   *
   * (c) **Its own answer** (t174-w107). When the read carries per-act answers,
   * an act whose answer -- same id, same words -- is missing, unanswered, or
   * names a class is lasting until shown otherwise; only an act answered with
   * nothing lasting is left to run again. Run `run-musp8nz1-dbd3905a`
   * (Cause 5) is why: its read answered the cart and not the coupon.
   *
   * Every other act (a `set` or an `open` the read neither quotes nor
   * answered as lasting) is sent again: that is what keeps "sort the results"
   * or "open saved items" running, while "switch my pickup store" the read
   * calls a change stays checked. Only an act's own id is named; a choice of
   * it (`a1.colour`) never is. No acts, no read: an instruction that asks for
   * no act has nothing for the tests to withhold. A read that throws holds no
   * quotes and no answers, so it names only the acts lasting by their kind.
   */
  instructedLastingActs(acts: readonly { id: string; quote: string; kind?: AutomationStudioInstructedActKind | undefined; source?: { clause: string; object: string } | undefined }[]): Promise<ReadonlySet<string>>;
  /** The request the latest refusal carried, or `undefined` when none stands. Stored with a build that finished anyway. */
  request(): AutomationStudioActionPermissionRequest | undefined;
  /** Every explored press the domain answered as a toggle, for the build's submissions to read (header, t775). */
  exploredToggles: AutomationStudioExploredToggles;
  /** What every action put to the gate declared about itself, in the order it was asked. */
  declarations(): readonly AutomationStudioActionDeclarationRecord[];
  /**
   * What the build declared, held against what the person's instruction asks
   * for. `undefined` when no action was ever put to the gate, because a build
   * that acted on nothing has nothing to contradict.
   *
   * Called once, after the loop has stopped. It may derive the instruction's
   * authority -- one provider call -- for a build that never needed it, and
   * it says the finding in the Flow's thread: as a yes-or-no question through
   * `ask` when a class nobody declared is one a person is asked about, and
   * otherwise as a plain line through `say`, or not at all without one. It
   * never refuses or pauses anything.
   */
  crossCheck(): Promise<AutomationStudioActionDeclarationCrossCheck | undefined>;
  /**
   * The ending a raised request makes, or `undefined` when none was raised.
   * Read first once the loop stops: a request is why it stopped, and the loop
   * itself only saw a tool that did not come back or a signal that fired.
   */
  endedOnRequest(
    progress?: { trace: readonly AutomationStudioLlmEvidenceLoopTrace[]; accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting> },
    accounting?: NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["accounting"]>
  ): AutomationStudioFlowBootstrapGenerationError | undefined;
};

export function automationStudioFlowBootstrapActionPermissions(input: {
  /** Project-builder exploration only; other authoring and finalized run paths are unchanged. */
  requireCreateBaseline?: boolean;
  /** The consequences the build was permitted. Absent permits nothing. */
  permittedConsequences: readonly string[] | undefined;
  /** The instructions the build carries out: the reason any action was wanted. */
  instructionIds: readonly string[];
  executeTool: AutomationStudioHarnessOptionLoopBinding["executeTool"];
  /** Reads the instruction for what it already asks for; see `instruction-authority.ts`. */
  deriveInstructed?: (() => Promise<readonly AutomationStudioInstructedConsequence[]>) | undefined;
  /** Absent, a refused action is refused and nobody is asked, exactly as before a thread existed. */
  ask?: AutomationStudioFlowBootstrapPermissionAsk | undefined;
  /**
   * Says something in the Flow's thread that is not a question, for a finding
   * that needs no answer. Absent, such a finding is recorded on the proposal
   * and not said: the parking port only opens questions, and a creation or an
   * edit nobody declared is not one to put to the person.
   */
  say?: ((text: string) => Promise<unknown>) | undefined;
  /**
   * How the build is authored. The line about acts the instruction's read
   * left unanswered is said only in `legacy` (the default): it tells the
   * person that the build's dry-run tests check such a step rather than do it
   * again, and a candidate build has no such tests -- its test runs the whole
   * Flow from its start -- so there the line was untrue and is not said (t370,
   * lane A round 7 UI), nor in `project`, whose builds test the same way. The
   * read still treats the act as lasting either way.
   */
  authoringMode?: AutomationStudioAuthoringMode | undefined;
  /**
   * The candidate build's site-reset ledger (t462). Present, an exploration
   * call's `undoes` key is read by it and stripped before the domain sees the
   * call, and every call that ran is reported to it. An undo's every action
   * is put to the ledger before the gate (t475): one on a control that is not
   * its act's own item, nor on what the act created, is refused unrun and
   * asks nobody. Absent, every call goes through exactly as before. Plan
   * steps are never undos.
   */
  siteReset?: AutomationStudioSiteResetCalls | undefined;
  now?: () => number;
  newRequestId?: () => string;
}): AutomationStudioFlowBootstrapActionPermissions {
  const gate = new AutomationStudioActionPermissionGate({
    permittedConsequences: input.permittedConsequences,
    stage: "authoring",
    instructionIds: input.instructionIds,
    deriveInstructed: input.deriveInstructed,
    // The build puts its own request to a person, so the gate must not end it.
    endsOnRequest: false,
    now: input.now,
    newRequestId: input.newRequestId
  });
  // The gate's own signal is not what the loop runs under. The gate aborts it
  // on any refusal, which is right for the gate -- it has answered its one
  // request -- and wrong for the build, which can carry on exploring. This one
  // fires only for the refusal the loop cannot see.
  const planRefused = new AbortController();
  // Each request is put to a person once. A request nobody answered stays in
  // force at the gate and every later refusal carries its id, so a build
  // nobody is watching still waits once. A person's decline is remembered at
  // the gate for that question alone; a different question raises a request
  // with a new id, and that one is asked (t195-w18).
  const asked = new Set<string>();
  /** The gate's check, with the refusal it would return put to a person first. */
  const asking = (action: AutomationStudioActionPermissionAction): AutomationStudioActionPermissionCheck => {
    const check = gate.checkFor(action);
    return async (declaration) => {
      const decision = await check(declaration);
      const request = gate.request;
      if (decision.permitted || decision.declined || !input.ask || !request || request.requestId !== decision.requestId || asked.has(request.requestId)) return decision;
      asked.add(request.requestId);
      // The wait and its answer are said where the port settles them (`../activity/ask/port.ts`).
      const outcome = await automationStudioPermissionAskOutcome({ ...input.ask, port: automationStudioActivityAskPort(input.ask.port, "building") }, request);
      if (outcome === "unanswered") {
        gate.settle("unanswered");
        return decision;
      }
      gate.settle(outcome);
      // Asked again rather than answered from here: the gate recomputes what is
      // missing against what it now holds -- permitted after a grant, refused as
      // `declined` after a no -- so nothing decides permission twice.
      return await check(declaration);
    };
  };
  // The presses the domain answered as a toggle (header, t775).
  const exploredToggles = new AutomationStudioExploredToggles();
  // The read, once, with any act it left unanswered said once in the thread.
  let unansweredSaid = false;
  const read = async (): Promise<readonly AutomationStudioInstructedConsequence[]> => {
    const entries = await gate.resolveInstructed();
    const unanswered = (automationStudioInstructedActReads(entries) ?? []).filter((act) => act.consequences === null);
    if (unanswered.length && !unansweredSaid) {
      unansweredSaid = true;
      if (input.authoringMode === undefined || input.authoringMode === "legacy") await saidUnanswered(input.say, unanswered.map((act) => act.quote));
    }
    return entries;
  };
  return {
    executeTool: async (call) => {
      const siteReset = input.siteReset;
      if (!siteReset) {
        // Before the domain has the call, not from inside its permission check (see the header).
        if (automationStudioFlowDraftDeclaresLasting(call.value.consequences)) await read();
        const check = asking({ kind: "exploration_step", id: call.toolId, ref: call.callId });
        let unproved = false;
        const permission: AutomationStudioActionPermissionCheck = async (declaration) => {
          if (input.authoringMode === "project" && reversibleLasting(readAutomationStudioActionDeclaration(declaration))) {
            unproved = true;
            return { permitted: false, missing: [], requestId: null };
          }
          return await check(declaration);
        };
        const execution = await input.executeTool({ ...call, permission });
        gate.observe(execution);
        exploredToggles.explored(call, execution);
        if (unproved) return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "candidate.create_baseline_unavailable", instruction: "This lasting action was not run because this project's original-state preflight is unavailable. End honestly naming the unavailable precondition; no new permission is required." }, effectApplied: false, targetsUnchanged: true, resultCode: "candidate.create_baseline_unavailable" };
        // Recoverable. The domain has already turned a refusal nobody granted
        // into evidence the model can read and route around, and the request it
        // names is on the build whatever the model does next.
        return execution;
      }
      // A candidate build's call, which may name an act of this build it
      // undoes (t462). Only the ledger reads the claim; the domain never sees it.
      const { value, claim } = claimed(siteReset, call.value);
      if (claim.kind === "refused") {
        const code = claim.evidence.code;
        return { kind: "llm_evidence_tool_execution", evidence: claim.evidence, effectApplied: false, targetsUnchanged: true, ...(typeof code === "string" ? { resultCode: code } : {}) };
      }
      const undo = claim.kind === "undo" ? claim.undo : undefined;
      if (automationStudioFlowDraftDeclaresLasting(value.consequences)) await read();
      const check = asking({ kind: "exploration_step", id: call.toolId, ref: call.callId });
      // The last action the domain put to the gate for this call, as the gate read it.
      let declared: AutomationStudioSiteResetDeclared | undefined;
      // For an undo, where the control the domain is about to act on sits, read before it acts (t475).
      let target: AutomationStudioSiteResetTarget | undefined;
      let createRefusal: { evidence: JsonObject & { code: string } } | undefined;
      const permission: AutomationStudioActionPermissionCheck = async (declaration) => {
        if (!undo) {
          const action = readAutomationStudioActionDeclaration(declaration);
          const needsBaseline = action.effect === "mutate" && action.consequences.length === 1 && action.consequences[0] === "create_new" && (action.controlSubject !== null || (action.controlItem === null && action.controlPage !== null));
          let baseline: ReturnType<NonNullable<AutomationStudioSiteResetCalls["createBaseline"]>> | undefined;
          if (input.authoringMode === "project" || (input.requireCreateBaseline === true && call.toolId === "core.run_node" && typeof value.node === "string")) {
            if (siteReset.createBaseline) baseline = siteReset.createBaseline({ effect: action.effect, consequences: action.effect === "observe" ? [] : action.consequences, control: { name: null, kind: null, ...placeOf(action) } }, call.value.resetDestination);
            else if (needsBaseline || (input.authoringMode === "project" && reversibleLasting(action))) baseline = { kind: "refused", evidence: { ok: false, code: "candidate.create_baseline_unavailable", instruction: "This lasting action was not run because the build's original-state preflight is unavailable. Looking and navigating remain safe; report the unavailable precondition instead of making an unproved effect. No new permission is required." } };
          }
          if (baseline?.kind === "refused") {
            createRefusal = baseline;
            return { permitted: false, missing: [], requestId: null };
          }
          const verdict = await check(declaration);
          declared = declaredAs(gate, declaration, verdict.permitted);
          return verdict;
        }
        // Read as the gate reads it, so a declaration it would refuse to read is refused here the same way.
        const action = readAutomationStudioActionDeclaration(declaration);
        target = siteReset.target(undo.act, {
          effect: action.effect,
          consequences: action.effect === "observe" ? [] : action.consequences,
          control: placeOf(action)
        });
        // Another item's control: never acted on, and nobody is asked about it.
        if (target.kind === "refused") return { permitted: false, missing: [], requestId: null };
        const verdict = await asking({ kind: "exploration_step", id: call.toolId, ref: call.callId, undoes: { act: undo.act, allowed: target.allowed } })(declaration);
        declared = declaredAs(gate, declaration, verdict.permitted);
        return verdict;
      };
      const execution = await input.executeTool({ ...call, value, permission });
      gate.observe(execution);
      exploredToggles.explored({ ...call, value }, execution);
      if (createRefusal) return { kind: "llm_evidence_tool_execution", evidence: createRefusal.evidence, effectApplied: false, targetsUnchanged: true, resultCode: createRefusal.evidence.code };
      siteReset.explored({
        callId: call.callId,
        toolId: call.toolId,
        ...(typeof value.node === "string" ? { operation: value.node } : {}),
        ...(undo ? { undoes: undo.act } : {}),
        ...(declared ? { declared } : {}),
        ...(target?.kind === "admit" ? { on: target.on } : {}),
        // The destination the call named, for its act or the act it undoes, for the ledger to keep (`./site-reset/ledger.ts`, F1).
        ...(typeof call.value.resetDestination === "string" ? { resetDestination: call.value.resetDestination } : {}),
        landed: landed(execution)
      });
      if (target?.kind === "refused") {
        return { kind: "llm_evidence_tool_execution", evidence: target.evidence, effectApplied: false, targetsUnchanged: true, resultCode: target.evidence.code };
      }
      // An undo the gate refused keeps its act (`./site-reset/ledger.ts`), and the model is told so in plain words.
      if (undo && declared && declared.effect === "mutate" && !declared.permitted && isExecutionResult(execution)) {
        const code = "candidate.undo_refused";
        return { ...execution, evidence: { ok: false, code, act: undo.act, instruction: AUTOMATION_STUDIO_SITE_RESET_WORDS.undoRefused(), ...(execution.evidence !== undefined ? { refusal: execution.evidence } : {}) }, resultCode: code };
      }
      return execution;
    },
    planStep: (step) => {
      const check = asking({ kind: "flow_step", id: step.definitionId, ref: step.ref });
      return async (declaration) => {
        const decision = await check(declaration);
        // The completion check is opaque to the loop, so a refusal inside it
        // has to stop the loop from here or it is asked again unanswerably.
        if (!decision.permitted) planRefused.abort();
        // The step's witness, from the one admission, for the resolver to stamp; never a refusal (t751, R3 door 2).
        else if (step.witnessed) {
          const read = readAutomationStudioActionDeclaration(declaration);
          if (reversibleLasting(read)) step.witnessed(stepWitness(input.siteReset, { effect: read.effect, consequences: read.consequences, control: { name: null, kind: null, ...placeOf(read) } }, step.definitionId));
        }
        return decision;
      };
    },
    signal: planRefused.signal,
    instructed: () => gate.instructed,
    instructedLastingActs: async (acts) => {
      const own = acts.filter((act) => !act.id.includes("."));
      if (!own.length) return new Set<string>();
      // The gate holds the read, so this and `crossCheck` share one provider call; it is made even when every act lasts by its kind.
      const entries = await read();
      const quotes = entries.map((entry) => folded(entry.quote)).filter((quote) => quote.length > 0);
      const answers = automationStudioInstructedActReads(entries);
      return new Set(own.filter((act) => {
        // (a) Its kind.
        if (act.kind && LASTING_KINDS.has(act.kind)) return true;
        // (b) A grounded quote.
        const words = folded(act.quote);
        if (quotedLasting(act, words, quotes)) return true;
        // (c) Its own answer: one the read did not give, or gave under other words, is lasting until shown otherwise.
        if (!answers) return false;
        const answer = answers.find((candidate) => candidate.act === act.id && folded(candidate.quote) === words);
        return !answer || answer.consequences === null || answer.consequences.length > 0;
      }).map((act) => act.id));
    },
    request: () => gate.request,
    exploredToggles,
    declarations: () => gate.declarations,
    crossCheck: async () => {
      // Undo records are the build putting the site back (t462): a build that
      // did nothing else has nothing to compare, and pays for no read.
      if (!gate.declarations.some((record) => record.undoes === undefined)) return undefined;
      const crossCheck = automationStudioActionDeclarationCrossCheck({
        declarations: gate.declarations,
        instructed: await read()
      });
      if (crossCheck.verdict === "undeclared") await saidOutLoud(input, crossCheck);
      return crossCheck;
    },
    endedOnRequest: (progress, accounting) => gate.request
      ? flowBootstrapPermissionRequiredFailure(gate.request, progress ?? NO_LOOP_PROGRESS, accounting)
      : undefined
  };
}

/**
 * A candidate call's input with any `undoes` key taken off, and the ledger's
 * reading of that key. Only an own key counts; a call without one is never
 * asked about and goes to the domain as it came.
 */
function claimed(siteReset: AutomationStudioSiteResetCalls, value: JsonObject): { value: JsonObject; claim: AutomationStudioSiteResetClaim } {
  const { resetDestination, [AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY]: undoes, ...rest } = value;
  // The ref the same call names goes with the claim, so one no receipt printed is refused before the call runs (rerun round 2).
  return { value: rest, claim: undoes === undefined ? { kind: "none" } : siteReset.claim(undoes, resetDestination) };
}

/**
 * What one action put to the gate, as the gate read it: the consequences it
 * holds lasting (none for a read), and the control's name only as the gate
 * would carry it to a person. Read after the gate answered, so a declaration
 * the gate refused to read never reaches here.
 */
function declaredAs(gate: AutomationStudioActionPermissionGate, declaration: AutomationStudioActionDeclaration, permitted: boolean): AutomationStudioSiteResetDeclared {
  const read = readAutomationStudioActionDeclaration(declaration);
  return {
    permitted,
    effect: read.effect,
    consequences: read.effect === "observe" ? [] : automationStudioConsequencesInOrder(read.consequences),
    control: {
      name: gate.carriedControlName(read.controlName), kind: read.controlKind,
      // Opaque, compared only for equality, and never carried to a person (t475, t719).
      ...placeOf(read)
    },
    verb: read.verb
  };
}

/** The opaque place tokens a declaration gave its control (t475, t719): where it sits and what it and its page are about; each absent where it gave none. */
function placeOf(read: AutomationStudioReadActionDeclaration): AutomationStudioSiteResetSpot {
  return {
    ...(read.controlItem !== null ? { item: read.controlItem } : {}),
    ...(read.controlDialog !== null ? { dialog: read.controlDialog } : {}),
    ...(read.controlSubject !== null ? { subject: read.controlSubject } : {}),
    ...(read.controlPage !== null ? { page: read.controlPage } : {}),
    ...(read.controlScope !== null ? { scope: read.controlScope } : {}),
    ...(read.controlResource !== null ? { resource: read.controlResource } : {}),
    ...(read.controlPlace !== null ? { place: read.controlPlace } : {}),
    ...(read.controlState !== null ? { state: read.controlState } : {})
  };
}

/** The classes a site's own controls can reverse: the only declarations a plan step is stamped for (t751, R3 door 2). */
const REVERSIBLE: ReadonlySet<string> = new Set(["create_new", "modify_existing", "delete"]);

/** A mutating declaration whose every lasting class is reversible. */
function reversibleLasting(read: AutomationStudioReadActionDeclaration): boolean {
  return read.effect === "mutate" && read.consequences.length > 0 && read.consequences.every((consequence) => REVERSIBLE.has(consequence));
}

/**
 * The site reset's step admission, as this gate calls it (t751, R3 door 2): structural, so a ledger without it compiles
 * and answers nothing. Its answer is read whichever form it takes -- a stamp, or the admission's verdict -- and only a
 * valid stamp comes back.
 */
type StepAdmitting = { admitStep?(declared: AutomationStudioSiteResetAdmissionDeclared, definitionId: string): unknown };

/** The stamp the build's site reset admits a plan step's declaration with, or `undefined` (`StepAdmitting`). */
function stepWitness(siteReset: AutomationStudioSiteResetCalls | undefined, declared: AutomationStudioSiteResetAdmissionDeclared, definitionId: string): AutomationStudioSiteResetWitnessStamp | undefined {
  const admit = (siteReset as (AutomationStudioSiteResetCalls & StepAdmitting) | undefined)?.admitStep;
  if (typeof admit !== "function") return undefined;
  const answer: unknown = admit.call(siteReset, declared, definitionId);
  if (automationStudioSiteResetWitnessStampValid(answer)) return answer;
  const witness = answer !== null && typeof answer === "object" && (answer as { kind?: unknown }).kind === "admit" ? (answer as { witness?: AutomationStudioSiteResetWitness }).witness : undefined;
  const stamp = witness === undefined ? undefined : witness.via === "destination" ? { via: witness.via, ref: witness.ref } : witness.via === "repeats" ? { via: witness.via, act: witness.act } : { via: witness.via };
  return automationStudioSiteResetWitnessStampValid(stamp) ? stamp : undefined;
}

/** An evidence tool's own answer, as opposed to bare JSON. */
function isExecutionResult(execution: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): execution is AutomationStudioLlmEvidenceToolExecutionResult {
  return Boolean(execution) && typeof execution === "object" && !Array.isArray(execution) && (execution as { kind?: unknown }).kind === "llm_evidence_tool_execution";
}

/** The call applied an effect and did not answer `ok: false`: what the ledger counts as an act having landed. */
function landed(execution: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): boolean {
  if (!execution || typeof execution !== "object" || Array.isArray(execution) || execution.kind !== "llm_evidence_tool_execution") return false;
  const result = execution as AutomationStudioLlmEvidenceToolExecutionResult;
  return result.effectApplied === true && !automationStudioLlmEvidenceRefusedItself(result.evidence);
}

/** The evidence's own `ok: false`, Core's word for a call that refused itself. */
function automationStudioLlmEvidenceRefusedItself(evidence: unknown): boolean {
  return Boolean(evidence) && typeof evidence === "object" && !Array.isArray(evidence) && (evidence as { ok?: unknown }).ok === false;
}

/** The act kinds that do something to an item that stays done: lasting whatever the read quoted (`instructedLastingActs`, (a)). */
const LASTING_KINDS: ReadonlySet<AutomationStudioInstructedActKind> = new Set(["add_to", "save", "claim", "move", "submit"]);

/**
 * Whether one of the read's quotes grounds the act (`instructedLastingActs`,
 * (b)). Split-object display quotes are assembled, not original spans: such an
 * act is grounded in its original clause and its own object's words, and a
 * sibling's narrow quote or a shared verb alone proves nothing for it.
 */
function quotedLasting(act: { source?: { clause: string; object: string } | undefined }, words: string, quotes: readonly string[]): boolean {
  if (!words.length) return false;
  if (!act.source) return quotes.some((quote) => quote.includes(words) || words.includes(quote));
  const clause = folded(act.source.clause);
  const object = folded(act.source.object);
  return object.length > 0 && clause.includes(object) && words.includes(object) && quotes.some((quote) =>
    quote.includes(object) && (quote.includes(words) || words.includes(quote) || quote.includes(clause) || clause.includes(quote))
  );
}

/** How much of each unanswered act's words the thread is shown. */
const UNANSWERED_QUOTE_MAX = 120;

/**
 * The line naming the acts the read gave no answer for. A long quote is cut
 * where a word ends: cut at 119 characters it read "...the 7-in-1 version,
 * shipped f..." (W25, run-mux6n7m4-8273e7a0).
 */
export function automationStudioFlowBootstrapUnansweredSaid(quotes: readonly string[]): string {
  const named = quotes.map((quote) => `"${quoteCut(quote)}"`).join(", ");
  const one = quotes.length === 1;
  return `I could not tell from your instruction whether ${named} ${one ? "changes" : "change"} something that stays changed, so when the build tests its steps it checks ${one ? "the step that does it" : "the steps that do them"} rather than doing ${one ? "it" : "them"} again.`;
}

/** `quote` within `UNANSWERED_QUOTE_MAX`, cut after its last whole word with an ellipsis; one word longer than that is cut where it must. */
function quoteCut(quote: string): string {
  if (quote.length <= UNANSWERED_QUOTE_MAX) return quote;
  const kept = quote.slice(0, UNANSWERED_QUOTE_MAX - 1);
  const space = quote.charAt(UNANSWERED_QUOTE_MAX - 1) === " " ? UNANSWERED_QUOTE_MAX - 1 : kept.lastIndexOf(" ");
  const cut = space > 0 ? kept.slice(0, space) : kept;
  return `${cut.trimEnd().replace(/[,;:]+$/u, "")}…`;
}

/**
 * Says, once, which of the person's acts the instruction's read gave no answer
 * for, and what the build does about it. A plain line, never a question: the
 * build carries on and loses nothing by it. Best-effort, like every line the
 * gate says; the read's own step record keeps the answer it gave either way.
 */
async function saidUnanswered(say: ((text: string) => Promise<unknown>) | undefined, quotes: readonly string[]): Promise<void> {
  if (!say) return;
  try {
    await say(automationStudioFlowBootstrapUnansweredSaid(quotes));
  } catch {
    /* best-effort: a thread that could not be written to changes nothing the build does. */
  }
}

/** A quote as `instructedLastingActs` compares it: lower case, every run of spacing one space. */
function folded(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").trim();
}

/** What a build that ran no evidence loop has to show for itself: nothing, honestly. */
const NO_LOOP_PROGRESS: { trace: readonly AutomationStudioLlmEvidenceLoopTrace[]; accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting> } = Object.freeze({
  trace: Object.freeze([]),
  accounting: Object.freeze({ iterations: 0, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 })
});

/**
 * Says a contradiction in the Flow's own thread, and does not wait.
 *
 * **A question only for what a person is asked about.** The user's rule
 * (2026-10-01): only moving money, deleting, and sending or publishing ask the
 * person (`../action-permissions/destructive.ts` is that list). So the finding
 * is a yes-or-no question only when one of the classes nobody declared is one
 * of those; `modify_existing` and `create_new` -- adding to a cart, choosing a
 * colour -- are said as a plain line where the thread takes one (`say`), and
 * not at all where it only takes questions. Run `run-muqk4u32-0b36e58f` ended
 * on "... Apply it as it stands?" about a creation and an edit, a question the
 * rule says nobody should have been asked. Either way the finding is on the
 * proposal (`permission-outcome.ts`).
 *
 * Never a pause: the build has finished and has a Flow, and the question is
 * whether to apply it, which the person answers by approving the proposal the
 * finding is recorded on. A `confirm` rather than an `open` question, so the
 * thread offers yes and no and an answer means something; `parks: false`,
 * because nothing is being held. A thread that cannot be written to loses the
 * turn and keeps the record, which is the same trade the permission ask makes.
 */
async function saidOutLoud(
  thread: { ask?: AutomationStudioFlowBootstrapPermissionAsk | undefined; say?: ((text: string) => Promise<unknown>) | undefined },
  crossCheck: AutomationStudioActionDeclarationCrossCheck
): Promise<void> {
  const asksPerson = automationStudioDestructiveConsequences(crossCheck.undeclared).length > 0;
  try {
    if (!asksPerson) {
      if (thread.say) await thread.say(crossCheck.sentence);
      return;
    }
    if (!thread.ask) return;
    await thread.ask.port.open({
      askId: `declaration-cross-check:${crossCheck.undeclared.join("-")}:${Math.trunc((thread.ask.now ?? Date.now)())}`,
      kind: "confirm",
      parks: false,
      timeoutMs: null,
      onTimeout: null,
      options: null,
      routes: null,
      consequences: [...crossCheck.undeclared],
      missing: null,
      control: null,
      permissionRequest: null,
      status: "pending",
      text: `${crossCheck.sentence} Apply it as it stands?`,
      raisedBy: { stage: "authoring" }
    });
  } catch {
    /* best-effort: a thread that could not be written to is not a reason to lose the Flow, and the finding is recorded on the proposal either way. */
  }
}
