import type { AutomationStudioReadActionDeclaration } from "../../../flows/executable/permissions/index.ts";
import { isRecord } from "./is-record.ts";
import { hasOnlyFields } from "./has-only-fields.ts";
import { AutomationStudioActionDeclarationError } from "./error.ts";
import { isAutomationStudioActionConsequence } from "../../../components/automation/action-effect/consequences/index.ts";
import type { AutomationStudioResolvedActionEffect } from "../../../components/automation/action-effect/index.ts";
import { readAutomationStudioResolvedActionEffect } from "../../../components/automation/action-effect/index.ts";
import type { AutomationStudioActionConsequence } from "../../../components/automation/action-effect/consequences/index.ts";
import { permissionConstants } from "./constants.ts";
const { VERB, KIND, MAX_NAME_INPUT, PLACE_TOKEN } = permissionConstants;

/**
 * Read a declaration, or throw. Structure is checked here and nowhere else;
 * whether the name may be carried to a person is the gate's question, because
 * only the gate knows what has already been shown.
 */
export function readAutomationStudioActionDeclaration(value: unknown): AutomationStudioReadActionDeclaration {
  if (!isRecord(value) || !hasOnlyFields(value, ["consequences", "control", "verb", "effect", "actionEffect"])) throw new AutomationStudioActionDeclarationError("declaration_shape");
  const consequences = value.consequences;
  if (!Array.isArray(consequences) || consequences.length > 10) throw new AutomationStudioActionDeclarationError("consequences_missing");
  if (!consequences.every(isAutomationStudioActionConsequence)) throw new AutomationStudioActionDeclarationError("consequence_unrecognised");
  const control = value.control;
  if (!isRecord(control) || !hasOnlyFields(control, ["name", "kind", "item", "dialog", "subject", "page", "scope", "resource", "place", "state"])) throw new AutomationStudioActionDeclarationError("control_shape");
  if (typeof control.name !== "string" || !control.name.trim() || control.name.length > MAX_NAME_INPUT) throw new AutomationStudioActionDeclarationError("control_name_invalid");
  if (control.kind !== undefined && (typeof control.kind !== "string" || !KIND.test(control.kind))) throw new AutomationStudioActionDeclarationError("control_kind_invalid");
  for (const key of ["item", "dialog", "subject", "page", "scope", "resource", "place", "state"] as const) {
    const token = control[key];
    if (token !== undefined && (typeof token !== "string" || !PLACE_TOKEN.test(token))) throw new AutomationStudioActionDeclarationError("control_place_invalid");
  }
  if (typeof value.verb !== "string" || !VERB.test(value.verb)) throw new AutomationStudioActionDeclarationError("verb_invalid");
  // Fail closed on a word Core does not know rather than reading it as
  // `mutate`: a domain that meant to say something about its action and
  // misspelled it must not be answered as though it had said nothing.
  if (value.effect !== undefined && value.effect !== "observe" && value.effect !== "mutate") throw new AutomationStudioActionDeclarationError("effect_invalid");
  let actionEffect: AutomationStudioResolvedActionEffect | undefined;
  if (value.actionEffect !== undefined) {
    try {
      actionEffect = readAutomationStudioResolvedActionEffect(value.actionEffect);
    } catch {
      throw new AutomationStudioActionDeclarationError("action_effect_invalid");
    }
  }
  const declaration: AutomationStudioReadActionDeclaration = {
    consequences: [...new Set(consequences as AutomationStudioActionConsequence[])],
    controlName: control.name.replace(/\s+/gu, " ").trim(),
    controlKind: typeof control.kind === "string" ? control.kind : null,
    controlItem: typeof control.item === "string" ? control.item : null,
    controlDialog: typeof control.dialog === "string" ? control.dialog : null,
    controlSubject: typeof control.subject === "string" ? control.subject : null,
    controlPage: typeof control.page === "string" ? control.page : null,
    controlScope: typeof control.scope === "string" ? control.scope : null,
    controlResource: typeof control.resource === "string" ? control.resource : null,
    controlPlace: typeof control.place === "string" ? control.place : null,
    controlState: typeof control.state === "string" ? control.state : null,
    verb: value.verb,
    effect: value.effect ?? "mutate"
  };
  if (actionEffect) declaration.actionEffect = actionEffect;
  return declaration;
}
