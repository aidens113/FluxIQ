import { booleanValue, compareBasic } from "../shared/definition";

export function compareValues(left: unknown, right: unknown, operator: string): boolean {
  return compareBasic(left, right, operator);
}

export function everyBoolean(values: unknown[]): boolean {
  return values.every(booleanValue);
}

export function someBoolean(values: unknown[]): boolean {
  return values.some(booleanValue);
}
