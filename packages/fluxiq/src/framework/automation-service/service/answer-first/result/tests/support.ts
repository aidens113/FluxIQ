// Generic fixtures for the result ledger's tests: a cinema's seat list and a station timetable. No scenario's site,
// task, product or answer appears here.
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioAnswerFirstResultEvent, AutomationStudioAnswerFirstResultPaging, AutomationStudioAnswerFirstResultRead, AutomationStudioAnswerFirstResultStepRef, AutomationStudioAnswerFirstResultVersion } from "../index.ts";

export const SEAT_FIELDS: JsonObject = { seat: "seat label", price: "price text", state: "seat state" };
export const SEAT_LIST = "list:cinema-seats";
export const FREE: JsonValue = { field: "state", op: "equals", value: "free" };
export const AISLE: JsonValue = { field: "seat", op: "endsWith", value: "1" };
export const UNDER_TEN: JsonValue = { field: "price", op: "lessThan", value: 10 };
export const ROW_A: JsonValue = { field: "seat", op: "startsWith", value: "A" };

/** `count` free seats, labelled `<prefix>1`, `<prefix>2`, ... */
export function seats(prefix: string, count: number, extra: JsonObject = {}): JsonObject[] {
  return Array.from({ length: count }, (_, index) => ({ ...extra, seat: `${prefix}${index + 1}`, price: 9, state: "free" }));
}

/** A version of the seat read; a `null` list key is one the domain did not say. */
export function seatVersion(conditions: readonly JsonValue[] = [FREE], listKey: string | null = SEAT_LIST, fields: JsonObject = SEAT_FIELDS): AutomationStudioAnswerFirstResultVersion {
  return listKey === null ? { conditions, fields } : { conditions, fields, listKey };
}

export function step(position: number, intermediate?: boolean): AutomationStudioAnswerFirstResultStepRef {
  return intermediate === undefined ? { id: `s${position}`, position } : { id: `s${position}`, position, intermediate };
}

export type ReadOver = { place?: string; version?: AutomationStudioAnswerFirstResultVersion; paging?: AutomationStudioAnswerFirstResultPaging; carried?: boolean };

export function read(source: string, kept: readonly JsonObject[], over: ReadOver = {}): AutomationStudioAnswerFirstResultRead {
  const said: AutomationStudioAnswerFirstResultRead = { source, version: over.version ?? seatVersion(), kept };
  if (over.place !== undefined) said.place = over.place;
  if (over.paging !== undefined) said.paging = over.paging;
  if (over.carried !== undefined) said.carried = over.carried;
  return said;
}

export function page(ref: AutomationStudioAnswerFirstResultStepRef, source: string, kept: readonly JsonObject[], over: ReadOver = {}): AutomationStudioAnswerFirstResultEvent {
  return { kind: "page", step: ref, read: read(source, kept, over) };
}

export function look(source: string, kept: readonly JsonObject[], over: ReadOver = {}): AutomationStudioAnswerFirstResultEvent {
  return { kind: "look", read: read(source, kept, over) };
}

export const MOVED: AutomationStudioAnswerFirstResultPaging = { verdict: "moved" };
export const ENDED: AutomationStudioAnswerFirstResultPaging = { verdict: "ended", reason: "no next page" };

/** A request naming its columns, for a sure contract. */
export const SEAT_REQUEST = "List every free seat with columns seat, price and state.";
