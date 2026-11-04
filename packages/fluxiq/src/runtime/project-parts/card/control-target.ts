import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { isAutomationNodeParameterStateBinding } from "../../../components/automation/index.ts";
import { PART_DEFAULT_CONTROL_KEYS } from "./parameter-keys.ts";
import type { AutomationStudioPartStep } from "./steps.ts";

/**
 * The durable target a step's parameters name, in the host's own form, carried and never
 * read: Core's own `target` parameter when it holds the whole of one, and otherwise the
 * parameters the domain says name the control, together, under the names it gave them.
 * A parameter bound to a value names nothing yet. A lone string is a handle one model turn
 * could read, or an address with nothing to tell the control by, and is no durable target.
 */
export function partControlTargetOf(step: AutomationStudioPartStep, controlKeys: ReadonlySet<string>): JsonObject | undefined {
  const named = [...controlKeys].flatMap((key): [string, JsonValue][] => {
    const value = step.params[key];
    return namesAControl(value) ? [[key, value]] : [];
  });
  if (!named.some(([, value]) => typeof value === "object")) return undefined;
  const whole = named.find(([key, value]) => PART_DEFAULT_CONTROL_KEYS.includes(key) && typeof value === "object");
  return whole ? whole[1] as JsonObject : Object.fromEntries(named);
}

function namesAControl(value: JsonValue | undefined): value is JsonValue {
  if (isAutomationNodeParameterStateBinding(value)) return false;
  if (typeof value === "string") return value.length > 0;
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length > 0;
}
