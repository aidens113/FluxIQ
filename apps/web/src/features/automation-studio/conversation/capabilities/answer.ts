// "What can you do?", answered from the registry.
//
// The answer is generated, never written. A hardcoded list is wrong within a
// week of the next capability landing, and worse than wrong: it tells a person
// the panel cannot do something it can, so they go and find the button and
// stop trusting the chat window. Everything below reads `panelCapabilities()`,
// so a capability added to the catalog is in the answer with no edit here.
//
// Two shapes, because there are two readers. `describePanelCapabilities()` is
// prose for the person who asked. `panelCapabilityVocabulary()` is the same
// registry as the list a model chooses an id from -- which is the point: the
// model's vocabulary and the panel's controls are one declaration, so the model
// cannot be told about a capability that does not exist, or left ignorant of
// one that does.

import { panelCapabilitiesByGroup, panelCapabilities } from "./registry";
import { panelCapabilityAsksFirst, type PanelCapability } from "./contract";

/** One capability as whoever is choosing between them needs to see it. */
export type PanelCapabilityDescription = {
  id: string;
  title: string;
  summary: string;
  group: string;
  /** Where the same thing is on screen, for a person who would rather press it. */
  control: string;
  arguments: Array<{ name: string; describe: string; required: boolean }>;
  /** True only for deleting and moving money: it re-authorizes, it does not ask permission. */
  reauthorizes: boolean;
};

function describe(capability: PanelCapability): PanelCapabilityDescription {
  return {
    id: capability.id,
    title: capability.title,
    summary: capability.summary,
    group: capability.group,
    control: capability.control.view ? `${capability.control.label} (${capability.control.view})` : capability.control.label,
    arguments: capability.arguments.map((argument) => ({
      name: argument.name,
      describe: argument.describe,
      required: argument.required
    })),
    reauthorizes: panelCapabilityAsksFirst(capability)
  };
}

/**
 * Every capability, in the form a model picks an id out of.
 *
 * This is the whole of what the model may be told it can do. Nothing is added
 * beside it and nothing is held back from it, so "what can you do?" and "what
 * will it actually run" have one answer.
 */
export function panelCapabilityVocabulary(): PanelCapabilityDescription[] {
  return panelCapabilities().map(describe);
}

/**
 * The same answer as prose, grouped the way the catalog groups it.
 *
 * Written to be read aloud in a chat window: a heading, then one line per
 * capability. The count comes first because the honest answer to "what can you
 * do" starts with how much there is.
 */
export function describePanelCapabilities(): string {
  const grouped = panelCapabilitiesByGroup();
  const total = panelCapabilities().length;
  const lines: string[] = [
    `I can do ${total} things in this panel from here, and anything you can do with a control you can ask me for instead.`,
    ""
  ];
  for (const [group, members] of grouped) {
    lines.push(`**${group}**`);
    for (const capability of members) {
      const reauthorizes = panelCapabilityAsksFirst(capability) ? " Asks for your PIN first." : "";
      lines.push(`- ${capability.title} -- ${capability.summary}${reauthorizes}`);
    }
    lines.push("");
  }
  lines.push("Tell me what you want in your own words; I will say which one I took it as before I do anything you might not have meant.");
  return lines.join("\n").trimEnd();
}

const ASKING_WHAT = /\b(?:what|which things?|anything)\b[\s\S]{0,40}\b(?:can|could|are you able to|do you)\b[\s\S]{0,20}\b(?:you|it|i)?\s*\b(?:do|help|operate|control|run|change)\b/iu;
const ASKING_SHORT = /^\s*(?:help|commands?|capabilities|what can you do\??|what else\??)\s*$/iu;

/**
 * Whether this was a person asking what is available rather than asking for
 * something to be done.
 *
 * Deliberately generous. Answering "what can you do" when somebody meant
 * something else costs them one message; running a capability when they were
 * only asking costs them a change they did not want.
 */
export function isPanelCapabilityQuestion(text: string): boolean {
  return ASKING_SHORT.test(text) || ASKING_WHAT.test(text);
}
