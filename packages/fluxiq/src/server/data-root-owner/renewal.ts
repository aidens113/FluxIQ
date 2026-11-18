import { writeSync } from "node:fs";
import { ownerHeartbeat, type FluxIQDataRootOwner } from "./owner/index.ts";

/** How often a holder renews its claim, and how long another process watches before calling it stale. */
export type FluxIQDataRootLease = { renewMs: number; staleAfterMs: number };

/**
 * The defaults: a holder renews every 5 seconds, and a claim nobody renewed for 20 seconds (four
 * renewals missed) is stale. Only an owner this process cannot check by process id waits that long.
 */
export const FLUXIQ_DATA_ROOT_LEASE: FluxIQDataRootLease = Object.freeze({ renewMs: 5_000, staleAfterMs: 20_000 });

/** Called when another process has taken the root from this one. */
export type FluxIQDataRootLostHandler = (message: string) => void;

/**
 * Keeps renewing a claim until stopped. A holder that finds its token gone was paused for longer
 * than the stale window and another process has taken the root; it must stop serving at once, so
 * the default ends the process with a plain message.
 */
export function renewFluxIQDataRootClaim(input: { file: string; owner: FluxIQDataRootOwner; rootDir: string; lease: FluxIQDataRootLease; onLost?: FluxIQDataRootLostHandler }): () => void {
  let renewing = false;
  let stopped = false;
  const timer = setInterval(() => {
    if (renewing || stopped) return;
    renewing = true;
    ownerHeartbeat.renew(input.file, input.owner).then((outcome) => {
      if (outcome === "renewed" || stopped) return;
      stopped = true;
      clearInterval(timer);
      if (outcome === "gone") {
        // The data root was deleted under this process: no other process can serve it, so there is nothing to give way to.
        writeSync(2, `[FluxIQ] The FluxIQ data at ${input.rootDir} no longer exists; its claim is no longer renewed.\n`);
        return;
      }
      (input.onLost ?? exitOnLost)(lostMessage({ rootDir: input.rootDir, role: input.owner.role, lease: input.lease }));
    }, (error: unknown) => {
      // The next renewal tries again; if renewals keep failing, the claim goes stale and the
      // process that takes the root over makes this one stop through `onLost`.
      writeSync(2, `[FluxIQ] Could not renew the claim on ${input.rootDir}: ${error instanceof Error ? error.message : String(error)}\n`);
    }).finally(() => {
      renewing = false;
    });
  }, input.lease.renewMs);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

function lostMessage(input: { rootDir: string; role: string; lease: FluxIQDataRootLease }): string {
  return [
    `FluxIQ stopped ${input.role}: another process has taken over the FluxIQ data at ${input.rootDir}.`,
    `This process stopped renewing its claim for longer than ${Math.round(input.lease.staleAfterMs / 1000)} seconds (it was paused or frozen), so the claim counted as abandoned.`,
    "It exits so that only one process serves the data."
  ].join("\n");
}

function exitOnLost(message: string): void {
  writeSync(2, `${message}\n`);
  process.exit(1);
}
