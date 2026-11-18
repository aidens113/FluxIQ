import type { FluxIQDataRootOwner } from "./owner/index.ts";

/** Why a claim was refused: the root's owner, as far as this process could tell. */
export type FluxIQDataRootHolder =
  | { kind: "live" | "foreign" | "unverified"; owner: FluxIQDataRootOwner }
  | { kind: "unreadable" }
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
    super(describe(rootDir, ownerFile, holder, role));
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

function describe(rootDir: string, file: string, holder: FluxIQDataRootHolder, role: string): string {
  const head = `Cannot start ${role}: the FluxIQ data at ${rootDir} is already being served by ${summary(holder)}.`;
  const rule = "Only one process may serve a data root at a time, because each keeps its own live view of the data and would not see the other's changes.";
  return [head, rule, advice(holder, file)].join("\n");
}

function summary(holder: FluxIQDataRootHolder): string {
  if (holder.kind === "unreadable") return "a process whose owner file cannot be read";
  if (holder.kind === "contended") return "another process that is starting or stopping at the same moment";
  const { owner } = holder;
  return `${owner.role} (process ${owner.pid} on ${owner.hostname}, since ${owner.claimedAt})`;
}

function advice(holder: FluxIQDataRootHolder, file: string): string {
  const clear = `If no FluxIQ server is running there, delete ${file} and start again.`;
  switch (holder.kind) {
    case "live":
      return `Stop that process first, or give this one a different data directory.`;
    case "foreign":
      return `That process runs on another machine or container, so this one cannot check whether it is still running. Stop it first. ${clear}`;
    case "unverified":
      return `Process ${holder.owner.pid} is running, but its start time could not be read to confirm it is the same process. Stop it first. ${clear}`;
    case "unreadable":
      return clear;
    case "contended":
      return "Try again once the other process has started or stopped.";
  }
}
