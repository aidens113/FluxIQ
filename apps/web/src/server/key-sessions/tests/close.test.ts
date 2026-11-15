import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeKeySessionServices } from "../close";

const { compositions } = vi.hoisted(() => ({ compositions: new Map<string, Promise<{ store: { close(): Promise<void> } }>>() }));
vi.mock("../compositions", () => ({ keySessionCompositions: compositions }));
beforeEach(() => compositions.clear());

describe("key authority shutdown", () => {
  it("drains every authority for the root even when one fails and leaves other roots alone", async () => {
    const root = path.resolve("shutdown-test-root");
    const other = path.resolve("different-test-root");
    const closeFailing = vi.fn(async () => { throw new Error("failed operation"); });
    const closeHealthy = vi.fn(async () => undefined);
    const closeOther = vi.fn(async () => undefined);
    compositions.set(JSON.stringify([root, "https://a.test", "a"]), Promise.resolve({ store: { close: closeFailing } }));
    compositions.set(JSON.stringify([root, "https://b.test", "b"]), Promise.resolve({ store: { close: closeHealthy } }));
    const otherKey = JSON.stringify([other, "https://other.test", "other"]);
    compositions.set(otherKey, Promise.resolve({ store: { close: closeOther } }));
    await expect(closeKeySessionServices(root)).rejects.toThrow("could not all close");
    expect(closeFailing).toHaveBeenCalledOnce();
    expect(closeHealthy).toHaveBeenCalledOnce();
    expect(closeOther).not.toHaveBeenCalled();
    expect([...compositions.keys()]).toEqual([otherKey]);
  });
  it("opens nothing when no authority has been used", async () => {
    await closeKeySessionServices(path.resolve("unused-test-root"));
    expect(compositions.size).toBe(0);
  });
});
