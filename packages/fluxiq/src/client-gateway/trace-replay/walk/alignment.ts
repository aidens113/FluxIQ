// Aligns a replay's events with the recording's by delivery point rather than
// by sequence (traces and offline trials, P3), so one missing or extra event
// shows as itself instead of shifting every later comparison:
//
// - an input (an inbound message, an uploaded artifact) by the recorded input
//   it was fed from;
// - a disposition by the input that caused it;
// - an outbound message by its type, command id and session reference;
// - a lifecycle event by its type and session reference;
// - a Core-synthesized outcome by its type and command id;
// - a control event by its type;
//
// each numbered by occurrence. One instance keys one trace, incrementally, in
// sequence order.

import type { ClientGatewayTraceEvent } from "../../trace/index.ts";

export class ClientGatewayTraceAlignment {
  private readonly keys = new Map<string, string>();
  private readonly counts = new Map<string, number>();
  /** Which trace this keys (`recorded`, `replay`): an input nobody fed keeps a key no other trace's input can take. */
  private readonly side: string;

  constructor(side: string) {
    this.side = side;
  }

  /**
   * The key of `event`, remembered by its event id. `inputKey`, for an input
   * the replay fed, is the key of the recorded input it was fed from.
   */
  key(event: ClientGatewayTraceEvent, inputKey?: string): string {
    const key = inputKey ?? this.numbered(this.base(event));
    this.keys.set(event.eventId, key);
    return key;
  }

  /** The key an event of this trace was given, by its event id. */
  keyOf(eventId: string | null): string | undefined {
    return eventId === null ? undefined : this.keys.get(eventId);
  }

  /** Every event id keyed so far, to its key. */
  all(): ReadonlyMap<string, string> {
    return this.keys;
  }

  private numbered(base: string): string {
    const count = (this.counts.get(base) ?? 0) + 1;
    this.counts.set(base, count);
    return `${base}#${count}`;
  }

  private base(event: ClientGatewayTraceEvent): string {
    const session = event.session ?? "";
    const commandId = event.correlation.commandId ?? "";
    if (event.kind === "inbound" || event.kind === "artifact") return `input|${this.side}|${event.sequence}`;
    if (event.kind === "disposition") return `disposition|${this.keyOf(event.correlation.causationEventId) ?? `unkeyed:${this.side}:${event.correlation.causationEventId ?? ""}`}`;
    if (event.kind === "outbound") return `outbound|${event.messageType ?? ""}|${commandId}|${session}`;
    if (event.kind === "lifecycle") return `lifecycle|${event.messageType ?? ""}|${session}`;
    if (event.kind === "synthesized") return `synthesized|${event.messageType ?? ""}|${commandId}`;
    return `${event.kind}|${event.messageType ?? ""}`;
  }
}
