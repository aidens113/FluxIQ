// The words a control step opens its block with (rules 2 and 3): "Only if
// ...:", "Depending on ...:", "For each item in ...:", "Repeat ...:". What is
// tested or walked is named by the step's own plain label, else by the node
// that feeds it its value, else by the input or field it is bound to.
import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../graph/index.ts";
import { outlineDataWords } from "./data.ts";
import { outlinePartStepOf } from "./part-step.ts";
import { outlineValueWords } from "./value.ts";

/** The opening words of a branch, switch or loop; `fedBy` is the node that gives it its value, when one does. */
export function outlineControlWords(node: AutomationStudioFlowNode, fedBy: AutomationStudioFlowNode | undefined): string {
  const params = node.parameterValues ?? {};
  const own = outlinePartStepOf(node).plainLabel;
  const fed = fedBy ? outlinePartStepOf(fedBy).plainLabel ?? outlineDataWords(fedBy) : undefined;
  switch (node.definitionId) {
    case "builtin.control.branch":
      return `Only if ${lowerFirst(own ?? fed ?? bound(params.condition) ?? "the check passes")}:`;
    case "builtin.control.switch":
      return `Depending on ${lowerFirst(own ?? fed ?? bound(params.value) ?? "the value")}:`;
    case "builtin.control.for-each": {
      const upTo = params.stopAfter === undefined || params.stopAfter === null ? "" : `, up to ${outlineValueWords(params.stopAfter)}`;
      return `For each item in ${bound(params.items) ?? (fed ? `“${fed}”` : "the list")}${upTo}:`;
    }
    case "builtin.control.loop":
      return `Repeat while ${lowerFirst(own ?? fed ?? bound(params.condition) ?? "the check passes")}:`;
    default:
      return `Repeat, at most ${typeof params.most === "number" ? params.most : outlineValueWords(params.most ?? 50)} times:`;
  }
}

/** A bound value's words, or nothing for a value that is not bound. */
function bound(value: JsonValue | undefined): string | undefined {
  return value && typeof value === "object" && !Array.isArray(value) && "$state" in value ? outlineValueWords(value) : undefined;
}

/** "Check the box" reads "check the box" after "Only if"; "URL ready" keeps its capitals. */
function lowerFirst(words: string): string {
  return /^\p{Lu}\p{Ll}/u.test(words) ? `${words[0]!.toLowerCase()}${words.slice(1)}` : words;
}
