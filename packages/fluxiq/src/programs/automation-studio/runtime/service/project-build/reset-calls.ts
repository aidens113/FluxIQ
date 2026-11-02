import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS, type AutomationStudioSiteResetCalls, type AutomationStudioSiteResetLedger, type AutomationStudioSiteResetNamedAct, type AutomationStudioSiteResetPlace, type AutomationStudioSiteResetProjectLedger, type AutomationStudioSiteResetRead } from "../../flow-bootstrap/site-reset/index.ts";
import { AuthoringExecutionScope, invokeAuthoringExecutionCallback, invokeAuthoringExecutionSync } from "../../../../../runtime/flow-authoring/execution/observation/index.ts";
import { ExecutionCallbackPolicies } from "../../../../../runtime/execution-observation/policies/index.ts";
import type { ExecutionCallbackCall } from "../../../../../runtime/execution-observation/index.ts";

// What a reset brief's permission gate tells the ledger (unit A5c). A reset
// undoes acts other agents made -- each builder's, and the supervisor's whole
// trials' -- and each act lives in its owner's ledger of the project ledger
// (`flow-bootstrap/site-reset/project-ledger.ts`), numbered once across the
// build. So an undo is put to the ledger that owns the act it names: the claim,
// each control it acts on, and the call once it ran. That ledger then judges
// the undo exactly as it judges its own brief's (its own item, what it created,
// the site's one confirmation), and counts it towards the act being undone.
// A call that names no act is the reset's own, and goes to the reset brief's
// ledger, which records any lasting act the reset itself made.
//
// The same routing serves the reads around each call (`./brief-ports.ts`,
// `flow-bootstrap/site-reset/act-places.ts`): what an undo did to its page is
// told to the act's owner, and where an act of the reset's own was made, to the
// reset's ledger.
//
// **A refusal lists the whole build's open acts (rerun round 3, office
// `run-mvgo5xft-25460ba2`, 0110).** The owner's ledger fills a refused claim's
// `actsToUndo` from its own acts alone, so a repeat of a settled act's undo was
// answered `candidate.undo_act_kept` with `actsToUndo: []` while two acts of
// other briefs were open, and the model tested into another refusal. The
// routing, not the ledger, knows the other briefs: a refused claim or target
// whose evidence lists acts (`undo_act_kept`, `undo_unknown_act`,
// `undo_already_done`) is answered with every brief's open act (`openActs`, the
// same union the trial gate and a reset's task list), keeping the owner's own
// choice of which of its acts to name, and its words follow whether any is
// listed.
//
// **The acts no call can settle are the build's too (t743, S2).** Such an act
// (`unsatisfiable()`) is never among the acts to undo, so `openActs` leaves it
// out; the owner's ledger lists its own apart under `actsUnsettleable`. A
// refusal that lists the build's open acts lists the whole build's such acts
// there too, so the model is told everything of the build still on the site.

/** The refusals whose evidence lists the acts still to undo (header). */
const LISTING: ReadonlySet<string> = new Set(["candidate.undo_act_kept", "candidate.undo_unknown_act", "candidate.undo_already_done"]);

export function automationStudioProjectBuildResetCalls(project: AutomationStudioSiteResetProjectLedger, own: AutomationStudioSiteResetLedger): AutomationStudioSiteResetCalls & {
  observed(read: AutomationStudioSiteResetRead): void | Promise<void>;
  observedAndFlushed(read: AutomationStudioSiteResetRead, baseline: boolean, invocation: object): Promise<void>;
  actOf(callId: string): string | undefined;
  placed(act: string, place: AutomationStudioSiteResetPlace): void;
  undoSeen(act: string, changedInPlace: boolean): void;
  noEffect(act: string): void;
  /** Where one act of any brief stands, as its owner's ledger says (`ledger.ts`, `standing`); undefined for an id no brief gave. */
  standing(act: string): ReturnType<AutomationStudioSiteResetLedger["standing"]>;
  /** Every act of the build still to undo, in the order recorded, as its own ledger names it (with `settle` while open), and its ref. */
  openActs(): Array<AutomationStudioSiteResetNamedAct & { ref: string }>;
  /** The lists named for one settled act that its owner's ledger could not read again (`ledger.ts`, `unreadOf`); undefined where none, or for an id no brief gave. */
  unreadOf(act: string): readonly string[] | undefined;
} {
  const snapshot = () => invokeAuthoringExecutionSync(calls, { receiver: project, callback: project.snapshot, args: [] });
  const forBrief = (brief: string) => invokeAuthoringExecutionSync(calls, { receiver: project, callback: project.forBrief, args: [brief] });
  const ownerOf = (act: unknown): string | undefined => (typeof act === "string" ? snapshot().acts.find((entry) => entry.act === act)?.owner : undefined);
  const owner = (act: unknown): AutomationStudioSiteResetLedger => {
    const found = ownerOf(act);
    return found !== undefined ? forBrief(found) : own;
  };
  const openActs = () => automationStudioProjectBuildOpenActs(project, calls);
  const admitStep = own.admitStep;
  /** A refusal's evidence with the whole build's open acts (header); any other evidence unchanged. */
  const buildWide = <E extends JsonObject>(evidence: E, act: unknown): E => {
    if (typeof evidence.code !== "string" || !LISTING.has(evidence.code)) return evidence;
    const ledger = owner(act);
    const named = new Set(list(evidence.actsToUndo).flatMap((entry) => (isObject(entry) && typeof entry.act === "string" ? [entry.act] : [])));
    // The owner's own acts as it chose to name them; every other brief's open act.
    const owners = new Map(snapshot().acts.map((entry) => [entry.act, entry.owner]));
    const acts = openActs().filter((entry) => entry.act !== act && (forBrief(owners.get(entry.act)!) !== ledger || named.has(entry.act))).map(({ ref: _ref, ...entry }) => entry);
    const instruction = evidence.code === "candidate.undo_unknown_act" ? WORDS.unknownAct(acts.length > 0) : evidence.code === "candidate.undo_already_done" ? WORDS.alreadyUndone(acts.length > 0) : evidence.instruction;
    // The whole build's acts no call can settle, apart from those to undo (header, t743).
    const unsettleable = invokeAuthoringExecutionSync(calls, { receiver: project, callback: project.unsatisfiable, args: [] }).map(({ owner: _owner, ...entry }) => entry);
    return { ...evidence, ...(instruction !== undefined ? { instruction } : {}), actsToUndo: acts as unknown as JsonValue, ...(unsettleable.length ? { actsUnsettleable: unsettleable as unknown as JsonValue } : {}) };
  };
  const calls: ReturnType<typeof automationStudioProjectBuildResetCalls> = {
    observed: (read) => {
      if (AuthoringExecutionScope.of(calls)) {
        const invocation = {};
        return invokeAuthoringExecutionCallback(calls, { receiver: calls, callback: calls.observedAndFlushed, args: [read, true, invocation] }, undefined, invocation);
      }
      project.observed(read);
      own.observed(read);
      // The reset sees the resource it is undoing. Update evidence for acts
      // already owned elsewhere, but never seed a different brief's baseline:
      // independent resources must have different opaque scopes. Only original
      // pre-effect project authority, adopted explicitly, can seed another owner.
      for (const brief of new Set(project.snapshot().acts.map((act) => act.owner))) {
        const ledger = project.forBrief(brief);
        if (ledger !== own) ledger.observed(read, false);
      }
    },
    async observedAndFlushed(read, baseline, invocation) {
      const original = AuthoringExecutionScope.of(invocation) ? invocation : calls;
      await invokeAuthoringExecutionCallback(original, { receiver: project, callback: project.observed, args: [read] });
      const observe = async (ledger: AutomationStudioSiteResetLedger, baseline: boolean) => {
        const child = {};
        await invokeAuthoringExecutionCallback(original, { receiver: ledger, callback: ledger.observedAndFlushed, args: [read, baseline, child] }, undefined, child);
      };
      await observe(own, baseline);
      const observed = invokeAuthoringExecutionSync(original, { receiver: project, callback: project.snapshot, args: [] });
      for (const brief of new Set(observed.acts.map(act => act.owner))) {
        const ledger = invokeAuthoringExecutionSync(original, { receiver: project, callback: project.forBrief, args: [brief] });
        if (ledger !== own) await observe(ledger, false);
      }
      const flushed = {};
      await invokeAuthoringExecutionCallback(original, { receiver: project, callback: project.flushed, args: [flushed] }, undefined, flushed);
    },
    createBaseline: (declared, reference) => invokeResetOwner(calls, { receiver: own, callback: own.createBaseline, args: [declared, reference] }),
    // A plan step's admission is the reset brief's own ledger's, as a creation's precondition is (t751).
    ...(typeof admitStep === "function" ? { admitStep: (...args: Parameters<typeof admitStep>) => invokeResetOwner(calls, { receiver: own, callback: admitStep, args }) } : {}),
    destinationReceipts: () => invokeAuthoringExecutionSync(calls, { receiver: own, callback: own.destinationReceipts, args: [] }),
    claim: (undoes, reference) => {
      const ledger = owner(undoes);
      const projectClaim = (claim: ReturnType<AutomationStudioSiteResetLedger["claim"]>) => claim.kind === "refused" ? { ...claim, evidence: buildWide(claim.evidence, undoes) } : claim;
      return AuthoringExecutionScope.of(calls)
        ? invokeAuthoringExecutionCallback(calls, { receiver: ledger, callback: ledger.claim, args: [undoes, reference] }).then(projectClaim)
        : projectClaim(ledger.claim(undoes, reference));
    },
    target: (act, declared) => {
      const ledger = owner(act);
      const projectTarget = (target: ReturnType<AutomationStudioSiteResetLedger["target"]>) => target.kind === "refused" ? { ...target, evidence: buildWide(target.evidence, act) } : target;
      return AuthoringExecutionScope.of(calls)
        ? invokeAuthoringExecutionCallback(calls, { receiver: ledger, callback: ledger.target, args: [act, declared] }).then(projectTarget)
        : projectTarget(ledger.target(act, declared));
    },
    explored: (call) => {
      const ledger = owner(call.undoes);
      return invokeResetOwner(calls, { receiver: ledger, callback: ledger.explored, args: [call] });
    },
    actOf: (callId) => invokeAuthoringExecutionSync(calls, { receiver: own, callback: own.actOf, args: [callId] }),
    placed: (act, place) => {
      const ledger = owner(act);
      invokeAuthoringExecutionSync(calls, { receiver: ledger, callback: ledger.placed, args: [act, place] });
    },
    undoSeen: (act, changedInPlace) => {
      const ledger = owner(act);
      invokeAuthoringExecutionSync(calls, { receiver: ledger, callback: ledger.undoSeen, args: [act, changedInPlace] });
    },
    noEffect: (act) => {
      const ledger = owner(act);
      invokeAuthoringExecutionSync(calls, { receiver: ledger, callback: ledger.noEffect, args: [act] });
    },
    standing: (act) => {
      if (ownerOf(act) === undefined) return undefined;
      const ledger = owner(act);
      return invokeAuthoringExecutionSync(calls, { receiver: ledger, callback: ledger.standing, args: [act] });
    },
    unreadOf: (act) => {
      if (ownerOf(act) === undefined) return undefined;
      const ledger = owner(act);
      return invokeAuthoringExecutionSync(calls, { receiver: ledger, callback: ledger.unreadOf, args: [act] });
    },
    openActs
  };
  for (const callback of [calls.observed, calls.observedAndFlushed, calls.createBaseline, calls.admitStep, calls.claim, calls.target, calls.explored]) if (callback) ExecutionCallbackPolicies.remember(calls, callback, "frame");
  for (const callback of [calls.destinationReceipts, calls.actOf, calls.placed, calls.undoSeen, calls.noEffect, calls.standing, calls.unreadOf, calls.openActs]) if (callback) ExecutionCallbackPolicies.remember(calls, callback, "pure");
  return calls;
}

/** A real observed owner enters before invocation; unobserved legacy calls retain their exact return timing. */
function invokeResetOwner<TReceiver, TArguments extends unknown[], TResult>(original: object, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): TResult | Promise<Awaited<TResult>> {
  return AuthoringExecutionScope.of(original) ? invokeAuthoringExecutionCallback(original, call) : call.callback.apply(call.receiver, call.args);
}

/** Every act of the build still to undo, in the order recorded, as its own ledger names it (with `settle` while open), and its ref. */
function automationStudioProjectBuildOpenActs(ledger: AutomationStudioSiteResetProjectLedger, original: object): Array<AutomationStudioSiteResetNamedAct & { ref: string }> {
  const acts = invokeAuthoringExecutionSync(original, { receiver: ledger, callback: ledger.snapshot, args: [] }).acts.filter((act) => act.inPlace);
  const owners = [...new Set(acts.map((act) => act.owner))];
  const named = new Map(owners.flatMap((owner) => {
    const brief = invokeAuthoringExecutionSync(original, { receiver: ledger, callback: ledger.forBrief, args: [owner] });
    return invokeAuthoringExecutionSync(original, { receiver: brief, callback: brief.inPlace, args: [] });
  }).map((act) => [act.act, act]));
  return acts.map((act) => ({ ...(named.get(act.act) ?? { act: act.act, did: act.did, ...(act.call !== undefined ? { call: act.call } : {}) }), ref: act.ref }));
}

function list(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
