import { describe, expect, it } from "vitest";
import { authoringPartProcessDefaults } from "../process-defaults.ts";
import { authoringProcessFieldIds } from "../process-fields.ts";

const schema = { schemaVersion: "0.1", fields: [{ id: "title" }, { id: "when" }] };

describe("authoringPartProcessDefaults", () => {
  it("declares the answer columns the schema stores, and nothing when none is stored", () => {
    expect(authoringPartProcessDefaults({ process: undefined, schema, part: { id: "p", columns: ["Title", "other"] } })).toEqual({ columns: ["title"] });
    expect(authoringPartProcessDefaults({ process: undefined, schema, part: { id: "p", columns: ["other"] } })).toBeUndefined();
  });
});

describe("authoringProcessFieldIds", () => {
  it("lists each field the sort and where name once, and none for no processing", () => {
    expect(authoringProcessFieldIds({ sort: [{ field: "when", order: "desc" }], where: [{ field: "when" }, { field: "title" }] })).toEqual(["when", "title"]);
    expect(authoringProcessFieldIds(undefined)).toEqual([]);
  });
});
