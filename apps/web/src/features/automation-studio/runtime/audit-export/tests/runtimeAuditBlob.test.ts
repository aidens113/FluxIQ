import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runtimeAuditBlob } from "..";

let worker: any;
let failConstruction = false;
let failPost = false;
const createUrl = vi.fn(() => "blob:synthetic-worker");
const revokeUrl = vi.fn();
class SyntheticWorker {
  onmessage: any;
  onerror: any;
  onmessageerror: any;
  terminate = vi.fn();
  postMessage = vi.fn(() => { if (failPost) throw new Error("Synthetic clone failure"); });
  constructor() {
    if (failConstruction) throw new Error("Synthetic construction failure");
    worker = this;
  }
}
beforeEach(() => {
  worker = undefined; failConstruction = false; failPost = false;
  createUrl.mockClear(); revokeUrl.mockClear();
  vi.stubGlobal("Worker", SyntheticWorker);
  vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Runtime audit serializer resource ownership", () => {
  it("returns a worker Blob and releases both resources", async () => {
    const blob = new Blob(["synthetic"], { type: "application/json" });
    const pending = runtimeAuditBlob({ manifest: {} });
    worker.onmessage({ data: blob });
    expect(await pending).toBe(blob);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledWith("blob:synthetic-worker");
  });
  it.each(["onerror", "onmessageerror"])("rejects %s and cleans up", async (handler) => {
    const pending = runtimeAuditBlob({ manifest: {} });
    worker[handler]({ message: "private worker failure" });
    await expect(pending).rejects.toThrow("Audit serialization failed.");
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledTimes(1);
  });
  it("rejects a malformed worker response and cleans up", async () => {
    const pending = runtimeAuditBlob({});
    worker.onmessage({ data: "not a Blob" });
    await expect(pending).rejects.toThrow("Audit serialization failed.");
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledTimes(1);
  });
  it("releases script URL when worker construction throws", async () => {
    failConstruction = true;
    await expect(runtimeAuditBlob({})).rejects.toThrow("Synthetic construction failure");
    expect(revokeUrl).toHaveBeenCalledTimes(1);
  });
  it("terminates the worker when postMessage throws", async () => {
    failPost = true;
    await expect(runtimeAuditBlob({})).rejects.toThrow("Synthetic clone failure");
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledTimes(1);
  });
  it("cancels an unresolved worker and removes its listener", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const pending = runtimeAuditBlob({}, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow("cancelled");
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    worker.onmessage({ data: new Blob(["late"]) });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it("does not acquire resources for an already aborted signal", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(runtimeAuditBlob({}, controller.signal)).rejects.toThrow("cancelled");
    expect(createUrl).not.toHaveBeenCalled();
  });
  it("keeps one-argument fallback and large audit serialization", async () => {
    vi.stubGlobal("Worker", undefined);
    const audit = { actions: Array.from({ length: 10_000 }, (_, index) => ({ attemptId: `synthetic-${index}` })) };
    const blob = await runtimeAuditBlob(audit);
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(await blob.text()).actions).toHaveLength(10_000);
    expect(createUrl).not.toHaveBeenCalled();
  });
  it("surfaces fallback serialization failure without resources", async () => {
    vi.stubGlobal("Worker", undefined);
    const cyclic: any = {}; cyclic.self = cyclic;
    await expect(runtimeAuditBlob(cyclic)).rejects.toThrow();
    expect(createUrl).not.toHaveBeenCalled();
  });
});
