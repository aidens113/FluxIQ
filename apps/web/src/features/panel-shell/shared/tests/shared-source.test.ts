import { describe, expect, it } from "vitest";
import { createSharedSource } from "../shared-source";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a shared source", () => {
  it("reads once for any number of subscribers, and keeps the state after they leave", async () => {
    let reads = 0;
    const source = createSharedSource({ initial: 0, read: async () => ++reads, failed: (previous) => previous });
    const first = source.subscribe(() => undefined);
    const second = source.subscribe(() => undefined);
    await settle();
    expect(reads).toBe(1);
    expect(source.getSnapshot()).toBe(1);
    first();
    second();
    expect(source.getSnapshot()).toBe(1);
  });
  it("does not start a second read while one is running", async () => {
    let reads = 0;
    const read = async () => {
      reads += 1;
      await settle();
      return reads;
    };
    const source = createSharedSource({ initial: 0, read, failed: (previous) => previous });
    source.subscribe(() => undefined);
    source.refresh();
    source.refresh();
    await settle();
    await settle();
    expect(reads).toBe(1);
  });
  it("tells listeners when a read lands", async () => {
    const source = createSharedSource({ initial: "a", read: async () => "b", failed: (previous) => previous });
    let told = 0;
    source.subscribe(() => {
      told += 1;
    });
    await settle();
    expect(told).toBe(1);
  });
  it("shows a failed read to its readers instead of dropping it", async () => {
    const source = createSharedSource({
      initial: "fine",
      read: async () => {
        throw new Error("down");
      },
      failed: (_previous, cause) => `failed: ${(cause as Error).message}`
    });
    let told = 0;
    source.subscribe(() => {
      told += 1;
    });
    await settle();
    expect(source.getSnapshot()).toBe("failed: down");
    expect(told).toBe(1);
  });
});
