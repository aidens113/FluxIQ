import type { PanelAssistantContext } from "../types.ts";

/**
 * The one line that tells the model where the person is: "On Flows › Cheapest
 * listings, step 5 selected." Built from the page, the selected thing's name
 * where the program side knows it, and what is selected inside it. Ids are
 * never shown in it; the model reaches them through the tools' context
 * arguments. Nothing on screen reads "The person has nothing open."
 */
export function panelAssistantContextLine(context: PanelAssistantContext, names: { project?: string; flow?: string }): string {
  const place: string[] = [];
  if (context.page) place.push(title(context.page));
  if (names.project && !names.flow) place.push(quoted(names.project));
  if (names.flow) place.push(quoted(names.flow));
  else if (context.flowId) place.push("a Flow");
  if (context.folder) place.push(`folder ${quoted(context.folder)}`);
  const selected: string[] = [];
  const steps = context.stepNumbers ?? [];
  if (steps.length === 1) selected.push(`step ${steps[0]} selected`);
  else if (steps.length > 1) selected.push(`steps ${steps.join(", ")} selected`);
  if (context.runId) selected.push("a run selected");
  if (context.datasetId) selected.push("a dataset selected");
  if (context.keyId) selected.push("a key selected");
  if (!place.length && !selected.length) return "The person has nothing open.";
  const where = place.length ? `On ${place.join(" › ")}` : "On the panel";
  return `${[where, ...selected].join(", ")}.`;
}

function title(page: string): string {
  const words = page.replace(/[-_/]+/gu, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function quoted(name: string): string {
  return `“${name}”`;
}
