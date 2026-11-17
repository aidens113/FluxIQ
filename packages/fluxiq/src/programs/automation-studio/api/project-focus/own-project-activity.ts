// Which of the process's Automation Studio activity reaches this instance's
// client gateway: only its own projects'. The activity hub
// (`runtime/activity/`) is process-wide, and on a hosted platform one process
// runs a runtime per tenant, so without this every tenant's gateway was handed
// every tenant's activity, and the gateway's access check was the only thing
// between another tenant's build and a paired browser.
//
// A project is this instance's when its own catalogue lists it. Project ids
// are minted unique (`randomUUID` at creation), so a project is listed by
// exactly one instance and an id read as another's stays another's; an id
// read as this instance's is forgotten when the project is removed, so a
// deleted project's later activity is read again and found gone. Each id is
// read once: activity for an id still being read waits behind it, in order,
// and activity whose catalogue could not be read is dropped, not guessed.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";

/** What the relay reads and where it hands activity. */
export type OwnProjectActivityPorts = {
  /** The process's activity stream (`automationStudioActivityHub`). */
  readonly hub: { subscribe(listener: (activity: ClientGatewayActivity) => void): () => void };
  /** Whether this instance's catalogue lists `projectId`, as it stands. */
  readonly holds: (projectId: string) => Promise<boolean>;
  /** Projects removed from this instance's catalogue. */
  readonly removals: { subscribe(listener: (projectId: string) => void): () => void };
  /** This instance's gateway (`ClientGatewayService.publishActivity`). */
  readonly publish: (activity: ClientGatewayActivity) => void;
};

/** Hands `publish` the activity of this instance's own projects only; returns what stops it. */
export function relayOwnProjectActivity(ports: OwnProjectActivityPorts): () => void {
  const sorter = new OwnProjectSorter(ports);
  const stops = [ports.hub.subscribe((activity) => sorter.take(activity)), ports.removals.subscribe((projectId) => sorter.forget(projectId))];
  return () => {
    for (const stop of stops) stop();
  };
}

/** The ids read so far, as this instance's or another's, and the activity waiting on an id being read. */
class OwnProjectSorter {
  private readonly own = new Set<string>();
  private readonly others = new Set<string>();
  private readonly reading = new Map<string, ClientGatewayActivity[]>();

  constructor(private readonly ports: OwnProjectActivityPorts) {}

  take(activity: ClientGatewayActivity): void {
    const projectId = activity.subject.projectId;
    if (this.own.has(projectId)) this.ports.publish(activity);
    else if (this.reading.has(projectId)) this.reading.get(projectId)?.push(activity);
    else if (!this.others.has(projectId)) this.read(projectId, activity);
  }

  forget(projectId: string): void {
    this.own.delete(projectId);
  }

  private read(projectId: string, first: ClientGatewayActivity): void {
    this.reading.set(projectId, [first]);
    this.ports.holds(projectId).then((held) => {
      const waiting = this.reading.get(projectId) ?? [];
      this.reading.delete(projectId);
      (held ? this.own : this.others).add(projectId);
      if (held) for (const activity of waiting) this.ports.publish(activity);
    }, (error: unknown) => {
      this.reading.delete(projectId);
      console.error("A project's activity was dropped: this instance's catalogue could not be read.", error);
    });
  }
}
