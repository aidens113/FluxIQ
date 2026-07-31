import { numberValue } from "../shared/definition";
import type { AutomationNodeExecutionContext } from "../contracts";

export const optionalPrecisionOptions = [
  { label: "Do not round", value: "none" },
  { label: "Whole number", value: "0" },
  { label: "1 decimal place", value: "1" },
  { label: "2 decimal places", value: "2" },
  { label: "3 decimal places", value: "3" },
  { label: "4 decimal places", value: "4" },
  { label: "6 decimal places", value: "6" }
];

export const precisionOptions = optionalPrecisionOptions.filter((option) => option.value !== "none");

export function binaryNumbers(context: AutomationNodeExecutionContext): [number, number] {
  return [numberValue(context.inputs.left), numberValue(context.inputs.right)];
}

export function applyPrecision(value: number, precision: unknown): number {
  const places = Math.floor(numberValue(precision, -1));
  if (places < 0) return value;
  const multiplier = 10 ** Math.min(12, places);
  return Math.round(value * multiplier) / multiplier;
}
