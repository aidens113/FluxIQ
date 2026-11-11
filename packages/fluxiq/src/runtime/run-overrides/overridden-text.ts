import { FLUXNODE_CORE_TOOL_POLICIES, FLUXNODE_PROMPT_SECTIONS } from "@fluxiq/contracts/fluxnode";
import { automationStudioRunOverrides } from "./read.ts";

/**
 * Core's default words for one prompt section (`"prompt"`, by section id) or one tool's description
 * (`"tool"`, by tool id), as the current run's overrides frame says they read: the default with the
 * developer's text after it (joined by a blank line), or the developer's text in its place. With no
 * frame, no entry for the id, or an entry that may not apply, the default itself comes back, so a run
 * with no overrides is sent byte for byte what it always was.
 *
 * Defence in depth: the contract already refuses an entry for a locked section, a replace on an
 * append-only one, and an id it does not know (`resolveFluxNodeOverrides`), and a frame is built from
 * what it resolved. This ignores each of them again, so a frame that carried one anyway changes
 * nothing. A tool outside Core's own (a domain's) is append-only.
 */
export function automationStudioOverriddenText(kind: "prompt" | "tool", id: string, defaultText: string): string {
  const frame = automationStudioRunOverrides();
  const entry = (kind === "prompt" ? frame?.prompts : frame?.tools)?.[id];
  if (!entry || typeof entry.text !== "string" || entry.text.trim() === "") return defaultText;
  const policy = kind === "prompt" ? FLUXNODE_PROMPT_SECTIONS[id]?.policy : (FLUXNODE_CORE_TOOL_POLICIES[id] ?? "append_only");
  if (policy === undefined || policy === "locked") return defaultText;
  if (entry.mode === "replace" && policy === "open") return entry.text;
  if (entry.mode === "append") return `${defaultText}\n\n${entry.text}`;
  return defaultText;
}
