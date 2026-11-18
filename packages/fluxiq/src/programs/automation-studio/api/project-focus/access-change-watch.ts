import type { PairedProjectFocusIdentity } from "./types.ts";

/**
 * The changes the installed authorities listen for (`./authority.ts`). The
 * identity source is watched from the first question that read it, before it
 * reads, so no decision is made from a directory whose change would not be
 * heard.
 */
export class PairedAccessChangeWatch {
  private readonly watched = new WeakSet<PairedProjectFocusIdentity>();

  constructor(private readonly stops: Array<() => void>, private readonly changed: () => void) {}

  identity(source: PairedProjectFocusIdentity): void {
    if (this.watched.has(source)) return;
    this.watched.add(source);
    this.stops.push(source.directoryChanges.subscribe(this.changed));
  }

  stop(): void {
    for (const stop of this.stops.splice(0)) stop();
  }
}
