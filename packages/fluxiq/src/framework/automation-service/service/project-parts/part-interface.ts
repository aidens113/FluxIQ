// What a part's callers rely on: the ids of what it takes and hands back, and which it must
// be given. The same interface is the same line of versions; a different one is a line of its
// own, under an id of its own, which is never offered to anyone who pinned the old one.
import { createHash } from "node:crypto";
import type { AutomationStudioProjectPartStore } from "../../../persistence/automation/index.ts";

type Port = { id: string; required?: boolean | undefined };
type Ported = { inputs: readonly Port[]; outputs: readonly Port[] };

function signatureOf(ports: Ported): string {
  const side = (list: readonly Port[]) => list.map((port) => `${port.id}:${port.required === true}`).sort();
  return JSON.stringify({ inputs: side(ports.inputs), outputs: side(ports.outputs) });
}

/** The same input and output ids and required flags. Names may differ. */
export function projectPartSameInterface(left: Ported, right: Ported): boolean {
  return signatureOf(left) === signatureOf(right);
}

/** The part id a graph with this interface is written under: the part it came from, or, when its newest version takes or hands back something else, a line of its own. */
export async function projectPartLineOf(store: Pick<AutomationStudioProjectPartStore, "getPart" | "getVersion">, partId: string, ports: Ported): Promise<string> {
  const part = await store.getPart(partId);
  const newest = part ? await store.getVersion(partId, part.latestVersion) : undefined;
  if (!newest) return partId;
  const card = newest.card as Partial<Ported>;
  if (projectPartSameInterface({ inputs: card.inputs ?? [], outputs: card.outputs ?? [] }, ports)) return partId;
  return `part.${createHash("sha256").update(`${partId}\n${signatureOf(ports)}`).digest("hex").slice(0, 24)}`;
}
