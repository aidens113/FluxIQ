// The readings of a live trial's witnesses (t775 D1, design section 2).
//
// - **Before.** A witness's latest read in the ledger, when no lasting call or
//   trial landed since it (`fresh`, the ledger clock): `latest_read`. Otherwise
//   Core looks at its location itself (the start check's `lookAt`), once per
//   location, and its newest read after that look is the reading:
//   `core_look`. A look that did not land, or a witness with no known location,
//   leaves it unread. Each location's opaque state is kept as the start its
//   after reading is worded against.
// - **After.** Core looks at each witness location again, with the before
//   state as the start, so the domain words its lines against it; a witness
//   whose look did not land, or with no location, stays unread. An unread
//   side proves nothing either way (`./proof.ts`).
//
// A look that fails is no reading, never a failed trial; an aborted one throws.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioTrialChangeLedgerPort, AutomationStudioTrialChangeLook, AutomationStudioTrialSideReadings, AutomationStudioTrialWitnessSet } from "./contracts.ts";

/** Takes one side's readings of `set` (header). `starts`: the before side's states, for the after side's lines. */
export async function automationStudioTrialWitnessReadings(input: {
  side: "before" | "after";
  set: AutomationStudioTrialWitnessSet;
  port: Pick<AutomationStudioTrialChangeLedgerPort, "latest" | "seq">;
  look?: AutomationStudioTrialChangeLook | undefined;
  starts?: Readonly<Record<string, JsonObject>> | undefined;
  signal?: AbortSignal | undefined;
}): Promise<AutomationStudioTrialSideReadings> {
  const { set, port, side } = input;
  const out: AutomationStudioTrialSideReadings = { readings: {}, starts: {} };
  /** The seq before each location's look, once looked. */
  const looked = new Map<string, number | undefined>();
  const lookOnce = async (location: string): Promise<number | undefined> => {
    if (looked.has(location)) return looked.get(location);
    const before = port.seq();
    let landed: number | undefined = before;
    try {
      await input.look!(location, input.starts?.[location]);
    } catch (error) {
      if (input.signal?.aborted) throw error;
      landed = undefined;
    }
    looked.set(location, landed);
    return landed;
  };
  for (const witness of set.witnesses) {
    const place = set.places[witness.id];
    if (!place) continue;
    const latest = side === "before" ? port.latest(place) : undefined;
    if (latest?.fresh) {
      out.readings[witness.id] = { ...latest.reading, source: "latest_read" };
      if (latest.state && latest.reading.location) out.starts[latest.reading.location] ??= latest.state;
      continue;
    }
    if (place.location === undefined || !input.look) continue;
    const since = await lookOnce(place.location);
    const read = since === undefined ? undefined : port.latest(place);
    if (!read || since === undefined || read.seq <= since) continue;
    out.readings[witness.id] = { ...read.reading, source: "core_look" };
    if (read.state && read.reading.location) out.starts[read.reading.location] ??= read.state;
  }
  return out;
}
