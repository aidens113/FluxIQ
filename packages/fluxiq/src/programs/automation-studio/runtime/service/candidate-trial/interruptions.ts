// What the run closed over the page while a step ran, for the trial feedback
// (t470).
//
// Lane D round 8 (`run-mv5jnc5m-a47c3e59`, t465 defect 2): a confirm in a loop
// met the site's request to slow down. The runtime waited it out, and the
// client closed the site's notice by its way out itself, so the trial feedback
// carried the pass, the wait and the pace, and nothing about the notice or the
// control that closed it. The script format asked for a step closing the
// notice anyway, and the only close-like handle the model had ever been shown
// was the chat's "Close chat"; the saved "slow-down notice" step closed the
// chat on its first pass.
//
// So each layer the client closed during a step's attempts is now said on the
// step: what kind of layer it was, that the run closed it, and -- only when the
// domain could name it (`clearedControlHandles`, from the `wayOut` the client
// reported for the control it pressed) -- the handle of that way out. The
// script format asks for a dismissing step only against a handle named here
// (`../../flow-bootstrap/plan/flow-script-format.ts`); with none named, the run
// closes the layer itself and the Flow answers only with its pace.
//
// Read from Core's own trace and the domain's answer only: the layer's closed
// kind, its own name and a handle. The dismiss words the client matched stay
// in the trace.
//
// **Whose layer it was (t661).** A8 bigbox cart (`run-mvac0ddx-f52ba929`): an
// optional step's control was gone, so the client cleared the layers over the
// page -- among them the store picker the Flow's own step had just opened. The
// step said "The page put a dialog in the way, and the run closed it by
// pressing its way out, t334": Core never knew the page put it there, and
// nothing said `t334` closed the picker. A layer is now said as over the page,
// never as the page's, with its own name where the page gave it one. Where the
// domain marks a cleared layer as one a press of this run opened (`runOpened`
// on the layer it reported), it is said as a layer the nearest earlier step
// that acted opened -- `openedBy`, the step number the feedback hands in -- and
// that closing it undid that step. The mark is read from the dispatch's own
// report on the attempt (`outputs.result.clearedLayers`), matched by kind and
// way out; a domain that does not report it leaves the layer unattributed.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioClearedLayerKind, AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";

/** The most closed layers one step lists. */
const MAX_INTERRUPTIONS = 4;

/** What each kind of layer is called, as the model reads it. */
const LAYER_WORDS: Readonly<Record<AutomationStudioClearedLayerKind, string>> = Object.freeze({
  rate_limit: "the site's notice asking the run to slow down",
  consent: "a cookie or consent notice",
  promotion: "a promotion",
  assistant: "a chat or assistant panel",
  dialog: "a dialog"
});

/** The most of a layer's own name quoted back. */
const NAME_MAX_CHARS = 80;

/**
 * Each layer the client closed while `attempts` ran, in order, once per kind
 * and way out: its `kind`, the `wayOut` handle when `handles` names one for
 * the control pressed, `openedByStep` when the domain marked it as opened by
 * this run and `openedBy` names the step that did (header, t661), and a
 * sentence saying so.
 */
export function automationStudioTrialInterruptions(attempts: readonly AutomationStudioNodeAttemptTrace[], handles: Readonly<Record<string, string>> = {}, openedBy?: number): JsonObject[] {
  const said: JsonObject[] = [];
  const seen = new Set<string>();
  const runOpened = runOpenedLayers(attempts);
  for (const layer of attempts.flatMap((attempt) => attempt.clearedLayers ?? [])) {
    const handle = layer.wayOut === undefined ? undefined : handles[layer.wayOut];
    const key = `${layer.kind}\0${handle ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (said.length >= MAX_INTERRUPTIONS) break;
    const opener = openedBy !== undefined && runOpened.has(`${layer.kind}\0${layer.wayOut ?? ""}`) ? openedBy : undefined;
    const name = layer.name ? ` (${JSON.stringify(layer.name.slice(0, NAME_MAX_CHARS))})` : "";
    const words = `${capitalised(LAYER_WORDS[layer.kind])}${name}${opener === undefined ? "" : `, a layer step ${opener} opened,`}`;
    const undid = opener === undefined ? "" : ` Closing it undid what step ${opener} had opened.`;
    said.push({
      kind: layer.kind,
      ...(handle === undefined ? {} : { wayOut: handle }),
      ...(opener === undefined ? {} : { openedByStep: opener }),
      said: handle === undefined
        ? `${words} was over the page, and the run closed it by itself.${undid} No control of it is named, so no step of the Flow is needed to close it.`
        : `${words} was over the page, and the run closed it by pressing its way out, ${handle}.${undid}`
    });
  }
  return said;
}

/** The kind and way out of each layer the dispatches' own reports mark `runOpened: true` (header); malformed entries are skipped. */
function runOpenedLayers(attempts: readonly AutomationStudioNodeAttemptTrace[]): Set<string> {
  const marked = new Set<string>();
  for (const attempt of attempts) {
    const result = attempt.outputs?.result;
    const reported = result && typeof result === "object" && !Array.isArray(result) ? (result as Readonly<Record<string, unknown>>).clearedLayers : undefined;
    if (!Array.isArray(reported)) continue;
    for (const entry of reported) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const { kind, wayOut, runOpened } = entry as Readonly<Record<string, unknown>>;
      if (runOpened === true && typeof kind === "string") marked.add(`${kind}\0${typeof wayOut === "string" ? wayOut : ""}`);
    }
  }
  return marked;
}

function capitalised(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1);
}
