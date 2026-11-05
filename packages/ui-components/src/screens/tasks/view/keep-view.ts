import { createElement } from "../../../dom/index.ts";
import { saveThis } from "../../library/view/index.ts";
import type { TasksPort } from "../port.ts";

/**
 * "Save this" for one task's Flow, in plain words: what would be kept, and the button. Nothing where the port cannot
 * save. A refusal reads in Core's own sentence (`saveThis`).
 */
export function keepView(port: TasksPort, query: { projectId: string; flowId: string; subflowId: string; name: string }): HTMLElement | undefined {
  const keepSubflow = port.keepSubflow;
  if (keepSubflow === undefined) return undefined;
  const control = saveThis({ save: (asked) => keepSubflow.call(port, asked) }, { projectId: query.projectId, flowId: query.flowId, subflowId: query.subflowId }, "small-button tasks-button");
  if (control === undefined) return undefined;
  return createElement("div", { className: "task-keep" }, [createElement("p", { className: "tasks-line", text: `Keep “${query.name}” in your Library, so other automations can use it.` }), control]);
}
