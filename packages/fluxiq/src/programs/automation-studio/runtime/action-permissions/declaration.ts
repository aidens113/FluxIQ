// What a domain says about an action before it takes it, and what Core answers.
//
// This is the whole seam, and it points one way. Core hands the domain a check
// with every action it asks the domain to run. The domain, which alone knows
// what the action would do, calls the check before doing anything lasting,
// saying which consequences it would have and how a person would recognise the
// thing it acts on. Core -- which alone holds what the person allowed --
// answers. A domain never learns the permission set, so it cannot decide for
// itself that something is fine; Core never learns what a control is, so it
// cannot decide that something is dangerous.
//
// The domain asks only when the action has a consequence. Looking, opening and
// choosing are not asked about at all; see `consequences.ts`.
//
// **An empty list is a declaration, not the absence of one.** A domain whose
// action commits -- a press, where the same control applies a filter on one
// page and places an order on the next -- says `[]` when it would cause
// nothing lasting, and Core reads it, records it and permits it. That is the
// difference between "it said it causes nothing" and "it said nothing", and
// only the first can be published with the step. Until 2026-09-22 the domain
// short-circuited the empty case and never called the check, so every press in
// every measured build was invisible here and the Lab had to deduce what a
// step had declared from the absence of a refusal.
//
// **An action that only observes has no lasting consequence, whatever it says
// it has.** `effect` is the one fact on a declaration that is not a claim about
// the world: it is what the domain already knows about its own action from the
// registry it built the action out of -- this node reads the page, that one
// acts on it. A reading action's consequence classes are therefore not a
// statement Core can act on, and Core does not: it permits the action, records
// what was named under `disregarded`, and asks nobody anything (`gate.ts`).
//
// This is not a nicety. On 2026-09-23 a build was asked to "collect every
// product on the first page ... into a table with columns name, price, rating
// and url", ran the list-reading node, and declared `create_new` for it --
// reasoning, not unreasonably, that a dataset is something new. Nothing
// downstream could contradict it: the web domain's own safety table calls
// `web.dom.extract_list` safe and Core's gate never saw that word, so the
// build stopped and asked a person for permission to read a page
// (`run-mueozmp8-348a2057`, 21 provider calls, no Flow). The person's
// instruction is the authority, and reading the list *is* the instruction.
// A run-scoped dataset holding what the page already showed is the product's
// own output, not a lasting change to anything the person owns.
//
// Absent means `mutate`, so a caller that says nothing is gated exactly as it
// was: this widens nothing by default, and only an action whose domain states
// it reads is taken out of the gate's reach.

import { isAutomationStudioActionConsequence, type AutomationStudioActionConsequence } from "./consequences.ts";

/**
 * Whether taking the action changes anything, in the same two words the node
 * registry, the harness options and the evidence loop already use.
 *
 * `observe` is a promise the domain makes about its own action -- it reads,
 * waits or asserts, and the page and everything behind it is as it was
 * afterwards. `mutate` is everything else, and is what an unstated effect
 * means.
 */
export type AutomationStudioActionEffect = "observe" | "mutate";

/**
 * One action, as the domain describes it before taking it.
 *
 * `control.name` is how a person would recognise the thing acted on -- the
 * words on it, as they appeared in evidence the model has already been shown.
 * It is never a locator, a fragment of markup or an internal id: Core carries
 * it to a person, and a name it cannot find in evidence already shown is
 * withheld rather than carried (see `gate.ts`). `control.kind` is one plain
 * word or two for what sort of thing it is, in the domain's own vocabulary.
 * `verb` is what the action does to it, as plainly: "press", "submit".
 *
 * `effect` is what the domain knows about the action itself rather than about
 * this page: `observe` for one that reads, waits or asserts, `mutate` for one
 * that acts. Absent is `mutate`, which gates as before.
 */
export type AutomationStudioActionDeclaration = {
  consequences: readonly AutomationStudioActionConsequence[];
  control: { name: string; kind?: string };
  verb: string;
  effect?: AutomationStudioActionEffect;
};

/**
 * Core's answer. `permitted: false` always means: do not take the action.
 *
 * `requestId` names the request that was raised for the person, and is `null`
 * only where there is nobody to ask -- a caller that ran the domain's action
 * without a run behind it. Either way the action does not happen.
 */
export type AutomationStudioActionPermissionVerdict =
  | { permitted: true }
  | { permitted: false; missing: readonly AutomationStudioActionConsequence[]; requestId: string | null };

/**
 * The check a domain calls before an action with a lasting consequence.
 *
 * Awaited immediately before acting: the first action in a build that has a
 * lasting consequence may make Core read the person's instruction for what it
 * already asks for (`instructed.ts`), once. It rejects with
 * `AutomationStudioActionDeclarationError` when the declaration itself is
 * malformed, which fails the action loudly: an action Core could not read is
 * an action Core did not permit.
 */
export type AutomationStudioActionPermissionCheck = (declaration: AutomationStudioActionDeclaration) => Promise<AutomationStudioActionPermissionVerdict>;

/** A declaration Core could not read. The action must not proceed. */
export class AutomationStudioActionDeclarationError extends Error {
  readonly name = "AutomationStudioActionDeclarationError";

  constructor(readonly code: string) {
    super(`Automation Studio action declaration is invalid (${code}).`);
  }
}

/** A declaration after Core has read it: consequences deduplicated, text trimmed. */
export type AutomationStudioReadActionDeclaration = {
  consequences: AutomationStudioActionConsequence[];
  controlName: string;
  controlKind: string | null;
  verb: string;
  /** Stated or, where the domain said nothing, `mutate`. */
  effect: AutomationStudioActionEffect;
};

const VERB = /^[a-z]{2,20}(?: [a-z]{2,20})?$/;
const KIND = /^[a-z][a-z -]{0,31}$/;
const MAX_NAME_INPUT = 2_000;

/**
 * Read a declaration, or throw. Structure is checked here and nowhere else;
 * whether the name may be carried to a person is the gate's question, because
 * only the gate knows what has already been shown.
 */
export function readAutomationStudioActionDeclaration(value: unknown): AutomationStudioReadActionDeclaration {
  if (!isRecord(value) || !hasOnlyFields(value, ["consequences", "control", "verb", "effect"])) throw new AutomationStudioActionDeclarationError("declaration_shape");
  const consequences = value.consequences;
  if (!Array.isArray(consequences) || consequences.length > 10) throw new AutomationStudioActionDeclarationError("consequences_missing");
  if (!consequences.every(isAutomationStudioActionConsequence)) throw new AutomationStudioActionDeclarationError("consequence_unrecognised");
  const control = value.control;
  if (!isRecord(control) || !hasOnlyFields(control, ["name", "kind"])) throw new AutomationStudioActionDeclarationError("control_shape");
  if (typeof control.name !== "string" || !control.name.trim() || control.name.length > MAX_NAME_INPUT) throw new AutomationStudioActionDeclarationError("control_name_invalid");
  if (control.kind !== undefined && (typeof control.kind !== "string" || !KIND.test(control.kind))) throw new AutomationStudioActionDeclarationError("control_kind_invalid");
  if (typeof value.verb !== "string" || !VERB.test(value.verb)) throw new AutomationStudioActionDeclarationError("verb_invalid");
  // Fail closed on a word Core does not know rather than reading it as
  // `mutate`: a domain that meant to say something about its action and
  // misspelled it must not be answered as though it had said nothing.
  if (value.effect !== undefined && value.effect !== "observe" && value.effect !== "mutate") throw new AutomationStudioActionDeclarationError("effect_invalid");
  return {
    consequences: [...new Set(consequences as AutomationStudioActionConsequence[])],
    controlName: control.name.replace(/\s+/gu, " ").trim(),
    controlKind: typeof control.kind === "string" ? control.kind : null,
    verb: value.verb,
    effect: value.effect ?? "mutate"
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyFields(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
