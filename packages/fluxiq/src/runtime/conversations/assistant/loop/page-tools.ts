import type { AssistantToolEntry } from "@fluxiq/contracts/program-api-inputs";
import type { PanelAssistantContext } from "../types.ts";

/**
 * How many of the page's tools a request lists in full. A prompt choice, not a
 * limit on what the assistant can do: `find_tools` reaches every tool, and
 * `call_tool` calls any of them.
 */
const SHOWN = 15;

/**
 * The tools that fit where the person is: those whose page-filled inputs
 * (`contextArgs`) the selection fills, the most specific first, then those
 * whose words match the page's name. Every tool the registry declares stays
 * reachable through `find_tools`.
 */
export function panelAssistantPageTools(tools: readonly AssistantToolEntry[], context: PanelAssistantContext, find: (query: string) => readonly AssistantToolEntry[]): AssistantToolEntry[] {
  const filled = (tool: AssistantToolEntry): number => {
    const keys = Object.values(tool.contextArgs).filter((key) => key !== "page");
    if (!keys.length || !keys.every((key) => context[key] !== undefined)) return 0;
    return keys.length;
  };
  const fitting = tools
    .map((tool) => ({ tool, score: filled(tool) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || (a.tool.name < b.tool.name ? -1 : a.tool.name > b.tool.name ? 1 : 0))
    .map((entry) => entry.tool);
  const shown = new Map(fitting.map((tool) => [tool.name, tool]));
  if (context.page) for (const tool of find(context.page)) if (!shown.has(tool.name)) shown.set(tool.name, tool);
  return [...shown.values()].slice(0, SHOWN);
}
