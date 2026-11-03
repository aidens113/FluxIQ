// Each sort key says what Core read its column as, and whether the rows are in
// that order (t511). Live run `run-mv6qr7fk-77f30b49`: the judges called an
// answer sorted by relative dates, newest first, unsorted, four times.
import { describe, expect, it } from "vitest";
import { automationStudioResultSortReadings } from "../sort-reading.ts";

const NOW = Date.UTC(2026, 9, 13, 12);

describe("a sort key's reading", () => {
  it("says relative dates were read as dates and the rows are in order", () => {
    const rows = [{ posted: "Today" }, { posted: "Posted 3 days ago" }, { posted: "Posted 9 days ago" }];
    const [key] = automationStudioResultSortReadings([{ field: "posted", order: "desc" }], rows, NOW);
    expect(key).toEqual({
      field: "posted",
      inOrder: true,
      said: `Core sorts this answer by posted, newest first, reading posted as a date: 3 of 3 rows state one. The rows above are in that order. Read: "Today" as 2026-10-13; "Posted 3 days ago" as 2026-10-10; "Posted 9 days ago" as 2026-10-04.`
    });
  });

  it("says rows out of the key's order are not in it", () => {
    const rows = [{ price: "$5" }, { price: "$12" }, { price: "$9" }];
    const [key] = automationStudioResultSortReadings([{ field: "price", order: "asc", as: "number" }], rows, NOW);
    expect(key?.inOrder).toBe(false);
    expect(key?.said).toContain("The rows above are not in that order.");
  });

  it("counts the rows that state no value, which come last, and bounds the readings", () => {
    const rows = [{ n: "4" }, { n: "3" }, { n: "2" }, { n: "1" }, { n: "0" }, { n: "none" }];
    const [key] = automationStudioResultSortReadings([{ field: "n", order: "desc", as: "number" }], rows, NOW);
    expect(key?.inOrder).toBe(true);
    expect(key?.said).toContain("5 of 6 rows state one; the other 1 state none and come last.");
    expect(key?.said).toContain(`Read: "4" as 4; "3" as 3; "2" as 2; "1" as 1; and 2 more rows.`);
  });

  it("says nothing for a column no row holds, or one a row holds withheld", () => {
    expect(automationStudioResultSortReadings([{ field: "posted", order: "desc" }], [{ title: "A" }], NOW)).toEqual([]);
    expect(automationStudioResultSortReadings([{ field: "posted", order: "desc" }], [{ posted: "Today" }, { posted: "[withheld]" }], NOW)).toEqual([]);
  });
});
