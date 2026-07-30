import { booleanValue } from "../shared/definition";

export function compareValues(left: unknown, right: unknown, operator: string): boolean {
  switch (operator) {
    case "not-equals": return left !== right;
    case "greater-than": return Number(left) > Number(right);
    case "less-than": return Number(left) < Number(right);
    case "contains": return String(left ?? "").includes(String(right ?? ""));
    case "equals":
    default: return left === right;
  }
}

export function everyBoolean(values: unknown[]): boolean {
  return values.every(booleanValue);
}

export function someBoolean(values: unknown[]): boolean {
  return values.some(booleanValue);
}
