import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDevArguments } from "../dev-arguments.ts";

const HOME = path.resolve("/home/person");

describe("fluxiq dev arguments", () => {
  it("defaults to ~/.fluxiq/data, port 3000 and gateway port 4777", () => {
    expect(parseDevArguments([], HOME)).toEqual({ ok: true, value: { dataDir: path.join(HOME, ".fluxiq", "data"), apiPort: 3000, gatewayPort: 4777 } });
  });

  it("reads each flag as `--flag value` or `--flag=value`", () => {
    expect(parseDevArguments(["--data-dir", "./data", "--port=0", "--gateway-port", "4888"], HOME)).toEqual({
      ok: true,
      value: { dataDir: path.resolve("./data"), apiPort: 0, gatewayPort: 4888 }
    });
  });

  it("refuses an unknown argument, a missing value and a port out of range", () => {
    expect(parseDevArguments(["--host", "0.0.0.0"], HOME)).toEqual({ ok: false, error: "Unknown argument: --host" });
    expect(parseDevArguments(["--data-dir"], HOME)).toEqual({ ok: false, error: "--data-dir needs a value." });
    expect(parseDevArguments(["--port", "70000"], HOME)).toEqual({ ok: false, error: "--port must be a whole number from 0 to 65535." });
    expect(parseDevArguments(["--gateway-port", "-1"], HOME)).toEqual({ ok: false, error: "--gateway-port must be a whole number from 0 to 65535." });
  });
});
