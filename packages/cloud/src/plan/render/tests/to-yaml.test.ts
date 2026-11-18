import { describe, expect, it } from "vitest";
import { toYaml } from "../to-yaml.ts";

describe("toYaml", () => {
  it("writes block YAML with quoted strings, lists of maps and tagged mappings", () => {
    expect(toYaml({
      services: { app: { image: "x:1", ports: ["127.0.0.1:1:2"], secrets: [{ source: "s", mode: 256 }], empty: {}, none: [] } },
      secrets: { s: { yamlTag: "!override", value: { environment: "V" } } },
      "dotted.key": true,
      "needs quotes": 1
    })).toBe([
      "services:", "  app:", '    image: "x:1"', "    ports:", '      - "127.0.0.1:1:2"', "    secrets:", "      -", '        source: "s"', "        mode: 256", "    empty: {}", "    none: []",
      "secrets:", "  s: !override", '    environment: "V"', "dotted.key: true", '"needs quotes": 1', ""
    ].join("\n"));
  });

  it("keeps a value that looks like another type a string", () => {
    expect(toYaml({ a: "true", b: "1000", c: "${VAR}", d: "line\nbreak" })).toBe('a: "true"\nb: "1000"\nc: "${VAR}"\nd: "line\\nbreak"\n');
  });
});
