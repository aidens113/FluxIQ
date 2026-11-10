import type { PanelContext } from "./types";
import type { PanelContextAction } from "./action";

export const INITIAL_PANEL_CONTEXT: PanelContext = { page: "home" };

/**
 * The next context. Pure: equal input gives an equal result, and an action that
 * changes nothing returns the same object so React does not render again.
 * The project is the person's own choice and survives page changes; everything a
 * page picked belongs to that page and goes when the page publishes again.
 */
export function panelContextReducer(state: PanelContext, action: PanelContextAction): PanelContext {
  if (action.type === "project") {
    if (state.projectId === action.projectId) return state;
    return { page: state.page, ...(action.projectId === undefined ? {} : { projectId: action.projectId }) };
  }
  const next: PanelContext = {
    page: action.page,
    ...(state.projectId === undefined ? {} : { projectId: state.projectId }),
    ...definedOnly(action.selection)
  };
  return sameContext(state, next) ? state : next;
}

function definedOnly(selection: object | undefined): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(selection ?? {})) {
    if (value === undefined || key === "page") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    kept[key] = value;
  }
  return kept;
}

function sameContext(a: PanelContext, b: PanelContext): boolean {
  return canonical(a) === canonical(b);
}

function canonical(context: PanelContext): string {
  return JSON.stringify(Object.entries(context).sort(([x], [y]) => (x < y ? -1 : 1)));
}
