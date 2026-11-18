import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initialize = vi.fn<() => Promise<unknown>>();
vi.mock("../lib/fluxiq", () => ({ initializeFluxIQWebRuntime: initialize }));
const writeSync = vi.fn();
vi.mock("node:fs", async (load) => ({ ...(await load<typeof import("node:fs")>()), writeSync }));

const { register } = await import("../instrumentation");
const runtime = process.env.NEXT_RUNTIME;

beforeEach(() => {
  process.env.NEXT_RUNTIME = "nodejs";
  initialize.mockReset();
  writeSync.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  if (runtime === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = runtime;
});

describe("register", () => {
  it("exits with the refusal when another process serves the data root, instead of listening half-started", async () => {
    const held = Object.assign(new Error("Cannot start the web panel: the FluxIQ data at /data is already being served by fluxiq dev (process 42 on host, since then)."), { code: "fluxiq.data_root_held" });
    initialize.mockRejectedValue(held);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as typeof process.exit);
    await register();
    expect(writeSync).toHaveBeenCalledWith(2, `${held.message}\n`);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits on any other startup failure too, with a plain message and its details", async () => {
    const failure = new Error("storage could not be initialized");
    initialize.mockRejectedValue(failure);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as typeof process.exit);
    await register();
    const written = String(writeSync.mock.calls[0]?.[1]);
    expect(writeSync.mock.calls[0]?.[0]).toBe(2);
    expect(written.startsWith("The FluxIQ web panel could not start: storage could not be initialized")).toBe(true);
    expect(written).toContain("Details:");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits when a thrown value is not an Error", async () => {
    initialize.mockRejectedValue("host module missing");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as typeof process.exit);
    await register();
    expect(writeSync).toHaveBeenCalledWith(2, "The FluxIQ web panel could not start: host module missing\n");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("does nothing on the edge runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    await register();
    expect(initialize).not.toHaveBeenCalled();
  });

  it("starts the runtime once on the node runtime", async () => {
    initialize.mockResolvedValue(undefined);
    await register();
    expect(initialize).toHaveBeenCalledTimes(1);
  });
});
