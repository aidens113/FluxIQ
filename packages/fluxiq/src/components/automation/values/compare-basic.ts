import { numberValue } from "./number.ts";
import { stringValue } from "./string.ts";

export function compareBasic(left: unknown, right: unknown, operator: unknown): boolean {
  switch (stringValue(operator, "equals")) {
    case "not-equals": return left !== right;
    case "greater-than": return numberValue(left) > numberValue(right);
    case "greater-than-or-equal": return numberValue(left) >= numberValue(right);
    case "less-than": return numberValue(left) < numberValue(right);
    case "less-than-or-equal": return numberValue(left) <= numberValue(right);
    case "contains": return String(left ?? "").includes(String(right ?? ""));
    case "starts-with": return String(left ?? "").startsWith(String(right ?? ""));
    case "ends-with": return String(left ?? "").endsWith(String(right ?? ""));
    case "exists": return left !== undefined && left !== null && left !== "";
    case "equals":
    default: return left === right;
  }
}
