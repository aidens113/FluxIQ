/**
 * What a panel page publishes about where the person is and what they have
 * selected. A tool's `contextArgs` names, per input field, the key that fills
 * it, so "rename this step" needs no ids from the model.
 */
export const PANEL_CONTEXT_KEYS = Object.freeze(["page", "projectId", "flowId", "stepNumbers", "nodeIds", "runId", "datasetId", "keyId", "folder"] as const);

export type PanelContextKey = (typeof PANEL_CONTEXT_KEYS)[number];

/** Whether `value` is one of `PANEL_CONTEXT_KEYS`. */
export function isPanelContextKey(value: unknown): value is PanelContextKey {
  return typeof value === "string" && (PANEL_CONTEXT_KEYS as readonly string[]).includes(value);
}
