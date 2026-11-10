// The words each way out of a step is shown under.
import type { AutomationStudioFlowNode } from "../../graph/index.ts";
import { outlineValueWords } from "./value.ts";

/**
 * - a branch's other path: "Otherwise:";
 * - a switch's case: "When it is “a” or “b”:", its default "Otherwise:";
 * - a failure route: "If that does not work:", an error route "If it fails with <error>:";
 * - a loop's way out after it is done: "When there are no more:";
 * - the way on when it works, beside a failure route that does not rejoin it: "If it works:";
 * - any other way: "Then, by <port>:".
 */
export function outlineArmWords(node: AutomationStudioFlowNode, port: string): string {
  if (node.definitionId === "builtin.control.switch" && port === "case") return caseWords(node);
  if (port === "false" || port === "default") return "Otherwise:";
  if (port === "true") return "If so:";
  if (port === "failed" || port === "failure") return "If that does not work:";
  if (port.startsWith("error.")) return `If it fails with ${port.slice("error.".length).replace(/[-_.]+/gu, " ")}:`;
  if (port === "done") return "When there are no more:";
  if (port === "success" || port === "next" || port === "passed" || port === "recovered") return "If it works:";
  return `Then, by ${port.replace(/[-_.]+/gu, " ")}:`;
}

function caseWords(node: AutomationStudioFlowNode): string {
  const cases = node.parameterValues?.cases;
  const values = Array.isArray(cases) ? cases.flatMap((item) => (item && typeof item === "object" && !Array.isArray(item) && "value" in item ? [outlineValueWords(item.value)] : [])) : [];
  return values.length ? `When it is ${values.join(" or ")}:` : "When it matches:";
}
