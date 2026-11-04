// One exploration's calls placed in states: the study's "state = page position +
// acts done". Pure. Each call gets the node it was made at, the node it left, and
// the recorded acts that had succeeded before it.
//
// **Position comes from recorded answers alone, never from a Flow's live run.**
//
// - A read's own answer says where the page is now, so a page that moved by itself,
//   or went on after an earlier call failed, is seen where it was seen.
// - A successful move or act settles at the first position a later read reports, up
//   to the next successful move or act, because a press that navigates reports its
//   answer before the page has gone. With no such read, at its own answer's position.
// - A node is a position plus how many relative moves have gone from it: a list that
//   pages without changing its address has one position and several nodes. An absolute
//   move returns the count to zero, and so does any change of position.
// - A failed or no-effect call starts no new state.
//
// A successful act enters every later call's `actsBefore`, unless it holds a receipt:
// a receipt says it changed nothing that a later read could show. `layerActsAreReceipted`
// gives one to every act marked as closing a layer, to measure how far that goes; it
// also means a Flow may drop such an act unseen, which is why it is asked for by name.

import type { ClientGatewayTraceRecordedPayload } from "../trace-matcher/index.ts";
import type {
  ClientGatewayTraceStateAnswerReading,
  ClientGatewayTraceStateDomain,
  ClientGatewayTraceStateEntry,
  ClientGatewayTraceStateReceipt,
  ClientGatewayTraceStateRecordedCall,
  ClientGatewayTraceStateRecording
} from "./types.ts";

const UNKNOWN_POSITION = "?";

/** The node of a position and the relative moves made from it. */
function nodeOf(position: string | null, depth: number): string {
  return `${position ?? UNKNOWN_POSITION}#${depth}`;
}

export function clientGatewayTraceStateRecording(input: {
  calls: readonly ClientGatewayTraceStateRecordedCall[];
  domain: ClientGatewayTraceStateDomain;
  /** Receipts by the call's ordinal among `calls`. */
  receipts?: ReadonlyMap<number, ClientGatewayTraceStateReceipt>;
  layerActsAreReceipted?: boolean;
}): ClientGatewayTraceStateRecording {
  const { calls, domain } = input;
  const readings = calls.map((call) => domain.readAnswer(call.answer));
  const kinds = calls.map((call) => domain.labelCall(call.operation));
  const entries: ClientGatewayTraceStateEntry[] = [];
  const acts = new Set<number>();
  const receipts = new Map<number, ClientGatewayTraceStateReceipt>();
  let position = startPosition(kinds, readings);
  let depth = 0;
  let readBefore: ClientGatewayTraceRecordedPayload | null = null;
  const startNode = nodeOf(position, depth);
  for (const [index, call] of calls.entries()) {
    const reading = readings[index]!;
    const kind = kinds[index]!;
    if (kind === "read" && reading.outcome !== "failed" && reading.position !== null && reading.position !== position) {
      position = reading.position;
      depth = 0;
    }
    const node = nodeOf(position, depth);
    const form = kind === "page_move" ? domain.pageMoveForm(call.operation) : null;
    const actsBefore = new Set(acts);
    const started = kind !== "read" && reading.outcome === "succeeded";
    const oneTimeLayer = kind === "act" && reading.outcome === "succeeded" && domain.isOneTimeLayerAct(call.operation, readBefore);
    if (started) {
      const settled = settledPosition(index, kinds, readings) ?? position;
      depth = kind === "page_move" && form === "relative" && settled === position ? depth + 1 : kind === "act" && settled === position ? depth : 0;
      position = settled;
      const receipt = input.receipts?.get(index) ?? (oneTimeLayer && input.layerActsAreReceipted === true ? "one_time_layer" : undefined);
      if (kind === "act") {
        if (receipt === undefined) acts.add(index);
        else receipts.set(index, receipt);
      }
    }
    entries.push(Object.freeze({
      index, call, kind,
      key: domain.canonicalKey(call.operation),
      siblingKey: domain.siblingKey(call.operation),
      form, reading, node,
      nodeAfter: nodeOf(position, depth),
      actsBefore,
      oneTimeLayer
    }));
    if (kind === "read" && call.answer !== null) readBefore = call.answer;
  }
  const endNode = nodeOf(position, depth);
  const resultEntry = lastRows(entries);
  const lastAct = lastSuccessfulAct(entries);
  // A task that ends in an act ends after it, whatever it read on the way.
  const resultNode = lastAct !== null && (resultEntry === null || lastAct > resultEntry) ? entries[lastAct]!.nodeAfter : resultEntry === null ? endNode : entries[resultEntry]!.node;
  const resultRows = resultEntry === null ? [] : rowsOfKey(entries, entries[resultEntry]!.key);
  return Object.freeze({ entries: Object.freeze(entries), startNode, endNode, resultEntry, resultRows, resultNode, receipts });
}

/** Where the recording began: what a read before its first move or act saw. A recording that begins by moving began nowhere it can say. */
function startPosition(kinds: readonly string[], readings: readonly ClientGatewayTraceStateAnswerReading[]): string | null {
  for (const [index, reading] of readings.entries()) {
    if (kinds[index] !== "read") {
      if (reading.outcome === "succeeded") return null;
      continue;
    }
    if (reading.outcome !== "failed" && reading.position !== null) return reading.position;
  }
  return null;
}

/** Where a successful move or act at `index` settled: the next read's position, up to the next move or act that succeeded; else its own answer's. */
function settledPosition(index: number, kinds: readonly string[], readings: readonly ClientGatewayTraceStateAnswerReading[]): string | null {
  for (let next = index + 1; next < readings.length; next += 1) {
    const reading = readings[next]!;
    if (kinds[next] === "read") {
      if (reading.outcome !== "failed" && reading.position !== null) return reading.position;
      continue;
    }
    if (reading.outcome === "succeeded") break;
  }
  return readings[index]!.position;
}

function lastRows(entries: readonly ClientGatewayTraceStateEntry[]): number | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    if (entry.kind === "read" && entry.reading.outcome === "succeeded" && entry.reading.rows !== null && entry.reading.rows.length > 0) return index;
  }
  return null;
}

/** Every row the successful reads of one input returned: one read per page of a list, or the same read again. */
function rowsOfKey(entries: readonly ClientGatewayTraceStateEntry[], key: string): readonly string[] {
  const rows = new Set<string>();
  for (const entry of entries) {
    if (entry.kind !== "read" || entry.key !== key || entry.reading.outcome !== "succeeded") continue;
    for (const row of entry.reading.rows ?? []) rows.add(row);
  }
  return [...rows];
}

function lastSuccessfulAct(entries: readonly ClientGatewayTraceStateEntry[]): number | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    if (entry.kind === "act" && entry.reading.outcome === "succeeded") return index;
  }
  return null;
}
