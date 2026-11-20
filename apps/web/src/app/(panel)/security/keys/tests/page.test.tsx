import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); } }));
import SecurityKeysRoute from "../page";

it("sends the old Keys address to AI keys in Settings", () => {
  expect(() => SecurityKeysRoute()).toThrow("REDIRECT /settings#ai-keys");
});
