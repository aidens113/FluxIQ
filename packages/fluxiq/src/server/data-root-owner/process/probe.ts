import { processStartTime, type ProcessStartTime } from "./start-time.ts";

/** How the owner check looks at another process. Tests replace it. */
export type ProcessProbe = {
  /** True when a process with this id exists, false when none does, "unknown" when the system would not say. */
  exists(pid: number): boolean | "unknown";
  startedAt(pid: number): Promise<ProcessStartTime>;
};

/** The real probe: signal 0 for existence, the operating system's own record for start time. */
export const systemProcessProbe: ProcessProbe = Object.freeze({
  exists(pid: number): boolean | "unknown" {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ESRCH") return false;
      return code === "EPERM" ? true : "unknown";
    }
  },
  startedAt: processStartTime
});
