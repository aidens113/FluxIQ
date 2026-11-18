// The change notice a held write gives once, when it settles: a hold inside a
// hold joins the outer one, a write that threw still gives its held notice,
// and work a write left running is told at once after the hold ended.

import { describe, expect, it } from "vitest";
import { ModelKeysChangeNotice } from "../model-keys-notice.ts";

describe("ModelKeysChangeNotice", () => {
  it("gives one notice for every announcement inside a hold, nested holds included, when the outer hold settles", async () => {
    const notice = new ModelKeysChangeNotice();
    let told = 0;
    notice.subscribe(() => { told += 1; });
    await notice.holding(async () => {
      notice.announce();
      await notice.holding(async () => { notice.announce(); });
      expect(told).toBe(0);
      notice.announce();
    });
    expect(told).toBe(1);
    notice.announce();
    expect(told).toBe(2);
  });

  it("still gives the held notice when the write throws, and none when nothing was announced", async () => {
    const notice = new ModelKeysChangeNotice();
    let told = 0;
    notice.subscribe(() => { told += 1; });
    await expect(notice.holding(async () => {
      notice.announce();
      throw new Error("write failed after its commit");
    })).rejects.toThrow("write failed");
    expect(told).toBe(1);
    await notice.holding(async () => undefined);
    expect(told).toBe(1);
  });

  it("tells at once an announcement from work the write left running after its hold ended", async () => {
    const notice = new ModelKeysChangeNotice();
    let told = 0;
    notice.subscribe(() => { told += 1; });
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    let leftRunning: Promise<void> = Promise.resolve();
    await notice.holding(async () => {
      // Started inside the hold, so it runs on the held write's chain, but only after the hold ended.
      leftRunning = gate.then(() => notice.announce());
    });
    expect(told).toBe(0);
    open();
    await leftRunning;
    expect(told).toBe(1);
  });
});
