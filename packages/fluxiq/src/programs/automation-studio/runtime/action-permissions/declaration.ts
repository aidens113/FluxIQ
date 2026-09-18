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

import { isAutomationStudioActionConsequence, type AutomationStudioActionConsequence } from "./consequences.ts";

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
 */
export type AutomationStudioActionDeclaration = {
  consequences: readonly AutomationStudioActionConsequence[];
  control: { name: string; kind?: string };
  verb: string;
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
  if (!isRecord(value) || !hasOnlyFields(value, ["consequences", "control", "verb"])) throw new AutomationStudioActionDeclarationError("declaration_shape");
  const consequences = value.consequences;
  if (!Array.isArray(consequences) || !consequences.length || consequences.length > 10) throw new AutomationStudioActionDeclarationError("consequences_missing");
  if (!consequences.every(isAutomationStudioActionConsequence)) throw new AutomationStudioActionDeclarationError("consequence_unrecognised");
  const control = value.control;
  if (!isRecord(control) || !hasOnlyFields(control, ["name", "kind"])) throw new AutomationStudioActionDeclarationError("control_shape");
  if (typeof control.name !== "string" || !control.name.trim() || control.name.length > MAX_NAME_INPUT) throw new AutomationStudioActionDeclarationError("control_name_invalid");
  if (control.kind !== undefined && (typeof control.kind !== "string" || !KIND.test(control.kind))) throw new AutomationStudioActionDeclarationError("control_kind_invalid");
  if (typeof value.verb !== "string" || !VERB.test(value.verb)) throw new AutomationStudioActionDeclarationError("verb_invalid");
  return {
    consequences: [...new Set(consequences as AutomationStudioActionConsequence[])],
    controlName: control.name.replace(/\s+/gu, " ").trim(),
    controlKind: typeof control.kind === "string" ? control.kind : null,
    verb: value.verb
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyFields(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
