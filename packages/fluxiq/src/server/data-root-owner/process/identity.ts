import { hostname } from "node:os";
import { machineIdentity } from "./machine.ts";
import { processStartTime } from "./start-time.ts";

/** Who a process is, well enough to tell it apart from a later process that reused its id. */
export type ProcessIdentity = {
  pid: number;
  /** The operating system's start time for the process (`processStartTime`); null when it could not be read. */
  startedAt: string | null;
  platform: NodeJS.Platform;
  /** A hash of the machine's own id (`machineIdentity`); null where there is none, as in most containers. */
  machine: string | null;
  hostname: string;
};

let self: Promise<ProcessIdentity> | undefined;

/** This process's identity, read once. What could not be read is recorded as null and makes its claim uncheckable, never reclaimable, while it lives. */
export function currentProcessIdentity(): Promise<ProcessIdentity> {
  return self ??= (async () => {
    const [startedAt, machine] = await Promise.all([processStartTime(process.pid), machineIdentity()]);
    return {
      pid: process.pid,
      startedAt: startedAt.kind === "read" ? startedAt.value : null,
      platform: process.platform,
      machine: machine.kind === "read" ? machine.id : null,
      hostname: hostname()
    };
  })();
}
