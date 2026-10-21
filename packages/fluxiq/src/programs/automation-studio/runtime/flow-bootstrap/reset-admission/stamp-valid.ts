// Whether a value is a reset witness stamp exactly (t751, R3): what a plan
// node may carry of its step's witness (`./witness.ts`). Strict, since a
// stamp is Core-derived and a model-written one must be refused: a plain
// object with own data properties only, `via` one of the five forms, `ref`
// on a destination or retained control and `act` only on a repeat, each in the form Core
// mints (`destination-N` / `control-N`, positive one-to-three digit refs; `act-N`, at most 9999 acts),
// and no other key. Pure.
// A bare control remains readable for standalone compatibility; project admission requires its receipt to resolve.

import type { AutomationStudioSiteResetWitnessStamp } from "./witness.ts";

const KEYS: Readonly<Record<AutomationStudioSiteResetWitnessStamp["via"], readonly string[]>> = {
  destination: ["ref"],
  own_list: [],
  control: ["ref"],
  repeats: ["act"],
  legacy: []
};
const REF = /^destination-[1-9]\d{0,2}$/u;
const ACT = /^act-[1-9]\d{0,3}$/u;
const CONTROL = /^control-[1-9]\d{0,2}$/u;

/** Whether `value` is a reset witness stamp exactly (header). */
export function automationStudioSiteResetWitnessStampValid(value: unknown): value is AutomationStudioSiteResetWitnessStamp {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => !("value" in descriptor))) return false;
  const via = descriptors.via?.value;
  if (typeof via !== "string" || !Object.hasOwn(KEYS, via)) return false;
  const extra = KEYS[via as AutomationStudioSiteResetWitnessStamp["via"]];
  const keys = Reflect.ownKeys(value);
  if ((keys.length !== extra.length + 1 && !(via === "control" && keys.length === 1)) || !keys.every((key) => key === "via" || (typeof key === "string" && extra.includes(key)))) return false;
  if (via === "destination") return typeof descriptors.ref?.value === "string" && REF.test(descriptors.ref.value);
  if (via === "repeats") return typeof descriptors.act?.value === "string" && ACT.test(descriptors.act.value);
  if (via === "control") return descriptors.ref === undefined || (typeof descriptors.ref.value === "string" && CONTROL.test(descriptors.ref.value));
  return true;
}
