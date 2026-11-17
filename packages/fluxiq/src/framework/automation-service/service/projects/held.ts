/** What the holdings read: whether the catalogue lists a project as it stands, and each project removed from it. */
export type AutomationStudioHeldProjectsPorts = {
  readonly lists: (projectId: string) => Promise<boolean>;
  readonly removals: { subscribe(listener: (projectId: string) => void): () => void };
};

/**
 * Which projects this instance holds: those its own catalogue lists.
 *
 * Process-wide sources (the activity hub, `runtime/activity/`) carry every
 * instance's projects, and on a hosted platform one process runs a runtime per
 * tenant, so whoever hands their events to a caller asks this first: the
 * client gateway's activity relay, the panel's change stream and
 * `get-activity` all do, and an id this instance does not hold is answered
 * exactly as an unknown one.
 *
 * Project ids are minted unique (`randomUUID` at creation), so a project is
 * listed by exactly one instance and an id read as another's stays another's.
 * An id read as this instance's is forgotten when the project is removed, so a
 * deleted project is read again and found gone. One read per id is in flight
 * at a time and every asker shares it; a read that failed is not remembered,
 * so the next question reads again.
 */
export class AutomationStudioHeldProjects {
  private readonly own = new Set<string>();
  private readonly others = new Set<string>();
  private readonly reading = new Map<string, Promise<boolean>>();

  constructor(private readonly ports: AutomationStudioHeldProjectsPorts) {
    ports.removals.subscribe((projectId) => this.forget(projectId));
  }

  /** What is already known of `projectId`: held, not held, or not read yet (undefined). */
  known(projectId: string): boolean | undefined {
    if (this.own.has(projectId)) return true;
    if (this.others.has(projectId)) return false;
    return undefined;
  }

  /** Whether this instance holds `projectId`; rejects only when the catalogue could not be read. */
  holds(projectId: string): Promise<boolean> {
    const known = this.known(projectId);
    if (known !== undefined) return Promise.resolve(known);
    const inFlight = this.reading.get(projectId);
    if (inFlight) return inFlight;
    const read = this.ports.lists(projectId);
    this.reading.set(projectId, read);
    read.then((held) => {
      // A removal while this was read makes its answer stale: it is not recorded.
      if (this.reading.get(projectId) !== read) return;
      this.reading.delete(projectId);
      (held ? this.own : this.others).add(projectId);
    }, () => {
      // Not remembered: the asker sees the rejection, and the next question reads again.
      if (this.reading.get(projectId) === read) this.reading.delete(projectId);
    });
    return read;
  }

  /** The project was removed from this catalogue: it is read again next time. */
  forget(projectId: string): void {
    this.own.delete(projectId);
    this.reading.delete(projectId);
  }
}
