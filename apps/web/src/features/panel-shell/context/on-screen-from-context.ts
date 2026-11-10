import type { ChatOnScreen } from "@fluxiq/ui-components";
import type { PanelContext } from "./types";

/**
 * What the dock sends with every message: the page and the selection, plus the
 * Flow and run the chat already understands by their own names. Only what the
 * person has actually picked is sent; nothing is guessed.
 */
export function onScreenFromContext(context: PanelContext): ChatOnScreen {
  const { page, ...selection } = context;
  return {
    page,
    selection,
    ...(context.flowId === undefined ? {} : { flowId: context.flowId }),
    ...(context.runId === undefined ? {} : { runId: context.runId })
  };
}
