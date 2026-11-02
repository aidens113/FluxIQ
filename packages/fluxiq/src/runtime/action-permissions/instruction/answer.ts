import type { AutomationStudioActionConsequence } from "../../../components/automation/action-effect/consequences/index.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../../components/automation/action-effect/consequences/index.ts";
import { permissionConstants } from "./constants.ts";
const { NOTHING_LASTING } = permissionConstants;

export /** One act's answer: its classes in Core's order, `[]` for nothing lasting, `null` for no readable answer. */
function actAnswer(value: unknown): AutomationStudioActionConsequence[] | null {
  const words = Array.isArray(value) ? value.filter((word): word is string => typeof word === "string").map((word) => word.trim().toLowerCase()) : typeof value === "string" ? [value.trim().toLowerCase()] : [];
  const classes = AUTOMATION_STUDIO_ACTION_CONSEQUENCES.filter((consequence) => words.includes(consequence));
  if (classes.length) return classes;
  return words.includes(NOTHING_LASTING) || (Array.isArray(value) && value.length === 0) ? [] : null;
}
