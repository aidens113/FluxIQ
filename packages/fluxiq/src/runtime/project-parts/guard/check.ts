// Whether a saved part may run now. Pure: the page was read before this was asked.
//
// The order is the order a person can act on. What a request got wrong comes first,
// since it needs no page and changes nothing about the page: an unknown or missing
// input, a lasting class nobody asked for. Then the page: the exact site, then every
// start condition, where `unknown` fails as `false` does. Telling a person a part will
// do its acts again comes last, once nothing else stands between them and the run.
//
// Every message is plain words built from the card's own screened names and from the
// class phrases. No target, address, condition or page text reaches one.
import { AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES, type AutomationStudioAttemptActClass, type AutomationStudioSubflowCard } from "@fluxiq/contracts/automation";
import { automationStudioPartClassWords } from "./class-words.ts";
import type { AutomationStudioPartAsked, AutomationStudioPartGuardAnswer, AutomationStudioPartGuardInput, AutomationStudioPartPageRead } from "./types.ts";

const NOT_FOUND: AutomationStudioPartGuardAnswer = { refused: "part.not_found", message: "That saved part is not in this project's library." };

export function automationStudioPartGuard(input: AutomationStudioPartGuardInput): AutomationStudioPartGuardAnswer {
  const { card, snapshot, asked, page } = input;
  if (!card || !snapshot) return NOT_FOUND;
  return inputsRefusal(card, snapshot, asked)
    ?? classesRefusal(card, asked)
    ?? siteRefusal(card, page)
    ?? startRefusal(snapshot, page)
    ?? repeatRefusal(card, asked)
    ?? { ok: true };
}

type Card = NonNullable<AutomationStudioPartGuardInput["card"]>;
type Snapshot = NonNullable<AutomationStudioPartGuardInput["snapshot"]>;

function inputsRefusal(card: Card, snapshot: Snapshot, asked: AutomationStudioPartAsked): AutomationStudioPartGuardAnswer | undefined {
  const known = new Set(card.inputs.map((port) => port.id));
  if (Object.keys(asked.inputs).some((id) => !known.has(id))) return { refused: "part.input_unknown", message: "This part was given a value it does not take." };
  const defaulted = new Set((snapshot.graph.interface?.inputs ?? []).filter((port) => port.defaultValue !== undefined).map((port) => port.id));
  const missing = card.inputs.find((port) => port.required && !defaulted.has(port.id) && !given(asked.inputs[port.id]));
  return missing ? { refused: "part.input_missing", message: `This part needs a value for "${missing.name}".` } : undefined;
}

/** A required value is given when it holds something: nothing, and only spaces, are not. */
function given(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return typeof value !== "string" || value.trim().length > 0;
}

function classesRefusal(card: Pick<AutomationStudioSubflowCard, "lastingClasses">, asked: AutomationStudioPartAsked): AutomationStudioPartGuardAnswer | undefined {
  const permitted = new Set(asked.permittedConsequences ?? []);
  const unasked = AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES.filter((each) => card.lastingClasses.includes(each) && !permitted.has(each));
  if (!unasked.length) return undefined;
  return { refused: "part.act_not_allowed", message: `This part would ${automationStudioPartClassWords(unasked)}, and that was not asked for.`, classes: unasked };
}

function siteRefusal(card: Pick<AutomationStudioSubflowCard, "sites">, page: AutomationStudioPartPageRead): AutomationStudioPartGuardAnswer | undefined {
  if (!card.sites.length) return { refused: "part.wrong_site", message: "This part does not say which site it runs on, so it cannot be checked against the page." };
  if (page.origin === undefined) return { refused: "part.wrong_site", message: "The page's site could not be read, so this part was not run." };
  return card.sites.includes(page.origin) ? undefined : { refused: "part.wrong_site", message: "This part runs on another site than the one the page is on." };
}

function startRefusal(snapshot: Snapshot, page: AutomationStudioPartPageRead): AutomationStudioPartGuardAnswer | undefined {
  const { conditions, selfArrives } = snapshot.start;
  if (!conditions.length) return selfArrives === true ? undefined : { refused: "part.not_at_start", message: "This part has no way to check where it starts, so it was not run." };
  const held = conditions.every((_condition, index) => page.startFacts[index] === "true");
  return held ? undefined : { refused: "part.not_at_start", message: "The page is not where this part starts, so it was not run and nothing changed." };
}

function repeatRefusal(card: Pick<AutomationStudioSubflowCard, "lastingClasses">, asked: AutomationStudioPartAsked): AutomationStudioPartGuardAnswer | undefined {
  if (asked.caller !== "person" || !card.lastingClasses.length || asked.acknowledgedRepeat === true) return undefined;
  const classes: AutomationStudioAttemptActClass[] = [...card.lastingClasses];
  return { refused: "part.confirm_repeat", message: `Running this part will ${automationStudioPartClassWords(classes)} again, even if it was done before. Confirm to go ahead.`, classes };
}
