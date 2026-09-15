import { createHash } from "node:crypto";
import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import { automationStudioRecordSchemaDigest } from "../schema-digest.ts";

const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [
    { id: "title", label: "Title", valueType: "string", required: true },
    { id: "price", label: "Price", valueType: "number" }
  ],
  primaryKey: ["title"]
};

describe("automationStudioRecordSchemaDigest", () => {
  it("is sha256: and the hex SHA-256 of the stored schema's stable JSON", () => {
    const stable = "{\"fields\":[{\"id\":\"title\",\"label\":\"Title\",\"required\":true,\"valueType\":\"string\"},{\"id\":\"price\",\"label\":\"Price\",\"valueType\":\"number\"}],\"primaryKey\":[\"title\"],\"schemaVersion\":\"0.1\"}";
    const digest = automationStudioRecordSchemaDigest(SCHEMA);
    expect(digest).toBe(`sha256:${createHash("sha256").update(stable).digest("hex")}`);
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it("ignores key order and excluded fields, and changes with a stored field", () => {
    const reordered: AutomationStudioRecordSchema = {
      primaryKey: ["title"],
      fields: [
        { valueType: "string", required: true, label: "Title", id: "title" },
        { id: "session", label: "Session", valueType: "string", handling: "exclude" },
        { label: "Price", id: "price", valueType: "number" }
      ],
      schemaVersion: "0.1"
    };
    expect(automationStudioRecordSchemaDigest(reordered)).toBe(automationStudioRecordSchemaDigest(SCHEMA));
    const relabelled: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [SCHEMA.fields[0]!, { id: "price", label: "Cost", valueType: "number" }], primaryKey: ["title"] };
    expect(automationStudioRecordSchemaDigest(relabelled)).not.toBe(automationStudioRecordSchemaDigest(SCHEMA));
  });
});
