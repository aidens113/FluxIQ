import type { FluxIQDataRootOwner } from "./owner/index.ts";

/**
 * Why a claim was refused:
 * - `live`: the holder is a running process on this machine, checked by its id and start time;
 * - `renewing`: the holder could not be checked that way (another machine or container, or an
 *   unreadable start time or owner file), but it kept renewing its claim while this process watched;
 * - `contended`: the owner file kept changing hands while this process tried to take it.
 */
export type FluxIQDataRootHolder =
  | { kind: "live"; owner: FluxIQDataRootOwner }
  | { kind: "renewing"; owner: FluxIQDataRootOwner | null }
  | { kind: "contended" };

/**
 * Another process serves this data root. The message is plain and names the holder; it holds
 * no token. `holder` lets a command add its own advice, as `fluxiq accounts` does.
 */
export class FluxIQDataRootHeldError extends Error {
  readonly code = "fluxiq.data_root_held";
  readonly rootDir: string;
  readonly ownerFile: string;
  readonly holder: FluxIQDataRootHolder;
  constructor(rootDir: string, ownerFile: string, holder: FluxIQDataRootHolder, role: string) {
    super(describe(rootDir, holder, role));
    this.name = "FluxIQDataRootHeldError";
    this.rootDir = rootDir;
    this.ownerFile = ownerFile;
    this.holder = holder;
  }

  /** The holder in a few words: "the web panel (process 1234 on HOST, since 2026-11-17T10:00:00.000Z)". */
  holderSummary(): string {
    return summary(this.holder);
  }
}

function describe(rootDir: string, holder: FluxIQDataRootHolder, role: string): string {
  const head = `Cannot start ${role}: the FluxIQ data at ${rootDir} is already being served by ${summary(holder)}.`;
  const rule = "Only one process may serve a data root at a time, because each keeps its own live view of the data and would not see the other's changes.";
  return [head, rule, advice(holder)].join("\n");
}

function summary(holder: FluxIQDataRootHolder): string {
  if (holder.kind === "contended") return "another process that is starting or stopping at the same moment";
  if (!holder.owner) return "a process whose owner file cannot be read but is still being renewed";
  const { owner } = holder;
  return `${owner.role} (process ${owner.pid} on ${owner.hostname}, since ${owner.claimedAt})`;
}

function advice(holder: FluxIQDataRootHolder): string {
  switch (holder.kind) {
    case "live":
      return "Stop that process first, or give this one a different data directory.";
    case "renewing":
      return "It kept renewing its claim while this process watched, so it is still running, possibly on another machine or in another container. Stop it first, or give this one a different data directory.";
    case "contended":
      return "Try again once the other process has started or stopped.";
  }
}
