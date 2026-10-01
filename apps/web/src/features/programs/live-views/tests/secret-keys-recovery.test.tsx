import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { SecretKeysLive } from "../secret-keys";
const apis = vi.hoisted(() => ({ secret: { get: vi.fn(), post: vi.fn() }, automation: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../../program-api", () => ({ useProgramApi: (id: string) => id === "secret-keys" ? apis.secret : apis.automation }));
vi.mock("../../shared-ui", async original => ({ ...await original<object>(), Modal: (p: any) => <section data-modal={p.title} data-close={p.onClose}>{p.children}</section>, Menu: (p: any) => <div>{p.options.map((o: any) => <button key={o.id} onClick={o.onSelect}>{o.label}</button>)}</div> }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const user = { id: "actor", displayName: "Actor", roleId: "admin", pinConfigured: false, totpEnabled: false };
const key = { id: "key", name: "Synthetic", kind: "custom", scope: "global", enabled: true, createdAtMs: 1, updatedAtMs: 2, lastRotatedAtMs: 2 };
let view: ReactTestRenderer;
const label = (n: any): string => n.children.map((c: any) => typeof c === "string" ? c : label(c)).join("");
const button = (name: string) => view.root.findAllByType("button").find(n => label(n) === name)!;
const text = () => JSON.stringify(view.toJSON());
const field = (name: string) => view.root.find(n => n.props.label === name && typeof n.type === "function");
function deferred() { let resolve!: (v: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; }
async function mount() { await act(async () => { view = create(<SecretKeysLive currentUser={user} />); }); }
beforeEach(() => { vi.stubGlobal("window", { setTimeout, clearTimeout, dispatchEvent() {} }); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ domains: [] }) })); apis.secret = { get: vi.fn().mockResolvedValue({ ok: true, payload: { keys: [key] } }), post: vi.fn().mockResolvedValue({ ok: true }) }; apis.automation = { get: vi.fn().mockResolvedValue({ ok: true, payload: { projects: [{ id: "a", name: "A" }, { id: "b", name: "B" }] } }), post: vi.fn() }; });
afterEach(() => { if (view) act(() => view.unmount()); vi.unstubAllGlobals(); });
it("project A/B/A publishes only the newest A request", async () => {
 const requests = [deferred(), deferred(), deferred()]; let calls = 0; apis.automation.post.mockImplementation(() => requests[calls++]!.promise);
 await mount(); await act(async () => button("Add Key").props.onClick()); act(() => field("Scope").findByType("select").props.onChange({ target: { value: "flow" } }));
 act(() => field("Project").findByType("select").props.onChange({ target: { value: "a" } })); act(() => field("Project").findByType("select").props.onChange({ target: { value: "b" } })); act(() => field("Project").findByType("select").props.onChange({ target: { value: "a" } }));
 await act(async () => requests[2]!.resolve({ ok: true, payload: { flows: [{ flowId: "newest", name: "Newest" }] } })); await act(async () => requests[0]!.resolve({ ok: true, payload: { flows: [{ flowId: "obsolete", name: "Obsolete" }] } }));
 expect(text()).toContain("newest"); expect(text()).not.toContain("obsolete"); await act(async () => requests[1]!.resolve({ ok: true, payload: { flows: [] } }));
});

async function open(choice: string) { await act(async () => button(choice).props.onClick()); }
function fill(name: string, value: string) { act(() => field(name).findByType("input").props.onChange({ target: { value } })); }
for (const [choice, submit, endpoint] of [["Edit metadata", "Save Changes", "update-key"], ["Rotate value", "Rotate Value", "rotate-key"], ["Delete key", "Delete Key", "delete-key"]]) {
 it("keeps acknowledged " + endpoint + " visible through follow-up read failure and retries reads only", async () => {
  await mount(); await open(choice!); fill("Your password", "synthetic-proof"); if (endpoint === "rotate-key") fill("New secret value", "synthetic-new-value");
  apis.secret.get.mockResolvedValueOnce({ ok: false, error: "synthetic private metadata detail" }); await act(async () => button(submit!).props.onClick());
  const receipt = endpoint === "update-key" ? "Secret key updated" : endpoint === "rotate-key" ? "Secret value rotated" : "Secret key deleted";
  expect(view.root.findAll(n => n.props.role === "status" && label(n) === receipt)).toHaveLength(1); expect(text()).toContain("Synthetic"); expect(text()).not.toContain("synthetic private metadata detail");
  expect(apis.secret.post).toHaveBeenCalledTimes(1); expect(apis.secret.post.mock.calls[0]?.[0]).toBe(endpoint); expect(apis.secret.post.mock.calls[0]?.[1]).toMatchObject({ id: "key", authorizationPassword: "synthetic-proof" });
  if (endpoint === "update-key") expect(apis.secret.post.mock.calls[0]?.[1]).not.toHaveProperty("value");
  await act(async () => button("Retry metadata").props.onClick()); expect(apis.secret.post).toHaveBeenCalledTimes(1); expect(view.root.findAll(n => n.props.role === "status" && label(n) === receipt)).toHaveLength(1);
 });
 it("refused " + endpoint + " preserves current draft for explicit retry", async () => {
  await mount(); await open(choice!); fill("Your password", "synthetic-proof"); if (endpoint === "update-key") fill("Name", "Current edited name"); if (endpoint === "rotate-key") fill("New secret value", "synthetic-new-value");
  apis.secret.post.mockResolvedValueOnce({ ok: false, error: "synthetic private refusal" }); await act(async () => button(submit!).props.onClick()); expect(text()).not.toContain("synthetic private refusal"); expect(button(submit!).props.disabled).toBe(false);
  if (endpoint === "update-key") expect(field("Name").findByType("input").props.value).toBe("Current edited name"); if (endpoint === "rotate-key") expect(field("New secret value").findByType("input").props.value).toBe("synthetic-new-value");
  await act(async () => button(submit!).props.onClick()); expect(apis.secret.post).toHaveBeenCalledTimes(2);
 });
 it("old actor callback cannot issue captured " + endpoint, async () => {
  await mount(); await open(choice!); fill("Your password", "synthetic-proof"); if (endpoint === "rotate-key") fill("New secret value", "synthetic-new-value"); const submitOld = button(submit!).props.onClick;
  await act(async () => view.update(<SecretKeysLive currentUser={{ ...user, id: "other" }} />)); await act(async () => submitOld()); expect(apis.secret.post).not.toHaveBeenCalled();
 });
}
it("creation preserves its deliberate password/PIN-only policy and exact wire envelope", async () => {
 await act(async () => { view = create(<SecretKeysLive currentUser={{ ...user, pinConfigured: true, totpEnabled: true }} />); }); await open("Add Key"); fill("Name", "New synthetic key"); fill("Secret value", "synthetic-new-value"); await open("Continue"); fill("Your password", "synthetic-proof"); fill("Your PIN", "1234"); expect(view.root.findAll(n => n.props.label === "Your 2FA code")).toHaveLength(0); expect(button("Save Key").props.disabled).toBe(false);
 apis.secret.get.mockResolvedValueOnce({ ok: false }); await act(async () => button("Save Key").props.onClick()); expect(apis.secret.post).toHaveBeenCalledWith("create-key", expect.objectContaining({ name: "New synthetic key", value: "synthetic-new-value", authorizationPassword: "synthetic-proof", authorizationPin: "1234" })); expect(apis.secret.post.mock.calls[0]?.[1]).not.toHaveProperty("authorizationTotp"); expect(view.root.findAll(n => n.props.role === "status" && label(n) === "Secret key saved")).toHaveLength(1); await act(async () => button("Retry metadata").props.onClick()); expect(apis.secret.post).toHaveBeenCalledTimes(1);
});
it("wizard Back preserves chosen project and scope draft", async () => {
 apis.automation.post.mockResolvedValue({ ok: true, payload: { flows: [] } }); await mount(); await open("Add Key"); fill("Name", "New synthetic key"); fill("Secret value", "synthetic-new-value"); act(() => field("Scope").findByType("select").props.onChange({ target: { value: "flow" } })); await act(async () => field("Project").findByType("select").props.onChange({ target: { value: "a" } })); fill("Flow", "manual-flow-ref"); await open("Continue"); await open("Back"); expect(field("Project").findByType("select").props.value).toBe("a"); expect(field("Flow").findByType("input").props.value).toBe("manual-flow-ref");
});
it("unexpected update rejection releases original gate and retains metadata draft", async () => { await mount(); await open("Edit metadata"); fill("Name", "Current edited name"); fill("Your password", "synthetic-proof"); apis.secret.post.mockRejectedValueOnce(Error("synthetic private detail")); await act(async () => button("Save Changes").props.onClick()); expect(text()).not.toContain("synthetic private detail"); expect(field("Name").findByType("input").props.value).toBe("Current edited name"); expect(button("Save Changes").props.disabled).toBe(false); await act(async () => button("Save Changes").props.onClick()); expect(apis.secret.post).toHaveBeenCalledTimes(2); });
it("operation gate still synchronously prevents duplicate privileged writes", async () => { await mount(); await open("Delete key"); fill("Your password", "synthetic-proof"); const pending = deferred(); apis.secret.post.mockReturnValueOnce(pending.promise); const submit = button("Delete Key").props.onClick; act(() => { void submit(); void submit(); }); expect(apis.secret.post).toHaveBeenCalledTimes(1); await act(async () => pending.resolve({ ok: true })); });
for (const payload of [undefined, {}, { keys: [null] }, { keys: [{ ...key, name: {} }] }, { keys: [{ ...key, scope: {} }] }, { keys: [{ ...key, provider: {} }] }]) {
 it("malformed successful key metadata produces direct recovery rather than false empty", async () => { apis.secret.get.mockResolvedValue({ ok: true, payload }); await mount(); expect(text()).toContain("Secret Keys unavailable"); expect(button("Retry")).toBeDefined(); expect(text()).not.toContain("No secret keys have been added"); });
}
it("valid empty key list is distinct from unavailable metadata", async () => { apis.secret.get.mockResolvedValue({ ok: true, payload: { keys: [] } }); await mount(); expect(text()).toContain("No secret keys have been added"); expect(text()).not.toContain("Secret Keys unavailable"); });
it("unexpected initial snapshot rejection offers fixed read Retry", async () => { apis.secret.get.mockRejectedValueOnce(Error("synthetic private detail")); await mount(); expect(text()).not.toContain("synthetic private detail"); expect(button("Retry")).toBeDefined(); await act(async () => button("Retry").props.onClick()); expect(text()).toContain("Synthetic"); });
it("catalog failure exposes read-only Retry and preserves form draft", async () => { vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: vi.fn() } as unknown as Response); await mount(); await open("Add Key"); fill("Name", "Preserved draft"); expect(button("Retry scope choices")).toBeDefined(); await act(async () => button("Retry scope choices").props.onClick()); expect(field("Name").findByType("input").props.value).toBe("Preserved draft"); expect(apis.secret.post).not.toHaveBeenCalled(); });

it("old metadata read cannot publish into a replaced API workspace", async () => {
 const pending = deferred(); apis.secret.get.mockReturnValueOnce(pending.promise); await mount(); const old = apis.secret;
 apis.secret = { get: vi.fn().mockResolvedValue({ ok: true, payload: { keys: [{ ...key, id: "new", name: "New owner key" }] } }), post: vi.fn() }; await act(async () => view.update(<SecretKeysLive currentUser={user} />));
 await act(async () => pending.resolve({ ok: true, payload: { keys: [key] } })); expect(text()).toContain("New owner key"); expect(text()).not.toContain("Synthetic"); expect(old.get.mock.calls[0]?.[1].signal.aborted).toBe(true);
});
it("captured old metadata Retry refuses requests after actor replacement", async () => {
 apis.secret.get.mockResolvedValueOnce({ ok: false }); await mount(); const retry = button("Retry").props.onClick; await act(async () => view.update(<SecretKeysLive currentUser={{ ...user, id: "other" }} />)); const before = apis.secret.get.mock.calls.length; await act(async () => retry()); expect(apis.secret.get).toHaveBeenCalledTimes(before);
});
it("old authorization dismiss cannot close a newer same-kind edit", async () => {
 await mount(); await open("Edit metadata"); const close = view.root.findByProps({ "data-modal": "Edit Key Metadata" }).props["data-close"]; act(() => close()); await open("Edit metadata"); act(() => close()); expect(view.root.findAll(n => n.props["data-modal"] === "Edit Key Metadata")).toHaveLength(1);
});
it("pending update result cannot overwrite a replacement actor or trigger old follow-up read", async () => {
 await mount(); await open("Edit metadata"); fill("Your password", "synthetic-proof"); const pending = deferred(), old = apis.secret; old.post.mockReturnValueOnce(pending.promise); act(() => button("Save Changes").props.onClick()); await act(async () => view.update(<SecretKeysLive currentUser={{ ...user, id: "other" }} />)); const reads = old.get.mock.calls.length; await act(async () => pending.resolve({ ok: true })); expect(old.get).toHaveBeenCalledTimes(reads); expect(text()).not.toContain("Secret key updated");
});

it("confirmed removal invalidates an open editor instead of leaving a silently inert submit", async () => { await mount(); await open("Edit metadata"); fill("Your password", "synthetic-proof"); apis.secret.get.mockResolvedValue({ ok: true, payload: { keys: [] } }); await act(async () => button("Refresh").props.onClick()); expect(view.root.findAll(n => n.props["data-modal"] === "Edit Key Metadata")).toHaveLength(0); });
