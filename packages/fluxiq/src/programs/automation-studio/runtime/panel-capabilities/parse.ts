// Reading the vocabulary a browser sent, forgivingly.
//
// What arrives is JSON off a request, so it is checked rather than trusted. It
// is checked the way everything a model or a client produces is checked here:
// the fewest required fields that still mean something, a sensible fill for
// anything derivable, and a bad entry dropped rather than the whole list
// refused. A vocabulary that arrives one capability short still lets a person
// operate 37 things; a vocabulary refused outright leaves them with a chat
// window that does nothing, which is the state this whole module exists to end.
//
// Only `id` is required, because only `id` cannot be invented: it is what the
// model answers with and what the panel looks up. A title, a summary, a group
// and a control are filled from the id when they are missing.

import { AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES } from "../action-permissions/client/index.ts";
import type { AutomationStudioPanelCapability, AutomationStudioPanelCapabilityArgument } from "./capability.ts";

/** The longest vocabulary Core will carry. Well past the panel's 38; a backstop, not a budget. */
export const AUTOMATION_STUDIO_PANEL_CAPABILITY_MAX = 500;

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/u;

/**
 * The capabilities in `value` that can be understood, in the order they arrived.
 *
 * Anything that is not an object, or carries no usable `id`, is left out. A
 * duplicate id is left out too: the model picks by id, so two entries under one
 * name would make its answer ambiguous at the moment it is acted on.
 */
export function parseAutomationStudioPanelCapabilities(value: unknown): AutomationStudioPanelCapability[] {
  if (!Array.isArray(value)) return [];
  const parsed: AutomationStudioPanelCapability[] = [];
  const seen = new Set<string>();
  for (const entry of value.slice(0, AUTOMATION_STUDIO_PANEL_CAPABILITY_MAX)) {
    const capability = parseOne(entry);
    if (!capability || seen.has(capability.id)) continue;
    seen.add(capability.id);
    parsed.push(capability);
  }
  return parsed;
}

function parseOne(value: unknown): AutomationStudioPanelCapability | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = text(record.id);
  if (!id || !ID.test(id)) return null;
  const consequences = texts(record.consequences);
  return {
    id,
    // A title read from the id is worse than one the panel wrote and far better
    // than none: the model still has something to say the capability's name as.
    title: text(record.title) || id,
    summary: text(record.summary) || text(record.title) || id,
    group: text(record.group) || "Other",
    control: text(record.control) || "",
    arguments: parseArguments(record.arguments),
    phrases: texts(record.phrases),
    consequences,
    // Absent reads as `false`, and that is the safe direction: an extra
    // re-authorization prompt on something that did not need one is an
    // annoyance, while claiming a delete needs no PIN would skip Core's gate.
    // Core gates the act itself regardless, so this field guides what the model
    // says, never what the runtime permits.
    //
    // A capability whose consequences include a class Core gates re-authorizes
    // whatever the browser said: which classes stop for a person is Core's
    // decision (`action-permissions/destructive.ts`), not the sender's.
    reauthorizes: record.reauthorizes === true
      || consequences.some((consequence) => (AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES as readonly string[]).includes(consequence))
  };
}

/** Non-empty strings out of a list, trimmed; anything else is left out rather than refusing the entry. */
function texts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter((entry) => entry.length > 0).slice(0, 40);
}

function parseArguments(value: unknown): AutomationStudioPanelCapabilityArgument[] {
  if (!Array.isArray(value)) return [];
  const parsed: AutomationStudioPanelCapabilityArgument[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const name = text(record.name);
    if (!name) continue;
    parsed.push({ name, describe: text(record.describe) || name, required: record.required === true });
  }
  return parsed;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
