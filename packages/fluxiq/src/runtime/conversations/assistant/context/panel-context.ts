import type { PanelAssistantContext } from "../types.ts";

const ID = /^[A-Za-z0-9._:-]{1,200}$/u;
const WORD = /^[\p{L}\p{N} ._/-]{1,80}$/u;

/**
 * The page and selection a message carries (`ChatSend.onScreen`: `page`,
 * `selection`, and the older `flowId`/`runId`), read strictly: an id that is
 * not an id, a step that is not a whole number, or a field that is not the
 * right type is left out rather than guessed at. The selection's own fields
 * win over the older top-level ones.
 */
export function panelAssistantContextOf(onScreen: unknown): PanelAssistantContext {
  const screen = record(onScreen);
  if (!screen) return {};
  const selection = record(screen.selection) ?? {};
  const context: PanelAssistantContext = {};
  const page = word(screen.page);
  if (page !== undefined) context.page = page;
  const projectId = id(selection.projectId);
  if (projectId !== undefined) context.projectId = projectId;
  const flowId = id(selection.flowId) ?? id(screen.flowId);
  if (flowId !== undefined) context.flowId = flowId;
  const runId = id(selection.runId) ?? id(screen.runId);
  if (runId !== undefined) context.runId = runId;
  const datasetId = id(selection.datasetId);
  if (datasetId !== undefined) context.datasetId = datasetId;
  const keyId = id(selection.keyId);
  if (keyId !== undefined) context.keyId = keyId;
  const folder = word(selection.folder);
  if (folder !== undefined) context.folder = folder;
  const steps = Array.isArray(selection.stepNumbers) ? selection.stepNumbers.filter((step): step is number => Number.isInteger(step) && step >= 1) : [];
  if (steps.length) context.stepNumbers = steps;
  const nodes = Array.isArray(selection.nodeIds) ? selection.nodeIds.map(id).filter((node): node is string => node !== undefined) : [];
  if (nodes.length) context.nodeIds = nodes;
  return context;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function id(value: unknown): string | undefined {
  return typeof value === "string" && ID.test(value.trim()) ? value.trim() : undefined;
}

function word(value: unknown): string | undefined {
  return typeof value === "string" && WORD.test(value.trim()) ? value.trim() : undefined;
}
