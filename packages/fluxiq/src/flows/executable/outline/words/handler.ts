// A handler's heading and where its body ends, from the words its node's own
// options use (`components/automation/control-flow/handler.ts`, `handler-end.ts`).
import type { AutomationStudioFlowNode } from "../../graph/index.ts";

const EVENT_WORDS: Readonly<Record<string, string>> = {
  start: "When this part starts:",
  before: "Before each try:",
  retry: "Before trying again:",
  fail: "When a step fails:",
  before_next: "After a step works:"
};

const DISPOSITION_WORDS: Readonly<Record<string, string>> = {
  resume: "Then carry on with the step",
  route: "Then go back to the saved point and carry on",
  resolve: "Then use these values instead of the step's",
  unhandled: "Then report that it did not work"
};

/** A handler's heading, or its body's last step, by the node's definition. */
export function outlineHandlerWords(node: AutomationStudioFlowNode, part: "heading" | "ending"): string {
  if (part === "heading") return EVENT_WORDS[String(node.parameterValues?.event ?? "fail")] ?? "When something goes wrong:";
  return DISPOSITION_WORDS[String(node.parameterValues?.disposition ?? "unhandled")] ?? "Then report that it did not work";
}
