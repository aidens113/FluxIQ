// The panel's capabilities, written out as the model is given them.
//
// One rendering, in Core, for every caller. The alternative -- each caller
// formatting the list the way it prefers -- is how a model ends up being told
// two different things it can do depending on which path asked it, and how the
// wording that actually made it choose correctly gets lost the next time
// somebody writes the prompt out by hand.
//
// **What the text says, and why.** The ids come first and in full, because the
// id is the only part the model has to reproduce exactly. Arguments are named
// with the required ones marked, and nothing else is marked required, because a
// capability is meant to run on the fewest parameters that can work and the
// panel fills the rest from what is on screen. The re-authorizing two are called
// out as re-authorizing rather than as "needs permission": the person asking for
// the automation is the grant, and a model told it must ask before editing a
// setting will ask, which is the failure this whole default was corrected to
// prevent.

import type { AutomationStudioPanelCapability } from "./capability.ts";

const NOTHING = "The control panel reported no capabilities, so do not offer to operate it; answer from what you already know.";

const PREAMBLE = [
  "You can operate the FluxIQ control panel on this person's behalf.",
  "Choose one capability by its exact id, or none if the person is not asking for anything to be done.",
  "Give only the arguments you actually know. Anything left out is filled in from what the panel has open, so a missing id is not a reason to ask the person for it.",
  "Everything here is ordinary work the person's own request already authorised. Do not ask whether you may proceed."
].join("\n");

/**
 * The whole vocabulary as one block of text for a model's instructions.
 *
 * Empty in, and the model is told plainly that there is nothing to operate --
 * never an empty list it might read as "anything goes".
 */
export function automationStudioPanelCapabilityVocabulary(capabilities: readonly AutomationStudioPanelCapability[]): string {
  if (capabilities.length === 0) return NOTHING;
  const sections: string[] = [PREAMBLE, ""];
  for (const [group, members] of groupedInOrder(capabilities)) {
    sections.push(`${group}:`);
    for (const capability of members) sections.push(`  ${line(capability)}`);
    sections.push("");
  }
  const reauthorizing = capabilities.filter((capability) => capability.reauthorizes).map((capability) => capability.id);
  sections.push(reauthorizing.length === 0
    ? "None of these re-authorize. Run what the person asked for."
    : `These re-authorize before they run, because they delete something or move money: ${reauthorizing.join(", ")}. That is the person proving who they are again, not you asking whether you may. Everything else runs straight away.`);
  return sections.join("\n").trimEnd();
}

/** Every id in the vocabulary, for a caller matching a model's answer back to a capability. */
export function automationStudioPanelCapabilityIds(capabilities: readonly AutomationStudioPanelCapability[]): string[] {
  return capabilities.map((capability) => capability.id);
}

function line(capability: AutomationStudioPanelCapability): string {
  const parts = [`${capability.id} -- ${capability.summary}`];
  if (capability.arguments.length > 0) {
    parts.push(`arguments: ${capability.arguments.map((argument) => (argument.required ? `${argument.name} (required)` : argument.name)).join(", ")}`);
  }
  if (capability.control) parts.push(`the person's own control: ${capability.control}`);
  return parts.join(" | ");
}

/** Grouped by the panel's own headings, each group keeping the order it first appeared in. */
function groupedInOrder(capabilities: readonly AutomationStudioPanelCapability[]): Array<[string, AutomationStudioPanelCapability[]]> {
  const groups = new Map<string, AutomationStudioPanelCapability[]>();
  for (const capability of capabilities) {
    const members = groups.get(capability.group);
    if (members) members.push(capability);
    else groups.set(capability.group, [capability]);
  }
  return [...groups];
}
