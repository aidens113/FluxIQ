import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLOUD_CONFIG_SCHEMA } from "../cloud-config-schema.ts";

describe("CLOUD_CONFIG_SCHEMA", () => {
  it("is exactly the fluxiq-cloud.schema.json the package ships for editors", () => {
    const shipped = JSON.parse(readFileSync(new URL("../../../fluxiq-cloud.schema.json", import.meta.url), "utf8")) as unknown;
    expect(shipped).toEqual(JSON.parse(JSON.stringify(CLOUD_CONFIG_SCHEMA)));
  });
});
