// Reading the target around a call the build makes while exploring, so the
// reset can later look for an act on the page it was made on (t471).
//
// A call that declares a lasting class, and does not undo anything, is read
// just before and just after it runs, in place: what differs after it is what
// the act changed on its page, kept with the act (`./ledger.ts`, `placed`)
// when the call stayed on that page. A call that names an act under `undoes`
// is read the same way, and the ledger is told whether it changed the page
// it ran on and stayed there (`undoSeen`): a click on words that changes
// nothing, or a link that leaves the page, is not an undo of anything (lane D
// round 9, `run-mv5q4j2n-25784472`). Any other call runs as it came. The
// reads are the domain's passive capture (`./start-check.ts`, `read`): they
// cost no provider call, and a target that cannot be read leaves the ledger
// to decide as before.
//
// **What an act made, and whether it made anything (t475).** The read after a
// call is a settled one (`settled`, `./start-check.ts`), so content that
// changes by itself is not taken for the act's. An act whose page, read in
// place, shows nothing changed and no new item had no effect the site shows,
// and the ledger is told so (`noEffect`): it is never asked for. The items the
// page shows after the act that no read of this build had seen before are the
// items it created, the only ones an undo of it may remove without asking.

import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY, type AutomationStudioSiteResetPlace, type AutomationStudioSiteResetReadAnswer } from "./contracts.ts";

/** The classes whose act the reset may have to look for. */
const LOOKED_FOR: ReadonlySet<string> = new Set(["create_new", "modify_existing", "delete"]);

/** Runs `run` for `call`, reading the target around it when it makes or undoes an act. */
export async function automationStudioSiteResetPlacedCall<T>(input: {
  call: { callId: string; toolId: string; value: JsonObject };
  ledger: { actOf(callId: string): string | undefined; placed(act: string, place: AutomationStudioSiteResetPlace): void; undoSeen(act: string, changedInPlace: boolean): void; noEffect?(act: string): void };
  reader: {
    read(start?: JsonObject, signal?: AbortSignal): Promise<AutomationStudioSiteResetReadAnswer>;
    /** A read with live content left out (`./start-check.ts`); absent, `read`. */
    settled?(start?: JsonObject, signal?: AbortSignal): Promise<AutomationStudioSiteResetReadAnswer>;
    /** The item tokens every read so far has seen. */
    seenItems?(): ReadonlySet<string>;
  };
  signal?: AbortSignal | undefined;
  run: () => Promise<T>;
}): Promise<T> {
  const { call, ledger, reader, signal } = input;
  if (call.toolId !== AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID) return await input.run();
  const undoes = call.value[AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY];
  const consequences = call.value.consequences;
  const acts = undoes === undefined && Array.isArray(consequences) && consequences.some((consequence) => typeof consequence === "string" && LOOKED_FOR.has(consequence));
  if (typeof undoes !== "string" && !acts) return await input.run();
  const before = await reader.read(undefined, signal);
  // Every item seen before the act, its own page's included: none of them is one it created.
  const seen = "unread" in before ? undefined : reader.seenItems?.();
  const ran = await input.run();
  // A target that could not be read is left to the ledger, which then decides as it did before.
  if ("unread" in before) return ran;
  const after = reader.settled ? await reader.settled(before.state, signal) : await reader.read(before.state, signal);
  if ("unread" in after) return ran;
  const stayed = after.location === before.location;
  if (typeof undoes === "string") {
    ledger.undoSeen(undoes, stayed && after.differs.length > 0);
    return ran;
  }
  const act = ledger.actOf(call.callId);
  if (!act || !stayed || !before.location) return ran;
  const known = seen ?? new Set(before.items ?? []);
  const created = after.items ? after.items.filter((item) => !known.has(item)) : [];
  // Its own page shows nothing of it: no effect appeared, so there is nothing of it to undo.
  if (!after.differs.length && !created.length) {
    ledger.noEffect?.(act);
    return ran;
  }
  ledger.placed(act, { state: before.state, location: before.location, changed: after.differs, ...(after.lines ? { lines: after.lines } : {}), ...(created.length ? { created } : {}) });
  return ran;
}
