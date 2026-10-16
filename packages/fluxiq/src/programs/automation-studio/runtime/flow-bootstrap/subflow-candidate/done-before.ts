import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioSubflowDoneBefore, AutomationStudioSubflowScope } from "./contracts.ts";

// What a dependent builder's opening look carries of the run that prepared its
// entry (t638, t676): Core's own note beside the domain's evidence, under
// `entry`, and in it the lasting acts that run landed, under
// `predecessorsLeftOnSite`, each by its act id and what it did, a possible one
// marked `possibly` (`service/project-build/brief-ports.ts` writes it). The
// builder loop reads the act ids back off its opening result
// (`./builder-loop.ts`), so a completion that says a subflow before it did one
// of its parts can name only an act that run landed, never one of this
// build's acts from exploration, which every trial's reset undoes.
//
// One shape, written by the port and read by the loop, so the two never drift
// apart. It is Core's key, added beside the domain's evidence and never in its
// place, so a domain key of the same name is overwritten, never read.

/** One act the preparation run left on the site, as the opening note names it. */
export type AutomationStudioSubflowEntryLeftAct = { act: string; did: string; possibly?: true };

export const automationStudioSubflowEntryLeft = Object.freeze({
  /** The key Core's note sits under beside the opening look's evidence. */
  entryKey: "entry",
  /** The key, inside that note, that lists what the preparation run landed. */
  leftKey: "predecessorsLeftOnSite",

  /** The act ids the opening look's note says the preparation run landed; none when it says none or there is no note. */
  acts(evidence: JsonValue | undefined): string[] {
    if (!isJsonObject(evidence)) return [];
    const entry = evidence[automationStudioSubflowEntryLeft.entryKey];
    const left = isJsonObject(entry) ? entry[automationStudioSubflowEntryLeft.leftKey] : undefined;
    if (!Array.isArray(left)) return [];
    return left.flatMap((item) => (isJsonObject(item) && typeof item.act === "string" && item.act ? [item.act] : []));
  }
});

// A dependent builder's claim that a subflow before it did one of its parts
// (t676; `./builder-loop.ts`, header). On three A8 Lab runs a later builder
// ended blocked as "already done" before it submitted anything and Core took it
// on its word -- once for a part that only reads, which no subflow before it
// can ever do. The ending now names the part, and the act that did it where
// its entry note lists one (`doneBefore`), and Core admits it only when the
// part is this brief's and asks a lasting act, and the act is one the run that
// prepared its entry landed (the opening note above). Otherwise it is refused
// `subflow.done_before_refused`, in words that say why: a part that asks no
// lasting act gets its result only from this subflow's own steps; an act that
// is not the preparation run's is this build's act from exploration, which
// every trial's reset undoes. A completion claim is checked, never an act.

/** The code a claim that a subflow before this one did one of its parts is refused under (header, t676). */
const DONE_BEFORE_REFUSED = "subflow.done_before_refused";
const DONE_BEFORE_KEYS: ReadonlySet<string> = new Set(["part", "act"]);
/** The shape of that claim, as the brief's words and the refusals give it. */
const DONE_BEFORE_SHAPE = "{\"ended\": \"blocked\", \"reason\": \"<which part is already done, and which subflow did it>\", \"doneBefore\": {\"part\": \"<that part's id>\", \"act\": \"<the act id the entry note lists under predecessorsLeftOnSite for it>\"}}";

/** The claim as Core keeps it, or why it is refused. */
export type AutomationStudioSubflowDoneBeforeChecked = { ok: true; doneBefore: AutomationStudioSubflowDoneBefore } | { ok: false; code: string; instruction: string };

export const automationStudioSubflowDoneBefore = Object.freeze({
  /** The code a refused claim carries (header). */
  code: DONE_BEFORE_REFUSED,
  /** The ending's shape, as the brief's words and the refusals give it. */
  shape: DONE_BEFORE_SHAPE,
  /** The scope's parts that ask a lasting act: the only ones a subflow before it can have done. */
  acting(scope: AutomationStudioSubflowScope): AutomationStudioSubflowScope["parts"] {
    return acting(scope);
  },
  /** The claim checked against the scope and the acts the preparation run landed (header). */
  check(scope: AutomationStudioSubflowScope, ended: unknown, claim: JsonValue | undefined, landed: readonly string[]): AutomationStudioSubflowDoneBeforeChecked {
    return checked(scope, ended, claim, landed);
  }
});

/** The scope's parts that ask a lasting act (header, t676): the only ones a subflow before it can have done. */
function acting(scope: AutomationStudioSubflowScope): AutomationStudioSubflowScope["parts"] {
  return scope.parts.filter((part) => (part.lastingActs?.length ?? 0) > 0);
}

/**
 * A dependent builder's claim that a subflow before it did one of its parts
 * (header, t676), checked against the scope and the acts the run that prepared
 * its entry landed (`landed`, read off its opening look): the claim as Core
 * keeps it, or the refusal that says why not. `claim` is the ending's
 * `doneBefore`, absent when it named none.
 */
function checked(scope: AutomationStudioSubflowScope, ended: unknown, claim: JsonValue | undefined, landed: readonly string[]): AutomationStudioSubflowDoneBeforeChecked {
  const refused = (instruction: string) => ({ ok: false as const, code: DONE_BEFORE_REFUSED, instruction });
  const asking = acting(scope);
  if (!scope.predecessors.length) return refused("No subflow runs before this one, so none can have done one of its parts: build them from this page, and leave doneBefore out of an ending.");
  if (!asking.length) return refused(`${scope.parts.length === 1 ? "This brief's part asks for no lasting act" : "None of this brief's parts asks for a lasting act"}, so no subflow before this one can have done ${scope.parts.length === 1 ? "it" : "one of them"}: its result comes only from this subflow's own steps; build it from this page.`);
  if (ended !== "blocked") return refused(`A part a subflow before this one did ends the brief blocked, never partial: complete with exactly ${DONE_BEFORE_SHAPE}, or leave doneBefore out.`);
  const value = isJsonObject(claim) ? claim : undefined;
  if (!value || typeof value.part !== "string" || (value.act !== undefined && typeof value.act !== "string") || Object.keys(value).some((key) => !DONE_BEFORE_KEYS.has(key))) {
    const why = claim === undefined ? "Nothing of this brief has been submitted or tried, so it ends here only on a part a subflow before it did, named by its id" : "doneBefore names one part of this brief by its id, and the act that did it where the entry note lists one";
    return refused(`${why}: complete with exactly ${DONE_BEFORE_SHAPE}. Otherwise build this brief's parts from this page.`);
  }
  const named = value.part.trim();
  const part = scope.parts.find((candidate) => candidate.partId === named || candidate.text === named);
  if (!part) return refused(`"${named}" is no part of this brief, whose parts are ${names(scope.parts.map((candidate) => candidate.partId))}: name one of them, by its id, under doneBefore.part.`);
  if (!(part.lastingActs?.length ?? 0)) return refused(`The part "${part.partId}" asks for no lasting act, so no subflow before this one can have done it: its result comes only from this subflow's own steps; build it from this page.`);
  const act = typeof value.act === "string" ? value.act.trim() : "";
  if (value.act !== undefined && !landed.includes(act)) {
    const listed = landed.length ? `the acts it landed are ${names(landed)}` : "it landed none";
    return refused(`"${act}" is not an act the run that prepared this subflow's entry landed (${listed}, as the entry note lists them under predecessorsLeftOnSite): it is this build's act from exploration, which every trial's reset undoes; build the step that does it.`);
  }
  return { ok: true, doneBefore: { part: part.partId, ...(value.act !== undefined ? { act } : {}) } };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function names(values: readonly string[]): string {
  return values.map((value) => `"${value}"`).join(", ");
}
