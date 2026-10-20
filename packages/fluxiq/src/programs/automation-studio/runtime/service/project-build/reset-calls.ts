import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS, type AutomationStudioSiteResetCalls, type AutomationStudioSiteResetLedger, type AutomationStudioSiteResetNamedAct, type AutomationStudioSiteResetPlace, type AutomationStudioSiteResetProjectLedger, type AutomationStudioSiteResetRead } from "../../flow-bootstrap/site-reset/index.ts";

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

/** The refusals whose evidence lists the acts still to undo (header). */
const LISTING: ReadonlySet<string> = new Set(["candidate.undo_act_kept", "candidate.undo_unknown_act", "candidate.undo_already_done"]);

export function automationStudioProjectBuildResetCalls(project: AutomationStudioSiteResetProjectLedger, own: AutomationStudioSiteResetLedger): AutomationStudioSiteResetCalls & {
  observed(read: AutomationStudioSiteResetRead): void;
  actOf(callId: string): string | undefined;
  placed(act: string, place: AutomationStudioSiteResetPlace): void;
  undoSeen(act: string, changedInPlace: boolean): void;
  noEffect(act: string): void;
  /** Where one act of any brief stands, as its owner's ledger says (`ledger.ts`, `standing`); undefined for an id no brief gave. */
  standing(act: string): ReturnType<AutomationStudioSiteResetLedger["standing"]>;
  /** Every act of the build still to undo, in the order recorded, as its own ledger names it (with `settle` while open), and its ref. */
  openActs(): Array<AutomationStudioSiteResetNamedAct & { ref: string }>;
} {
  const ownerOf = (act: unknown): string | undefined => (typeof act === "string" ? project.snapshot().acts.find((entry) => entry.act === act)?.owner : undefined);
  const owner = (act: unknown): AutomationStudioSiteResetLedger => {
    const found = ownerOf(act);
    return found !== undefined ? project.forBrief(found) : own;
  };
  const openActs = () => automationStudioProjectBuildOpenActs(project);
  /** A refusal's evidence with the whole build's open acts (header); any other evidence unchanged. */
  const buildWide = <E extends JsonObject>(evidence: E, act: unknown): E => {
    if (typeof evidence.code !== "string" || !LISTING.has(evidence.code)) return evidence;
    const ledger = owner(act);
    const named = new Set(list(evidence.actsToUndo).flatMap((entry) => (isObject(entry) && typeof entry.act === "string" ? [entry.act] : [])));
    // The owner's own acts as it chose to name them; every other brief's open act.
    const owners = new Map(project.snapshot().acts.map((entry) => [entry.act, entry.owner]));
    const acts = openActs().filter((entry) => entry.act !== act && (project.forBrief(owners.get(entry.act)!) !== ledger || named.has(entry.act))).map(({ ref: _ref, ...entry }) => entry);
    const instruction = evidence.code === "candidate.undo_unknown_act" ? WORDS.unknownAct(acts.length > 0) : evidence.code === "candidate.undo_already_done" ? WORDS.alreadyUndone(acts.length > 0) : evidence.instruction;
    return { ...evidence, ...(instruction !== undefined ? { instruction } : {}), actsToUndo: acts as unknown as JsonValue };
  };
  return {
    observed: (read) => {
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
    createBaseline: (declared, reference) => own.createBaseline(declared, reference),
    destinationReceipts: () => own.destinationReceipts(),
    claim: (undoes, reference) => {
      const claim = owner(undoes).claim(undoes, reference);
      return claim.kind === "refused" ? { ...claim, evidence: buildWide(claim.evidence, undoes) } : claim;
    },
    target: (act, declared) => {
      const target = owner(act).target(act, declared);
      return target.kind === "refused" ? { ...target, evidence: buildWide(target.evidence, act) } : target;
    },
    explored: (call) => owner(call.undoes).explored(call),
    actOf: (callId) => own.actOf(callId),
    placed: (act, place) => owner(act).placed(act, place),
    undoSeen: (act, changedInPlace) => owner(act).undoSeen(act, changedInPlace),
    noEffect: (act) => owner(act).noEffect(act),
    standing: (act) => (ownerOf(act) === undefined ? undefined : owner(act).standing(act)),
    openActs
  };
}

/** Every act of the build still to undo, in the order recorded, as its own ledger names it (with `settle` while open), and its ref. */
function automationStudioProjectBuildOpenActs(ledger: AutomationStudioSiteResetProjectLedger): Array<AutomationStudioSiteResetNamedAct & { ref: string }> {
  const acts = ledger.snapshot().acts.filter((act) => act.inPlace);
  const owners = [...new Set(acts.map((act) => act.owner))];
  const named = new Map(owners.flatMap((owner) => ledger.forBrief(owner).inPlace()).map((act) => [act.act, act]));
  return acts.map((act) => ({ ...(named.get(act.act) ?? { act: act.act, did: act.did, ...(act.call !== undefined ? { call: act.call } : {}) }), ref: act.ref }));
}

function list(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
