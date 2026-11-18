import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeBrowserTrustRepository } from "../close";

const { repositories } = vi.hoisted(() => ({ repositories: new Map<string, { close(): Promise<void> }>() }));
vi.mock("../repositories", () => ({ browserTrustRepositories: repositories }));
beforeEach(() => repositories.clear());

describe("browser authority shutdown", () => {
  it("removes closed authorities after a drain error so a future runtime cannot reuse them", async () => {
    const root = path.resolve("browser-shutdown-root");
    const close = vi.fn(async () => { throw new Error("drain failed"); });
    repositories.set(root, { close });
    await expect(closeBrowserTrustRepository(root)).rejects.toThrow("drain failed");
    expect(close).toHaveBeenCalledOnce();
    expect(repositories.size).toBe(0);
  });
  it("does not open an unused repository at shutdown", async () => {
    await closeBrowserTrustRepository(path.resolve("unused-browser-root"));
    expect(repositories.size).toBe(0);
  });
});
