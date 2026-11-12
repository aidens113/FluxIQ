import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("not-found"); }) }));
vi.mock("../../../features/data", () => ({ DataPage: () => null }));
vi.mock("../../../features/flows", () => ({ FlowsListPage: () => null }));
vi.mock("../../../features/runs", () => ({ RunsListPage: () => null }));
import DataRoute from "../data/page";
import FlowsRoute from "../flows/page";
import RunsRoute from "../runs/page";

afterEach(() => { delete process.env.FLUXIQ_PANEL_PRESET; });

it("serves every list screen under the full preset", () => {
  expect(() => DataRoute()).not.toThrow();
  expect(() => FlowsRoute()).not.toThrow();
  expect(() => RunsRoute()).not.toThrow();
});
it("answers not found for Data when the preset hides it, so it is off and not only unlinked", () => {
  process.env.FLUXIQ_PANEL_PRESET = "task-automation";
  expect(() => DataRoute()).toThrow("not-found");
  expect(() => FlowsRoute()).not.toThrow();
});
