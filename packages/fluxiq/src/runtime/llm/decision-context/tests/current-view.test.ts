// What the decider is shown of the reads a run made (`../current-view.ts`, t1048): every read that ran stays in view
// until the same page of the same list is read again. Run-mwvgjb8c-5a1f2ae3 read page 1 of a list, then page 2 of it,
// and from then on page 1's rows (the right answer among them) were in no request: both reads were one held group.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceEntry } from "../../context-window.ts";
import { automationStudioLlmEvidenceCurrentView } from "../current-view.ts";

const KEYS = ["page", "read.extracted", "read.rejectedRows"];

type Read = { listKey?: string; place?: string; url?: string; rows: JsonObject[] };
const read = (callId: string, said: Read, top: JsonObject = {}): AutomationStudioLlmEvidenceEntry => ({
  callId,
  toolId: "core.run_node",
  value: { page: `page after ${callId}`, ...top, read: { extracted: said.rows, ...(said.listKey === undefined ? {} : { listKey: said.listKey }), ...(said.place === undefined ? {} : { place: said.place }), ...(said.url === undefined ? {} : { url: said.url }), firstRows: said.rows.slice(0, 1) } }
});
const act = (callId: string): AutomationStudioLlmEvidenceEntry => ({ callId, toolId: "core.run_node", value: { page: `page after ${callId}` } });

type Group = { group: string; callId: string; holder?: string; value: JsonObject };
const groupsOf = (records: readonly AutomationStudioLlmEvidenceEntry[]): Group[] => ((automationStudioLlmEvidenceCurrentView(records, KEYS).currentView?.value as { groups?: Group[] } | undefined)?.groups ?? []);
const heldRows = (records: readonly AutomationStudioLlmEvidenceEntry[]): Record<string, JsonValue> => Object.fromEntries(groupsOf(records).filter((group) => group.holder === "read").map((group) => [group.callId, group.value.extracted!]));

const BOOKS = "list.books";
const MAPS = "list.maps";
const shelf = (name: string, n: number): JsonObject[] => Array.from({ length: n }, (_, index) => ({ title: `${name} ${index + 1}` }));

describe("the reads the decider is shown", () => {
  it("holds both lists' rows after reads of two lists", () => {
    const records = [read("read_books", { listKey: BOOKS, url: "https://library.test/books", rows: shelf("Book", 2) }), read("read_maps", { listKey: MAPS, url: "https://library.test/maps", rows: shelf("Map", 3) })];
    expect(heldRows(records)).toEqual({ read_books: shelf("Book", 2), read_maps: shelf("Map", 3) });
  });

  it("holds both pages' rows after reads of page 1 and page 2 of one list", () => {
    const records = [
      read("read_p1", { listKey: BOOKS, place: "page=1", url: "https://library.test/books?q=atlas", rows: shelf("Page one book", 3) }),
      act("next_page"),
      read("read_p2", { listKey: BOOKS, url: "https://library.test/books?q=atlas&page=2", rows: shelf("Page two book", 2) })
    ];
    expect(heldRows(records)).toEqual({ read_p1: shelf("Page one book", 3), read_p2: shelf("Page two book", 2) });
    // Each call's rows are referred to under its own group, and that group's whole rows are in the tail.
    const { history } = automationStudioLlmEvidenceCurrentView(records, KEYS);
    const reference = (index: number) => ((history[index]!.value as JsonObject).read as JsonObject).extracted as { "core.view_reference": { callId: string; group: string } };
    expect(reference(0)["core.view_reference"].group).not.toBe(reference(2)["core.view_reference"].group);
    const names = groupsOf(records).map((group) => group.group);
    for (const index of [0, 2]) expect(names).toContain(reference(index)["core.view_reference"].group);
  });

  it("replaces only that list's rows when the same list is read again on the same page", () => {
    const records = [
      read("read_books", { listKey: BOOKS, place: "page=1", url: "https://library.test/books", rows: shelf("Old book", 2) }),
      read("read_maps", { listKey: MAPS, url: "https://library.test/maps", rows: shelf("Map", 1) }),
      read("read_books_again", { listKey: BOOKS, place: "page=1", url: "https://library.test/books", rows: shelf("New book", 1) })
    ];
    expect(heldRows(records)).toEqual({ read_maps: shelf("Map", 1), read_books_again: shelf("New book", 1) });
    const serialized = JSON.stringify(automationStudioLlmEvidenceCurrentView(records, KEYS));
    expect(serialized).not.toContain("Old book 2");
    // The group keeps its place in the tail: the first list's group is still first.
    expect(groupsOf(records).filter((group) => group.holder === "read").map((group) => group.callId)).toEqual(["read_books_again", "read_maps"]);
  });

  it("names the same group on every request, so a reference reads the same each time", () => {
    const first = [read("read_books", { listKey: BOOKS, url: "https://library.test/books", rows: shelf("Book", 1) })];
    const later = [...first, act("press"), read("read_maps", { listKey: MAPS, url: "https://library.test/maps", rows: shelf("Map", 1) })];
    expect(JSON.stringify(automationStudioLlmEvidenceCurrentView(later, KEYS).history[0])).toEqual(JSON.stringify(automationStudioLlmEvidenceCurrentView(first, KEYS).history[0]));
  });

  it("finds the address on the answer where the read itself does not say it", () => {
    const records = [
      read("read_p1", { listKey: BOOKS, rows: shelf("Page one book", 1) }, { location: "https://library.test/books" }),
      read("read_p2", { listKey: BOOKS, rows: shelf("Page two book", 1) }, { location: "https://library.test/books?page=2" })
    ];
    expect(Object.keys(heldRows(records))).toEqual(["read_p1", "read_p2"]);
  });

  it("holds page 1's rows through the reads that followed in run-mwvgjb8c-5a1f2ae3", () => {
    // The run's own list keys, places and addresses (steps 0022, 0026 and 0040), with the item names made generic. Page 1
    // held the right row ($1.28, rated 4.5, pickup today); page 2 held the row the model chose ($1.97).
    const at = "http://127.0.0.1:63190/shop/search?q=towels&facet=fulfillment_speed%3AToday";
    const results = "list.030ae6af307e2d1035ef1f5d969b";
    const pageOne = [...shelf("Pack", 14).map((row, index) => ({ ...row, price: `$${(3 + index).toFixed(2)}`, rating: "4.6", pickup: "Pickup today" })), { title: "Single roll", price: "$1.28", rating: "4.5", pickup: "Pickup today" }];
    const pageTwo = [...shelf("Bundle", 10).map((row, index) => ({ ...row, price: `$${(7 + index).toFixed(2)}`, rating: "4.5", pickup: "Pickup today" })), { title: "Other single roll", price: "$1.97", rating: "4.6", pickup: "Pickup today" }];
    const records = [
      read("read_results", { listKey: results, place: "page=1", url: at, rows: pageOne }, { location: at }),
      act("next_page_results"),
      read("read_results_p2", { listKey: results, url: `${at}&page=2`, rows: pageTwo }, { location: `${at}&page=2` }),
      act("add_one"),
      act("open_cart"),
      read("read_cart", { listKey: "list.00234cc3b485c00862a0418757ae", place: "offset=0", url: "http://127.0.0.1:63190/shop/cart", rows: [{ title: "Other single roll", price: "$1.97" }] })
    ];
    for (const count of [3, 4, 6]) {
      const tail = JSON.stringify(automationStudioLlmEvidenceCurrentView(records.slice(0, count), KEYS).currentView);
      expect(tail, `after ${count} calls`).toContain("$1.28");
      expect(tail, `after ${count} calls`).toContain("$1.97");
    }
    expect(Object.keys(heldRows(records))).toEqual(["read_results", "read_results_p2", "read_cart"]);
  });

  it("keeps one group per holder where a read names no list, as before", () => {
    const records = [read("r1", { rows: shelf("First", 1) }), read("r2", { rows: shelf("Second", 1) })];
    expect(groupsOf(records).filter((group) => group.holder === "read")).toEqual([{ group: "holder:read", callId: "r2", holder: "read", value: { extracted: shelf("Second", 1) } }]);
  });
});
