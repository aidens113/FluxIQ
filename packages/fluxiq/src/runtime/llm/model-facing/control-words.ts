// The words a model may read for the control a step acts on (t431).
//
// The user's rule (2026-10-10): the model never sees how an element is found
// -- no locator, id, class, score, "address" or "fingerprint" -- but naming a
// control by its own words is fine. Those words are what the model sees on the
// page: the control's accessible name, its visible text, its label, its
// placeholder. They are the one thing about a failed step's control a model
// can look for again.
//
// One owner. The trial feedback (`../../service/candidate-trial/feedback.ts`),
// the step-failure repair brief and the repair context
// (`../../recovery/refuted-result/step-failure-brief.ts`), and the way-out
// script check (`../../flow-bootstrap/script-statements/way-out-steps.ts`) all
// name a control through this, so the model reads one control under one name
// wherever it is told about it.
//
// **From the node's own parameters, as the domain reads them.** Where a node
// keeps its control's words is the domain's (`controlWordsReader`, on its
// implementation bundle, in scope through `../../domain-readings/`). The first
// words it lists that pass the screen win, in the order the model is likeliest to
// see them. The failure record's `expected`/`actual` are never read for it: since
// t426 a target-finding failure carries neither, and they described how the
// control was looked for.
//
// **With no domain's reading, a control is named by nothing.** That is what the
// model is told, and each caller already has to say what a nameless control
// means. A caller for whom nothing is not the closed side asks
// `automationStudioModelFacingControlWordsReadable` first.
//
// **Screened.** Words that carry a locator, a match score or a finding-only
// word (`./control-text.ts`) are no words: a control is then named by nothing
// rather than by how it was found. Ordinary page words the failure-text screen
// drops ("address", "score": `./sayable-text.ts`) are a control's own words
// and stay (t748).

import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioControlWords } from "../../../framework/automation-service/nodes/index.ts";
import { automationStudioDomainReadings } from "../../domain-readings/index.ts";
import { automationStudioModelFacingControlText } from "./control-text.ts";

/** Whether this work has a domain's reading of a control's words at all (header). */
export function automationStudioModelFacingControlWordsReadable(): boolean {
  return automationStudioDomainReadings()?.controlWordsReader !== undefined;
}

/** What the domain reads in these parameters, unscreened: for Core's own comparisons and decisions, never to be shown as it stands. */
export function automationStudioControlWordsOf(parameters: JsonObject | undefined): AutomationStudioControlWords | undefined {
  return automationStudioDomainReadings()?.controlWordsReader?.(parameters);
}

/**
 * The control's own words from a node's parameters, whitespace collapsed, or
 * nothing when it carries none, only words that say how it was found, or no
 * domain's reading is in scope.
 */
export function automationStudioModelFacingControlWords(parameters: JsonObject | undefined): string | undefined {
  for (const value of automationStudioControlWordsOf(parameters)?.words ?? []) {
    const words = value.replace(/\s+/gu, " ").trim();
    if (words && automationStudioModelFacingControlText(words)) return words;
  }
  return undefined;
}
