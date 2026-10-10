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
// **From the node's own parameters.** `element` is the identity the domain
// resolved from the step's handle at submission; `target` is the authored
// target, flat or as `{ kind: "element", fingerprint }`. The first word-bearing
// field wins, in the order the model is likeliest to see it. The failure
// record's `expected`/`actual` are never read for it: since t426 a
// target-finding failure carries neither, and they described how the control
// was looked for.
//
// **Screened.** Words that trip the model-facing screen (`./sayable-text.ts`)
// are no words: a control is then named by nothing rather than by its address.
//
// Domain-neutral: the field names are Core's element-target fingerprint's
// (`../../../model/action-element-target.ts`) plus the two a target is
// commonly authored with (`name`, `placeholder`); no domain's vocabulary.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioModelFacingSayableText } from "./sayable-text.ts";

/** The fields that carry a control's own words, in the order they are preferred. */
const WORD_FIELDS = ["accessibleName", "visibleText", "label", "placeholder"] as const;
/**
 * A flat authored target's `name` is its accessible name, and is read after the
 * fields above. On a resolved identity or a fingerprint `name` is the form
 * field's name attribute -- one of the signals a control is found by, like its
 * id or class -- and is never read (user, 2026-10-10).
 */
const AUTHORED_FIELDS = [...WORD_FIELDS, "name"] as const;

/**
 * The control's own words from a node's parameters, whitespace collapsed, or
 * nothing when it carries none or only words that say how it was found.
 */
export function automationStudioModelFacingControlWords(parameters: JsonObject | undefined): string | undefined {
  for (const { identity, fields } of identities(parameters)) {
    for (const field of fields) {
      const value = identity[field];
      if (typeof value !== "string") continue;
      const words = value.replace(/\s+/gu, " ").trim();
      if (words && automationStudioModelFacingSayableText(words)) return words;
    }
  }
  return undefined;
}

/** Where a node's parameters keep its control's identity: the resolved `element`, then the authored `target` (header). */
function identities(parameters: JsonObject | undefined): Array<{ identity: JsonObject; fields: readonly string[] }> {
  const element = record(parameters?.element);
  const target = record(parameters?.target);
  const fingerprint = record(target?.fingerprint);
  const flat = target && !fingerprint ? target : undefined;
  return [
    ...(element ? [{ identity: element, fields: WORD_FIELDS }] : []),
    ...(fingerprint ? [{ identity: fingerprint, fields: WORD_FIELDS }] : []),
    ...(flat ? [{ identity: flat, fields: AUTHORED_FIELDS }] : [])
  ];
}

function record(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
