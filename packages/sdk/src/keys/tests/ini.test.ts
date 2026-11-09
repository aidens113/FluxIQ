import { describe, expect, it } from "vitest";
import { parseIni } from "../ini.ts";

describe("parseIni", () => {
  it("reads the keys design's sample, comments and all", () => {
    const text = [
      "# ~/.fluxiq/credentials  -- no secrets in this file",
      "[default]                     ; written by the engine on first start",
      "endpoint = local              ; discover the engine",
      "key_file = ~/.fluxiq/keys/owner.pem",
      "",
      "[cloud]",
      "endpoint = https://app.getfluxiq.com",
      "workspace = ws_8h2"
    ].join("\n");
    expect(parseIni(text)).toEqual({ default: { endpoint: "local", key_file: "~/.fluxiq/keys/owner.pem" }, cloud: { endpoint: "https://app.getfluxiq.com", workspace: "ws_8h2" } });
  });

  it("keeps a # that is part of a value", () => {
    expect(parseIni("[a]\nx = one#two")).toEqual({ a: { x: "one#two" } });
  });
});
