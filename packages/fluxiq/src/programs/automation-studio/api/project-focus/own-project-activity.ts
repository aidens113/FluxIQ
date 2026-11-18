// Which of the process's Automation Studio activity reaches this instance's
// client gateway: only its own projects'. The activity hub
// (`runtime/activity/`) is process-wide, and on a hosted platform one process
// runs a runtime per tenant, so without this every tenant's gateway was handed
// every tenant's activity, and the gateway's access check was the only thing
// between another tenant's build and a paired browser.
//
// A project is this instance's when its own catalogue lists it
// (`AutomationStudioHeldProjects`, the project store's `held`, which the panel's
// change stream and `get-activity` ask too). Each id is read once: activity for
// an id still being read waits behind it, in order, and activity whose
// catalogue could not be read is dropped, not guessed.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioHeldProjects } from "../../../../framework/automation-service/service/projects/index.ts";

/** What the relay reads and where it hands activity. */
export type OwnProjectActivityPorts = {
  /** The process's activity stream (`automationStudioActivityHub`). */
  readonly hub: { subscribe(listener: (activity: ClientGatewayActivity) => void): () => void };
  /** Which projects this instance holds (`AutomationStudioProjectStore.held`). */
  readonly projects: Pick<AutomationStudioHeldProjects, "known" | "holds">;
  /** This instance's gateway (`ClientGatewayService.publishActivity`). */
  readonly publish: (activity: ClientGatewayActivity) => void;
};

/** Hands `publish` the activity of this instance's own projects only; returns what stops it. */
export function relayOwnProjectActivity(ports: OwnProjectActivityPorts): () => void {
  const sorter = new OwnProjectSorter(ports);
  return ports.hub.subscribe((activity) => sorter.take(activity));
}

/** The activity waiting on an id being read. What is held is the holdings' to remember. */
class OwnProjectSorter {
  private readonly reading = new Map<string, ClientGatewayActivity[]>();

  constructor(private readonly ports: OwnProjectActivityPorts) {}

  take(activity: ClientGatewayActivity): void {
    const projectId = activity.subject.projectId;
    const known = this.ports.projects.known(projectId);
    if (known === true) this.ports.publish(activity);
    else if (known === false) return;
    else if (this.reading.has(projectId)) this.reading.get(projectId)?.push(activity);
    else this.read(projectId, activity);
  }

  private read(projectId: string, first: ClientGatewayActivity): void {
    this.reading.set(projectId, [first]);
    this.ports.projects.holds(projectId).then((held) => {
      const waiting = this.reading.get(projectId) ?? [];
      this.reading.delete(projectId);
      if (held) for (const activity of waiting) this.ports.publish(activity);
    }, (error: unknown) => {
      this.reading.delete(projectId);
      console.error("A project's activity was dropped: this instance's catalogue could not be read.", error);
    });
  }
}
