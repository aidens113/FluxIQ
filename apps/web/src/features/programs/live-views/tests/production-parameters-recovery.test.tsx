import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProductionRunnerLive } from "../production-runner";

const fixture = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../../program-api", () => ({ useProgramApi: () => fixture.api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
let schema: any;
const snapshot = () => ({ targets: [{ type: "task", id: "one", name: "One", metadata: { parameterSchema: schema } }], runs: [] });
const label = (item: any): string => item.children.map((child: any) => typeof child === "string" ? child : label(child)).join("");
const button = (name: string) => renderer!.root.findAllByType("button").find((item) => label(item) === name)!;
const input = () => renderer!.root.findAllByType("input").find((item) => item.props.inputMode === "decimal")!;
const text = () => JSON.stringify(renderer!.toJSON());
const mount = async () => { await act(async () => { renderer = create(<ProductionRunnerLive />); }); };
const launch = async () => { await act(async () => button("Run task").props.onClick()); };
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  schema = { properties: { amount: { type: "number" } } };
  fixture.api = { get: vi.fn(async () => ({ ok: true, payload: snapshot() })), post: vi.fn(async () => ({ ok: true })) };
});
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

it("blocks invalid numeric text and submits corrected metadata without changing the envelope", async () => {
  await mount(); act(() => input().props.onChange({ target: { value: "invalid" } }));
  await launch(); expect(fixture.api.post).not.toHaveBeenCalled(); expect(input().props.value).toBe("invalid");
  expect(text()).toContain("Enter a finite number.");
  act(() => input().props.onChange({ target: { value: "0" } })); await launch();
  expect(fixture.api.post).toHaveBeenCalledTimes(1);
  expect(fixture.api.post).toHaveBeenCalledWith("start", { name: "One", targetType: "task", targetId: "one", loopsTotal: 1, waitMs: 0, initialDelayMs: 0, metadata: { amount: 0 } });
});
it("applies untouched defaults and leaves optional numeric/enum absence unset", async () => {
  schema = { properties: { amount: { type: "number", default: 4 }, other: { type: "number" }, choice: { enum: ["a", "b"] }, flag: { type: "boolean" }, text: {} } };
  await mount(); await launch();
  expect(fixture.api.post).toHaveBeenLastCalledWith("start", expect.objectContaining({ metadata: { amount: 4, flag: false, text: "" } }));
});
it("preserves drafts on refused/rejected launches and retries corrected values", async () => {
  fixture.api.post.mockResolvedValueOnce({ ok: false, error: "Refused" }).mockRejectedValueOnce(new Error("private"));
  await mount(); act(() => input().props.onChange({ target: { value: "7" } }));
  await launch(); expect(input().props.value).toBe("7"); expect(text()).toContain("Refused");
  await launch(); expect(input().props.value).toBe("7"); expect(text()).not.toContain("private");
  await launch(); expect(fixture.api.post).toHaveBeenCalledTimes(3);
  expect(fixture.api.post).toHaveBeenLastCalledWith("start", expect.objectContaining({ metadata: { amount: 7 } }));
});
it("revalidates same-target schema refresh without clearing edits or posting removed fields", async () => {
  await mount(); act(() => input().props.onChange({ target: { value: "9" } }));
  const oldLaunch = button("Run task").props.onClick;
  schema = { properties: { amount: { type: "number", maximum: 5 } } };
  await act(async () => button("Refresh").props.onClick()); expect(input().props.value).toBe("9");
  await act(async () => oldLaunch()); await launch(); expect(fixture.api.post).not.toHaveBeenCalled();
  expect(text()).toContain("declared bounds");
  schema = { properties: { replacement: { default: "new" } } };
  await act(async () => button("Refresh").props.onClick()); await launch();
  expect(fixture.api.post).toHaveBeenLastCalledWith("start", expect.objectContaining({ metadata: { replacement: "new" } }));
});
it("retains one launch lock with duplicate valid activations", async () => {
  let resolve!: (value: any) => void;
  fixture.api.post.mockReturnValue(new Promise((done) => { resolve = done; }));
  await mount(); act(() => input().props.onChange({ target: { value: "2" } }));
  act(() => { const handler = button("Run task").props.onClick; void handler(); void handler(); });
  expect(fixture.api.post).toHaveBeenCalledTimes(1); expect(button("Run task").props.disabled).toBe(true);
  await act(async () => resolve({ ok: true })); expect(button("Run task").props.disabled).toBe(false);
});
it("fences captured parameter launches on API replacement", async () => {
  await mount(); act(() => input().props.onChange({ target: { value: "8" } }));
  const oldApi = fixture.api, oldLaunch = button("Run task").props.onClick;
  fixture.api = { get: vi.fn(async () => ({ ok: true, payload: snapshot() })), post: vi.fn(async () => ({ ok: true })) };
  await act(async () => renderer!.update(<ProductionRunnerLive />));
  await act(async () => oldLaunch()); expect(oldApi.post).not.toHaveBeenCalled(); expect(fixture.api.post).not.toHaveBeenCalled();
  await launch(); expect(fixture.api.post).toHaveBeenLastCalledWith("start", expect.objectContaining({ metadata: {} }));
});
it("does not add reads while editing or refusing invalid launch", async () => {
  await mount(); expect(fixture.api.get).toHaveBeenCalledTimes(1);
  act(() => input().props.onChange({ target: { value: "bad" } })); await launch();
  expect(fixture.api.get).toHaveBeenCalledTimes(1); expect(fixture.api.post).not.toHaveBeenCalled();
});
it("sends typed empty-string enum selection rather than a control sentinel", async () => {
  schema = { properties: { choice: { enum: ["", "a"] } } }; await mount();
  const control = renderer!.root.findAllByType("select").find((item) => item.props.value === "unset")!;
  act(() => control.props.onChange({ target: { value: "option:0" } })); await launch();
  expect(fixture.api.post).toHaveBeenLastCalledWith("start", expect.objectContaining({ metadata: { choice: "" } }));
});
it.each([undefined, null])("distinguishes absent schema from declared null in the mounted launch (%s)", async (declaration) => {
  schema = declaration; await mount(); await launch();
  if (declaration === undefined) expect(fixture.api.post).toHaveBeenLastCalledWith("start", expect.objectContaining({ metadata: {} }));
  else { expect(fixture.api.post).not.toHaveBeenCalled(); expect(text()).toContain("unsupported or invalid"); }
});
it("omits a cleared optional numeric default rather than inventing zero", async () => {
  schema.properties.amount.default = 5; await mount();
  act(() => input().props.onChange({ target: { value: " " } })); await launch();
  expect(fixture.api.post).toHaveBeenLastCalledWith("start", expect.objectContaining({ metadata: {} }));
});
it.each(["required", "unsupported", "limit"])("blocks a %s declaration/input without posting", async (kind) => {
  if (kind === "required") schema.required = ["amount"];
  if (kind === "unsupported") schema.properties.amount.type = "object";
  if (kind === "limit") schema.properties = Object.fromEntries(Array.from({ length: 31 }, (_, index) => ["field" + index, { type: "string" }]));
  await mount(); await launch(); expect(fixture.api.post).not.toHaveBeenCalled();
  if (kind === "limit") expect(text()).toContain("30 fields");
});
