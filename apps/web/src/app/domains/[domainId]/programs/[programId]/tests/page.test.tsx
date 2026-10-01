import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ redirect: vi.fn((destination: string) => { throw new Error(`redirect:${destination}`); }) }));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));
import DomainProgramRedirect from "../page";
beforeEach(() => { state.redirect.mockClear(); });
async function destination(query: Record<string, string | string[] | undefined> = {}, domainId = "web", programId = "automation-studio") {
  await expect(DomainProgramRedirect({ params: Promise.resolve({ domainId, programId }), searchParams: Promise.resolve(query) })).rejects.toThrow("redirect:");
  expect(state.redirect).toHaveBeenCalledTimes(1);
  return new URL(state.redirect.mock.calls[0]![0], "https://panel.invalid");
}
it("keeps the existing empty-query canonical local destination", async () => { const url = await destination(); expect(url.pathname).toBe("/programs/automation-studio"); expect([...url.searchParams]).toEqual([["domainId", "web"]]); });
it("preserves canonical Studio targets and onboarding start", async () => {
  const query = { project: "p", flow: "f", subflow: "s", view: "runtime-debug", detail: "run:r", start: "describe" };
  const url = await destination(query); for (const [key, value] of Object.entries(query)) expect(url.searchParams.get(key)).toBe(value);
  expect(url.searchParams.get("domainId")).toBe("web");
});
it("preserves repeated/empty entries and omits undefined", async () => {
  const url = await destination({ start: ["describe", "extract"], extra: ["", "one", "two"], empty: "", missing: undefined, emptyArray: [] });
  expect(url.searchParams.getAll("start")).toEqual(["describe", "extract"]); expect(url.searchParams.getAll("extra")).toEqual(["", "one", "two"]);
  expect(url.searchParams.get("empty")).toBe(""); expect(url.searchParams.has("missing")).toBe(false); expect(url.searchParams.has("emptyArray")).toBe(false);
});
it.each([{ domainId: "conflict" }, { domainId: ["outside", "other"] }])("forces one path-owned domain over query $domainId", async ({ domainId }) => { const url = await destination({ domainId, project: "p" }, "path/domain"); expect(url.searchParams.getAll("domainId")).toEqual(["path/domain"]); expect(url.searchParams.get("project")).toBe("p"); });
it("encodes identifiers and treats external-looking values as ordinary query data", async () => {
  const query = { returnTo: "https://outside.invalid/path", redirect: "//outside.invalid", url: "javascript:alert(1)", doc: "章/项目", extra: "a+b & c" };
  const url = await destination(query, "web/团队", "//outside.invalid?x#fragment");
  expect(url.origin).toBe("https://panel.invalid"); expect(url.pathname).toBe(`/programs/${encodeURIComponent("//outside.invalid?x#fragment")}`);
  expect(url.searchParams.getAll("domainId")).toEqual(["web/团队"]); for (const [key, value] of Object.entries(query)) expect(url.searchParams.get(key)).toBe(value);
  expect(url.hash).toBe("");
});
