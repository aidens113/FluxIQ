// The state rule: a Flow's commands, one at a time, answered from one exploration's
// recording or refused with a classified gap (the study's section 4). It sees only
// the commands, never a live answer, so what it says can be compared with what the
// site said.
//
// 1. A read is answered only from the current state, by exact canonical input. The
//    nth repeat gets the nth recorded answer, then the last. A read gap does not end
//    the run. A state is searched in the order it was recorded: from where this run
//    last was, up to the next move or act that succeeded, so a page the recording saw
//    move by itself, there and back, is followed the way it went. A state reached by
//    another way is read by position and acts alone. A read the state holds no answer
//    for is offered to the domain's `computeRead` over that state's own reads, and
//    only after that is it a gap. Nothing is computed from another state's reads. Rows
//    computed to differ from the recorded read's say the recording took another path
//    from there, so any later act or read of rows is not vouched for (`afterChangedRows`).
// 2. A page move goes to the recorded state reached by that input from the same acts
//    done; a relative move must also start at the same node. From other acts: gap
//    `state_changed_by_act`, never an answer showing what the Flow did not cause. A
//    move that is not answered leaves the position unknown until a recorded absolute
//    move restores it.
// 3. An act equals a recorded act not yet used, with its row. Used already: gap
//    `would_repeat_act`. Order is free only between siblings, the same act on rows
//    of one list. A recorded failure answers the same, unless the same call also
//    succeeded.
// 4. An act that was not recorded puts the run off the recording: every later command
//    is gap `after_unrecorded_act`.
// 5. The end check is `./end-check.ts`.
// 6. A recorded dismissal is answered and marked as maybe gone the next time.
// 7. A different wait is accepted when the recorded answer came inside it. A recorded
//    timeout under a longer wait is a gap, and so is a recorded answer that came after
//    this command would have stopped waiting.

import { clientGatewayTraceOperationDifferences, type ClientGatewayTraceOperation } from "../trace-matcher/index.ts";
import type {
  ClientGatewayTraceStateAnswer,
  ClientGatewayTraceStateDomain,
  ClientGatewayTraceStateEntry,
  ClientGatewayTraceStateGapCode,
  ClientGatewayTraceStateNearest,
  ClientGatewayTraceStateRecording,
  ClientGatewayTraceStateWalkOptions
} from "./types.ts";

export class ClientGatewayTraceStateWalker {
  private readonly recording: ClientGatewayTraceStateRecording;
  private readonly domain: ClientGatewayTraceStateDomain;
  private readonly handles: (operation: ClientGatewayTraceOperation) => ClientGatewayTraceOperation;
  private readonly options: ClientGatewayTraceStateWalkOptions;
  private readonly usedActs = new Set<number>();
  /** Every recorded act this run was answered from that counts as done: a receipted one changes nothing. */
  private readonly doneActs = new Set<number>();
  private readonly servedReads = new Map<string, number>();
  private readonly servedMoves = new Set<number>();
  /** The rows each read input was answered with, by identity, latest input last. */
  private readonly answeredRows = new Map<string, Set<string>>();
  private node: string;
  /** The recorded call this run last stood on: its place in time, within a state. */
  private cursor = -1;
  private lastUsedAct: number | null = null;
  private offRecording = false;
  private positionLost = false;
  private rowsChanged = false;
  private beyondChangedRows = false;

  constructor(recording: ClientGatewayTraceStateRecording, domain: ClientGatewayTraceStateDomain, options: ClientGatewayTraceStateWalkOptions = { skippedActs: "gap" }) {
    this.recording = recording;
    this.domain = domain;
    this.handles = domain.handleScope(options.clock);
    this.options = options;
    this.node = recording.startNode;
  }

  /** The node the run stands on. */
  get currentNode(): string {
    return this.node;
  }

  /** The recorded acts this run used, by entry index. */
  get used(): readonly number[] {
    return [...this.usedActs].sort((left, right) => left - right);
  }

  /** This run's result: the rows of the read input it was last answered rows for, across the pages it read. */
  get rows(): readonly string[] {
    return [...([...this.answeredRows.values()].at(-1) ?? [])];
  }

  /** Whether this run went on, acting or reading rows, after a computed read changed the rows the recording went on from. */
  get afterChangedRows(): boolean {
    return this.beyondChangedRows;
  }

  /** Whether a read at this point would be refused whatever its input, because the run left the recording or lost its place. */
  get hasLeftRecording(): boolean {
    return this.offRecording || this.positionLost;
  }

  answer(command: ClientGatewayTraceOperation): ClientGatewayTraceStateAnswer {
    const operation = this.handles(command);
    const kind = this.domain.labelCall(operation);
    const answer = kind === "read" ? this.read(operation) : kind === "page_move" ? this.move(operation) : this.act(operation);
    if (this.rowsChanged && answer.status === "answered" && answer.computed === null && (kind === "act" || (this.recording.entries[answer.entry]!.reading.rows ?? []).length > 0)) this.beyondChangedRows = true;
    return answer;
  }

  private read(operation: ClientGatewayTraceOperation): ClientGatewayTraceStateAnswer {
    const key = this.domain.canonicalKey(operation);
    const same = this.recording.entries.filter((entry) => entry.kind === "read" && entry.key === key);
    if (this.offRecording) return gap("after_unrecorded_act", same.at(-1)?.index ?? null, null);
    if (this.positionLost) return gap("after_unrecorded_move", same.at(-1)?.index ?? null, null);
    if (same.length === 0) {
      const computed = this.computedRead(operation, key, this.readsOfThisState(operation));
      if (computed !== null) return computed;
      return gap(this.hasReadOfAction(operation) ? "argument_mismatch" : "missing_transition", null, this.nearest(operation, "read"));
    }
    const later = this.laterInThisState(same);
    if (later !== null) this.noteServed(later.node, key);
    const entry = later ?? this.nextRead(same, key);
    if (entry === null) {
      const computed = this.computedRead(operation, key, this.readsOfThisState(operation));
      if (computed !== null) return computed;
      const positioned = same.filter((candidate) => candidate.node === this.node);
      const refused = (positioned.at(-1) ?? same.at(-1))!;
      return gap(positioned.length > 0 ? "state_changed_by_act" : "other_position", refused.index, null);
    }
    this.node = entry.node;
    this.cursor = entry.index;
    const blocked = answerGap(entry, this.domain.waitMs(operation), this.domain);
    if (blocked !== null) return gap(blocked, entry.index, null);
    if (!this.domain.recordedAnswerFits(operation, entry.call.answer)) {
      return this.computedRead(operation, key, [entry]) ?? gap("argument_mismatch", entry.index, null);
    }
    if (entry.reading.outcome === "succeeded" && (entry.reading.rows?.length ?? 0) > 0) this.noteRows(key, entry.reading.rows!);
    return answered("read_same_state", entry, false, this.skippedOf(entry));
  }

  /** The recorded reads of this action in the state this run stands in: where it is, with the acts it has done. */
  private readsOfThisState(operation: ClientGatewayTraceOperation): readonly ClientGatewayTraceStateEntry[] {
    if (this.options.skippedActs === "tolerate") return [];
    const nodes = this.placesFromHere();
    return this.recording.entries.filter((entry) => entry.kind === "read" && entry.call.operation.actionType === operation.actionType && nodes.includes(entry.node) && this.sameActs(entry));
  }

  /** The domain's answer computed from `reads`, or `null` when it would need the page. What was withheld at capture is never read. */
  private computedRead(operation: ClientGatewayTraceOperation, key: string, reads: readonly ClientGatewayTraceStateEntry[]): ClientGatewayTraceStateAnswer | null {
    const usable = reads.flatMap((entry) => (entry.call.answer !== null && !entry.call.redacted ? [{ entry: entry.index, operation: entry.call.operation, answer: entry.call.answer }] : []));
    if (usable.length === 0) return null;
    const computed = this.domain.computeRead(operation, usable);
    if (computed === null) return null;
    const source = this.recording.entries[computed.from]!;
    this.node = source.node;
    if (computed.from > this.cursor) this.cursor = computed.from;
    if (this.rowsChanged) this.beyondChangedRows = true;
    if (!sameRows(computed.rows, source.reading.rows ?? [])) this.rowsChanged = true;
    if (computed.rows.length > 0) this.noteRows(key, computed.rows);
    return { status: "answered", rule: "read_computed", entry: source.index, mayBeGoneNextTime: false, skippedActs: this.skippedOf(source), computed };
  }

  private move(operation: ClientGatewayTraceOperation): ClientGatewayTraceStateAnswer {
    const key = this.domain.canonicalKey(operation);
    const same = this.recording.entries.filter((entry) => entry.kind === "page_move" && entry.key === key);
    if (this.offRecording) return gap("after_unrecorded_act", same.at(-1)?.index ?? null, null);
    if (same.length === 0) {
      this.positionLost = true;
      return gap("missing_transition", null, this.nearest(operation, "page_move"));
    }
    const absolute = this.domain.pageMoveForm(operation) === "absolute";
    if (!absolute && this.positionLost) return gap("after_unrecorded_move", same.at(-1)?.index ?? null, null);
    const nodes = this.placesFromHere();
    const placed = same.filter((entry) => absolute || nodes.includes(entry.node));
    const fromSameActs = placed.filter((entry) => this.sameActs(entry));
    if (fromSameActs.length === 0) {
      this.positionLost = true;
      const refused = (placed.at(-1) ?? same.at(-1))!;
      return gap(placed.length > 0 ? "state_changed_by_act" : "other_position", refused.index, null);
    }
    const succeeded = fromSameActs.filter((entry) => entry.reading.outcome === "succeeded");
    const pool = succeeded.length > 0 ? succeeded : fromSameActs;
    const entry = pool.find((candidate) => !this.servedMoves.has(candidate.index)) ?? pool.at(-1)!;
    const blocked = answerGap(entry, this.domain.waitMs(operation), this.domain);
    if (blocked !== null) {
      this.positionLost = true;
      return gap(blocked, entry.index, null);
    }
    this.servedMoves.add(entry.index);
    if (entry.reading.outcome !== "succeeded") return answered("page_move_recorded_failure", entry, false, 0);
    this.cursor = entry.index;
    this.node = entry.nodeAfter;
    this.positionLost = false;
    return answered("page_move", entry, false, this.skippedOf(entry));
  }

  private act(operation: ClientGatewayTraceOperation): ClientGatewayTraceStateAnswer {
    const key = this.domain.canonicalKey(operation);
    const acts = this.recording.entries.filter((entry) => entry.kind === "act");
    const same = acts.filter((entry) => entry.key === key);
    if (this.offRecording) return gap("after_unrecorded_act", same.at(-1)?.index ?? null, null);
    if (this.positionLost) {
      this.offRecording = true;
      return gap("after_unrecorded_move", same.at(-1)?.index ?? null, null);
    }
    if (same.length === 0) {
      this.offRecording = true;
      const siblingKey = this.domain.siblingKey(operation);
      const sibling = acts.find((entry) => entry.siblingKey === siblingKey && entry.reading.outcome === "succeeded");
      return gap(sibling === undefined ? "missing_transition" : "other_row", null, this.nearest(operation, "act"));
    }
    const landed = same.filter((entry) => entry.reading.outcome === "succeeded");
    if (landed.length === 0) {
      const failed = same.at(-1)!;
      return answered("act_recorded_failure", failed, false, 0);
    }
    const unused = landed.filter((entry) => !this.usedActs.has(entry.index));
    if (unused.length === 0) return gap("would_repeat_act", landed.at(-1)!.index, null);
    const nodes = this.placesFromHere();
    const here = unused.filter((entry) => nodes.includes(entry.node));
    if (here.length === 0) {
      this.offRecording = true;
      return gap("other_position", unused[0]!.index, null);
    }
    const lastUsed = this.lastUsedAct === null ? null : this.recording.entries[this.lastUsedAct]!;
    const inOrder = here.filter((entry) => lastUsed === null || entry.index > lastUsed.index || entry.siblingKey === lastUsed.siblingKey);
    if (inOrder.length === 0) {
      this.offRecording = true;
      return gap("act_out_of_order", here[0]!.index, null);
    }
    const inState = inOrder.filter((entry) => this.sameActsApartFromSiblings(entry));
    if (inState.length === 0) {
      this.offRecording = true;
      return gap("state_changed_by_act", inOrder[0]!.index, null);
    }
    const entry = inState[0]!;
    const blocked = answerGap(entry, this.domain.waitMs(operation), this.domain);
    if (blocked !== null) {
      this.offRecording = true;
      return gap(blocked, entry.index, null);
    }
    const skipped = this.skippedOf(entry);
    this.cursor = entry.index;
    this.usedActs.add(entry.index);
    if (!this.recording.receipts.has(entry.index)) this.doneActs.add(entry.index);
    if (this.lastUsedAct === null || entry.index > this.lastUsedAct) this.lastUsedAct = entry.index;
    this.node = entry.nodeAfter;
    return answered("act", entry, entry.oneTimeLayer, skipped);
  }

  /** The next read of this input after this run's place in time, within the state it stands in. */
  private laterInThisState(same: readonly ClientGatewayTraceStateEntry[]): ClientGatewayTraceStateEntry | null {
    for (let index = this.cursor + 1; index < this.recording.entries.length; index += 1) {
      const entry = this.recording.entries[index]!;
      if (entry.kind === "read" && same.includes(entry) && this.sameActs(entry)) return entry;
      if (entry.kind !== "read" && entry.reading.outcome === "succeeded") return null;
    }
    return null;
  }

  /** Where a move or act may stand: the run's own node, and the rest of its state in time. */
  private placesFromHere(): readonly string[] {
    const nodes = [this.node];
    for (let index = this.cursor + 1; index < this.recording.entries.length; index += 1) {
      const entry = this.recording.entries[index]!;
      if (!nodes.includes(entry.node)) nodes.push(entry.node);
      if (entry.kind !== "read" && entry.reading.outcome === "succeeded") break;
    }
    return nodes;
  }

  /** A read at the node the run stands on, by position and acts alone: the next unused one, then the last. */
  private nextRead(same: readonly ClientGatewayTraceStateEntry[], key: string): ClientGatewayTraceStateEntry | null {
    const here = same.filter((entry) => entry.node === this.node && this.sameActs(entry));
    if (here.length === 0) return null;
    return here[Math.min(this.noteServed(this.node, key), here.length - 1)]!;
  }

  /** Counts a read of this input at a node, with these acts done; answers how many came before it. */
  private noteServed(node: string, key: string): number {
    const servedKey = `${node}\n${[...this.doneActs].sort((left, right) => left - right).join(",")}\n${key}`;
    const served = this.servedReads.get(servedKey) ?? 0;
    this.servedReads.set(servedKey, served + 1);
    return served;
  }

  private noteRows(key: string, rows: readonly string[]): void {
    const held = this.answeredRows.get(key) ?? new Set<string>();
    this.answeredRows.delete(key);
    for (const row of rows) held.add(row);
    this.answeredRows.set(key, held);
  }

  /** Whether an entry's acts done are this run's: exactly, or under `tolerate`, as far as this run went and past it. */
  private sameActs(entry: ClientGatewayTraceStateEntry): boolean {
    const done = this.doneActs;
    const before = entry.actsBefore;
    if (this.options.skippedActs === "tolerate") return [...done].every((act) => before.has(act));
    return done.size === before.size && [...done].every((act) => before.has(act));
  }

  /** `sameActs` for an act, whose siblings may land in any order: the other rows of its list do not say whose turn it is. */
  private sameActsApartFromSiblings(entry: ClientGatewayTraceStateEntry): boolean {
    const others = (acts: Iterable<number>): number[] => [...acts].filter((act) => this.recording.entries[act]!.siblingKey !== entry.siblingKey);
    const done = others(this.doneActs);
    const before = new Set(others(entry.actsBefore));
    if (this.options.skippedActs === "tolerate") return done.every((act) => before.has(act));
    return done.length === before.size && done.every((act) => before.has(act));
  }

  /** The recorded acts in an entry's state that this run has not done. */
  private skippedOf(entry: ClientGatewayTraceStateEntry): number {
    let skipped = 0;
    for (const act of entry.actsBefore) {
      if (!this.doneActs.has(act)) skipped += 1;
    }
    return skipped;
  }

  private hasReadOfAction(operation: ClientGatewayTraceOperation): boolean {
    return this.recording.entries.some((entry) => entry.kind === "read" && entry.call.operation.actionType === operation.actionType);
  }

  /** An operation as the rule compares it, so a difference a normalisation removed is not named as one. */
  private canonical(operation: ClientGatewayTraceOperation): Pick<ClientGatewayTraceOperation, "compared"> & ClientGatewayTraceOperation {
    return { ...operation, compared: JSON.parse(this.domain.canonicalKey(operation)) as ClientGatewayTraceOperation["compared"] };
  }

  /** The recorded call of this kind and action nearest this command, by how few fields differ. */
  private nearest(operation: ClientGatewayTraceOperation, kind: ClientGatewayTraceStateEntry["kind"]): ClientGatewayTraceStateNearest | null {
    let best: ClientGatewayTraceStateNearest | null = null;
    for (const entry of this.recording.entries) {
      if (entry.kind !== kind || entry.call.operation.actionType !== operation.actionType) continue;
      const fields = clientGatewayTraceOperationDifferences(this.canonical(operation), this.canonical(entry.call.operation));
      if (best === null || fields.length < best.fields.length) best = { entry: entry.index, fields };
    }
    return best;
  }
}

function sameRows(left: readonly string[], right: readonly string[]): boolean {
  const rights = new Set(right);
  const lefts = new Set(left);
  return lefts.size === rights.size && [...lefts].every((row) => rights.has(row));
}

/** Whether a recorded answer may stand for this command at all: what was withheld, and rule 7. */
function answerGap(entry: ClientGatewayTraceStateEntry, waitMs: number | null, domain: ClientGatewayTraceStateDomain): ClientGatewayTraceStateGapCode | null {
  if (entry.call.redacted) return "redacted_input";
  if (entry.call.answer === null) return "incomplete_capture";
  if (waitMs === null) return null;
  const answeredAfter = entry.call.latencyMs;
  if (answeredAfter === null) return null;
  // The recorded call's own wait was as long, and it got this answer: the clock of a look-before-it is not this command's.
  const recordedWait = domain.waitMs(entry.call.operation);
  if (entry.reading.timedOut) return waitMs > (recordedWait ?? answeredAfter) ? "wait_longer_than_recorded" : null;
  if (recordedWait !== null && waitMs >= recordedWait) return null;
  return answeredAfter > waitMs ? "wait_shorter_than_recorded" : null;
}

function gap(code: ClientGatewayTraceStateGapCode, refusedEntry: number | null, nearest: ClientGatewayTraceStateNearest | null): ClientGatewayTraceStateAnswer {
  return { status: "gap", code, refusedEntry, nearest };
}

function answered(rule: Extract<ClientGatewayTraceStateAnswer, { status: "answered" }>["rule"], entry: ClientGatewayTraceStateEntry, mayBeGoneNextTime: boolean, skippedActs: number): ClientGatewayTraceStateAnswer {
  return { status: "answered", rule, entry: entry.index, mayBeGoneNextTime, skippedActs, computed: null };
}
