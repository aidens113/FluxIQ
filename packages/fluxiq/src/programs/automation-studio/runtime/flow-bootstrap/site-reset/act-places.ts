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
//
// **Only positive evidence counts (t479).** An item is created only when the
// read before the act listed the page's items and this one was not among them:
// a read that listed none proves nothing absent, so then nothing is created.
// A call stayed on its page only when both reads named the same location: two
// missing locations are not one page. A read that names none says nothing of
// where the call ran, so it is left to the ledger as an unread target is.
//
// **The shown values it replaced (t772 value witness).** Where both reads name
// the same page (`scope`) and report its shown values (`values`), the values
// the act replaced there (`../reset-settlement/value-witness.ts`) are kept with
// its place: a choice confirmed by a press that reloads its page to the same
// address shows its effect only there. A reload to the same address stayed on
// its page here, since only the two locations are compared.

import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY, automationStudioSiteResetValueReplacements as replacements } from "../reset-settlement/index.ts";
import type { AutomationStudioSiteResetPlace, AutomationStudioSiteResetRead, AutomationStudioSiteResetReadAnswer } from "./contracts.ts";

/** The classes whose act the reset may have to look for. */
const LOOKED_FOR: ReadonlySet<string> = new Set(["create_new", "modify_existing", "delete"]);

/** Runs `run` for `call`, reading the target around it when it makes or undoes an act. */
export async function automationStudioSiteResetPlacedCall<T>(input: {
  call: { callId: string; toolId: string; value: JsonObject };
  ledger: { observed?(read: AutomationStudioSiteResetRead): void; actOf(callId: string): string | undefined; placed(act: string, place: AutomationStudioSiteResetPlace): void; undoSeen(act: string, changedInPlace: boolean): void; noEffect?(act: string): void };
  reader: {
    read(start?: JsonObject, signal?: AbortSignal): Promise<AutomationStudioSiteResetReadAnswer>;
    /** A read with live content left out (`./start-check.ts`); absent, `read`. */
    settled?(start?: JsonObject, signal?: AbortSignal): Promise<AutomationStudioSiteResetReadAnswer>;
    /** The item tokens every read so far has seen. */
    seenItems?(): ReadonlySet<string>;
  };
  signal?: AbortSignal | undefined;
  /** Project builds apply the same baseline reads to every domain tool; standalone custom-tool compatibility is explicit. */
  allTools?: boolean;
  run: () => Promise<T>;
}): Promise<T> {
  const { call, ledger, reader, signal } = input;
  if (call.toolId !== AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID && !input.allTools) return await input.run();
  const undoes = call.value[AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY];
  const consequences = call.value.consequences;
  const acts = undoes === undefined && Array.isArray(consequences) && consequences.some((consequence) => typeof consequence === "string" && LOOKED_FOR.has(consequence));
  if (typeof undoes !== "string" && !acts) {
    // A custom tool may declare its lasting effect only inside its permission call, so project originals must precede it.
    if (input.allTools && call.toolId !== AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID) {
      const before = await reader.read(undefined, signal);
      if (!("unread" in before)) ledger.observed?.(before);
    }
    const ran = await input.run();
    const observed = await reader.read(undefined, signal);
    if (!("unread" in observed)) ledger.observed?.(observed);
    return ran;
  }
  const before = await reader.read(undefined, signal);
  if (!("unread" in before)) ledger.observed?.(before);
  // Every item seen before the act, its own page's included: none of them is one it created.
  const seen = "unread" in before ? undefined : reader.seenItems?.();
  const ran = await input.run();
  // A target that could not be read is left to the ledger, which then decides as it did before.
  if ("unread" in before) {
    const observed = await reader.read(undefined, signal);
    if (!("unread" in observed)) ledger.observed?.(observed);
    return ran;
  }
  const after = reader.settled ? await reader.settled(before.state, signal) : await reader.read(before.state, signal);
  if ("unread" in after) return ran;
  ledger.observed?.(after);
  if (typeof undoes !== "string" && !acts) return ran;
  // Where neither read can say which page it was, nothing is claimed (header).
  if (before.location === undefined || after.location === undefined) return ran;
  const stayed = after.location === before.location;
  if (typeof undoes === "string") {
    ledger.undoSeen(undoes, stayed && after.differs.length > 0);
    return ran;
  }
  const act = ledger.actOf(call.callId);
  if (!act || !stayed) return ran;
  // Absent before is known only from a read that listed the page's items (header).
  const known = new Set([...(seen ?? []), ...(before.items ?? [])]);
  const created = after.items && before.items ? after.items.filter((item) => !known.has(item)) : [];
  // Its own page shows nothing of it: no effect appeared, so there is nothing of it to undo.
  if (!after.differs.length && !created.length) {
    ledger.noEffect?.(act);
    return ran;
  }
  const values = valuesReplaced(before, after);
  ledger.placed(act, { state: before.state, location: before.location, changed: after.differs, ...(before.collections && after.collections ? { collections: { before: before.collections, after: after.collections } } : {}), ...(after.lines ? { lines: after.lines } : {}), ...(created.length ? { created } : {}), ...(values ? { values } : {}) });
  return ran;
}

/** The shown values an act replaced on one page read before and after it (header, t772); none where the reads name two pages or it replaced none. */
function valuesReplaced(before: AutomationStudioSiteResetRead, after: AutomationStudioSiteResetRead): AutomationStudioSiteResetPlace["values"] {
  if (before.scope === undefined || before.scope !== after.scope || !before.values || !after.values || before.location === undefined) return undefined;
  const replaced = replacements(before.values, after.values);
  return replaced.length ? { page: before.scope, location: before.location, replaced } : undefined;
}
