// The header says what the rows hold beside what the request names, and a list the domain declared to show no pager
// holds one page (t1032). The recorded shape (run-mwv5m906-5e999159): a request naming a table's three columns, a result
// that is a read of another list with other columns, and a list whose detection declared no pager. Generic fixtures: a
// cinema's seats and a library's loans; no scenario's site, task or answer.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstResultPort } from "../index.ts";
import { page, seats, seatVersion, SEAT_LIST, SEAT_REQUEST, step } from "./support.ts";

const LOANS_REQUEST = "Renew the oldest loan, then show me my loans as a table with columns title, copies and due date.";

describe("the header's columns", () => {
  it("says which columns the rows hold and which named ones they lack, where the rows are not the table named", () => {
    const port = automationStudioAnswerFirstResultPort(LOANS_REQUEST);
    port.record([page(step(6), "c1", seats("A", 3), { place: "offset=0" })]);
    expect(port.header()).toContain("columns asked: title, copies, due date, but the rows hold seat, price, state (no title or copies or due date)");
    expect(port.header()).not.toContain("; columns title, copies, due date;");
  });

  it("weighs the columns processing left the answer where they are given", () => {
    const port = automationStudioAnswerFirstResultPort(LOANS_REQUEST);
    port.record([page(step(6), "c1", seats("A", 3), { place: "offset=0" })]);
    expect(port.header(3, ["Title", "copies", "due_date"])).toContain("; columns title, copies, due date;");
    expect(port.header(3, ["title", "price"])).toContain("columns asked: title, copies, due date, but the rows hold title, price (no copies or due date)");
  });

  it("names the request's columns as before where the rows hold every one", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c1", seats("A", 2), { place: "page=1" })]);
    expect(port.header()).toContain("; columns seat, price, state;");
  });
});

describe("the header's paging, by what the domain declared of the list", () => {
  it("says a list declared to show no pager holds one page, never that its paging is not yet checked", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(6), "c1", seats("A", 8), { place: "offset=0" })]);
    expect(port.header()).toContain("paging after offset=0 not yet checked");
    port.record([{ kind: "pager", listKey: SEAT_LIST, pages: false }]);
    expect(port.header()).toContain("the list shows no pager, so it holds one page");
    expect(port.header()).not.toContain("not yet checked");
  });

  it("keeps a list declared to page, another list's declaration, and a step that names no list not yet checked", () => {
    const pages = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    pages.record([page(step(6), "c1", seats("A", 8), { place: "offset=0" }), { kind: "pager", listKey: SEAT_LIST, pages: true }]);
    expect(pages.header()).toContain("paging after offset=0 not yet checked");
    const other = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    other.record([page(step(6), "c1", seats("A", 8), { place: "offset=0" }), { kind: "pager", listKey: "list:another", pages: false }]);
    expect(other.header()).toContain("paging after offset=0 not yet checked");
    const unnamed = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    unnamed.record([page(step(6), "c1", seats("A", 8), { place: "offset=0", version: seatVersion(undefined, null) }), { kind: "pager", listKey: SEAT_LIST, pages: false }]);
    expect(unnamed.header()).toContain("paging after offset=0 not yet checked");
  });

  it("lets a move's verdict stand over the declaration", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(6), "c1", seats("A", 8), { place: "page=1" }), { kind: "pager", listKey: SEAT_LIST, pages: false }]);
    port.record([{ kind: "paging", stepId: "s6", paging: { verdict: "ended", reason: "no next page" } }]);
    expect(port.header()).toContain("the list ended after page=1 (no next page)");
  });
});
