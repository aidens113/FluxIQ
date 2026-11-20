import { describe, expect, it } from "vitest";
import { authoringPartProcessDefaults } from "../process-defaults.ts";
import { authoringProcessFieldIds } from "../process-fields.ts";

const schema = { schemaVersion: "0.1", fields: [{ id: "title" }, { id: "when" }] };

describe("authoringPartProcessDefaults", () => {
  it("declares the answer columns the schema stores, and nothing when none is stored", () => {
    expect(authoringPartProcessDefaults({ process: undefined, schema, part: { id: "p", columns: ["Title", "other"] } })).toEqual({ columns: ["title"] });
    expect(authoringPartProcessDefaults({ process: undefined, schema, part: { id: "p", columns: ["other"] } })).toBeUndefined();
  });

  it("declares the answer columns even where a where tests a field they leave out (t970): it is stored and not shown", () => {
    expect(authoringPartProcessDefaults({ process: { where: [{ field: "when", is: "present" }] }, schema, part: { id: "p", columns: ["title"] } }))
      .toEqual({ where: [{ field: "when", is: "present" }], columns: ["title"] });
  });
});

describe("authoringProcessFieldIds", () => {
  it("lists each field the sort and where name once, and none for no processing", () => {
    expect(authoringProcessFieldIds({ sort: [{ field: "when", order: "desc" }], where: [{ field: "when" }, { field: "title" }] })).toEqual(["when", "title"]);
    expect(authoringProcessFieldIds(undefined)).toEqual([]);
  });

  it("lists the fields anyOf, compare and derive read, never a derived column (t970)", () => {
    expect(authoringProcessFieldIds({
      derive: [{ id: "year", from: "when" }],
      where: [{ field: "year", atLeast: 2026 }],
      anyOf: [[{ field: "badge", is: "present" }, { field: "title", contains: "x" }]],
      compare: [{ field: "price", lessThan: "was" }]
    })).toEqual(["badge", "title", "price", "was", "when"]);
  });
});
