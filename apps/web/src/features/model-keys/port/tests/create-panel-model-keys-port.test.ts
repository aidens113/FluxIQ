import { createModelKeyCard, defaultModelKeyProviders, modelAccessWords } from "@fluxiq/ui-components";
import { fake, withFakeDocument } from "@fluxiq/ui-components/testing";
import { describe, expect, it, vi } from "vitest";
import type { ProgramCommandTransport } from "../../../automation-studio/data/program-transport";
import type { ApiResponse } from "../../../programs/program-api";
import { PanelChangeConnection, type PanelChangeEventStream, type PanelChangeEventType } from "../../../panel-changes";
import { createPanelModelKeysPort } from "../create-panel-model-keys-port";

type Call = { method: "get" | "post"; endpoint: string; payload?: unknown };

/** A Secret Keys transport that records every call and answers with `answer`. */
function transport(answer: (call: Call) => ApiResponse<unknown>) {
  const calls: Call[] = [];
  const secretKeys: ProgramCommandTransport = {
    get: async <T,>(endpoint: string): Promise<ApiResponse<T>> => {
      const call: Call = { method: "get", endpoint };
      calls.push(call);
      return answer(call) as ApiResponse<T>;
    },
    post: async <T,>(endpoint: string, payload: unknown): Promise<ApiResponse<T>> => {
      const call: Call = { method: "post", endpoint, payload };
      calls.push(call);
      return answer(call) as ApiResponse<T>;
    }
  };
  return { secretKeys, calls };
}

const key = { id: "k1", name: "Work key", provider: "anthropic", model: "claude-sonnet-5-5" };
const SNAPSHOTS = {
  ready: { status: "ready", message: "Ready.", key, lastCall: { outcome: "answered", atMs: 5 } },
  noKey: { status: "no_key", message: "Add an AI key.", key: null, lastCall: null },
  cantOpen: { status: "key_unopenable", message: "Cannot open.", key, lastCall: null, unopenableCode: "ciphertext_invalid" },
  notAccepted: { status: "provider_refused", message: "Refused.", key, lastCall: { outcome: "provider_refused", atMs: 6 } },
  noCredit: { status: "no_credit", message: "No credit.", key, lastCall: { outcome: "no_credit", atMs: 8 } },
  unreachable: { status: "provider_unreachable", message: "Unreachable.", key, lastCall: { outcome: "provider_unreachable", atMs: 7 } }
};
const reading = (modelAccess: unknown) => transport(() => ({ ok: true, payload: { keys: [], modelAccess } }));

describe("the panel's key port, reading state from the snapshot", () => {
  it.each([
    ["ready", SNAPSHOTS.ready, "ready", "Ready"],
    ["no key", SNAPSHOTS.noKey, "no-key", "No key"],
    ["can't open", SNAPSHOTS.cantOpen, "cant-open", "Can't open"],
    ["not accepted", SNAPSHOTS.notAccepted, "not-accepted", "Not accepted"],
    ["no credit", SNAPSHOTS.noCredit, "no-credit", "No credit"],
    ["unreachable", SNAPSHOTS.unreachable, "unreachable", "Can't reach Anthropic"],
    ["an old FluxIQ, with no state", undefined, "update-fluxiq", "Update FluxIQ"]
  ])("shows %s", async (_name, modelAccess, kind, badge) => {
    const { secretKeys, calls } = reading(modelAccess);
    const read = await createPanelModelKeysPort(secretKeys).readState();
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.state.kind).toBe(kind);
    expect(modelAccessWords(read.state).badge).toBe(badge);
    expect(calls).toEqual([{ method: "get", endpoint: "snapshot" }]);
  });

  it("gives the key's id for Replace and Remove, and none when there is no key", async () => {
    const withKey = await createPanelModelKeysPort(reading(SNAPSHOTS.ready).secretKeys).readState();
    expect(withKey.ok && withKey.keyId).toBe("k1");
    const without = await createPanelModelKeysPort(reading(SNAPSHOTS.noKey).secretKeys).readState();
    expect(without.ok && "keyId" in without).toBe(false);
  });

  it("reads a state that contradicts itself as an old FluxIQ, never as ready", async () => {
    const read = await createPanelModelKeysPort(reading({ ...SNAPSHOTS.ready, key: null }).secretKeys).readState();
    expect(read.ok && read.state.kind).toBe("update-fluxiq");
  });

  it("says it could not check when the snapshot could not be read", async () => {
    const { secretKeys } = transport(() => ({ ok: false, error: "private detail" }));
    expect(await createPanelModelKeysPort(secretKeys).readState()).toEqual({ ok: false, message: "Couldn't check your AI key just now." });
  });

  it("shows the checked state a create or rotate answered with, without reading the snapshot again", async () => {
    const { secretKeys, calls } = transport((call) => (call.method === "post" ? { ok: true, payload: { id: "k1", modelAccess: SNAPSHOTS.notAccepted } } : { ok: true, payload: { modelAccess: SNAPSHOTS.ready } }));
    const port = createPanelModelKeysPort(secretKeys);
    await port.save({ provider: "anthropic", value: "sk-ant-x" });
    const first = await port.readState();
    expect(first.ok && first.state.kind).toBe("not-accepted");
    expect(calls.filter((call) => call.endpoint === "snapshot")).toHaveLength(0);
    const second = await port.readState();
    expect(second.ok && second.state.kind).toBe("ready");
    expect(calls.filter((call) => call.endpoint === "snapshot")).toHaveLength(1);
  });

  it("can write, and has no password or PIN anywhere", () => {
    const port = createPanelModelKeysPort(reading(undefined).secretKeys);
    expect(JSON.stringify(Object.keys(port))).not.toMatch(/password/iu);
    expect(port.canWrite).toBe(true);
    expect(JSON.stringify(Object.keys(port))).not.toMatch(/pin/iu);
  });
});

describe("the panel's key port, changing keys", () => {
  it("saves in one create-key call with the provider named, with no password and never a PIN", async () => {
    const { secretKeys, calls } = transport(() => ({ ok: true, payload: { id: "new-key" } }));
    const result = await createPanelModelKeysPort(secretKeys).save({ provider: "anthropic", name: "Work", value: "sk-new" });
    expect(result).toEqual({ ok: true, keyId: "new-key" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "post", endpoint: "create-key", payload: { name: "Work", value: "sk-new", kind: "llm", provider: "Anthropic", enabled: true } });
    expect(JSON.stringify(calls)).not.toMatch(/pin|password/iu);
  });

  it("replaces in one rotate-key call", async () => {
    const { secretKeys, calls } = transport(() => ({ ok: true }));
    expect(await createPanelModelKeysPort(secretKeys).replace("k1", "sk-new")).toEqual({ ok: true });
    expect(calls).toEqual([{ method: "post", endpoint: "rotate-key", payload: { id: "k1", value: "sk-new" } }]);
  });

  it("removes in ONE delete-key call with no password, no press grant minted first and no PIN", async () => {
    const { secretKeys, calls } = transport(() => ({ ok: true }));
    expect(await createPanelModelKeysPort(secretKeys).remove("k1")).toEqual({ ok: true });
    expect(calls).toEqual([{ method: "post", endpoint: "delete-key", payload: { id: "k1" } }]);
    expect(JSON.stringify(calls)).not.toMatch(/mint-press-grant|identity-access|pin/iu);
  });

  it("says the engine's own sentence when a change is refused, and does not call again", async () => {
    const { secretKeys, calls } = transport(() => ({ ok: false, error: "That key is not yours to change." }));
    const port = createPanelModelKeysPort(secretKeys);
    expect(await port.remove("k1")).toEqual({ ok: false, message: "That key is not yours to change." });
    expect(await port.replace("k1", "sk")).toEqual({ ok: false, message: "That key is not yours to change." });
    expect(calls).toHaveLength(2);
  });

  it("tells listeners after a change that worked, and not after one that did not", async () => {
    let worked = true;
    const { secretKeys } = transport(() => (worked ? { ok: true } : { ok: false, error: "no" }));
    const port = createPanelModelKeysPort(secretKeys);
    const heard = vi.fn();
    const stop = port.onChange(heard);
    await port.remove("k1");
    worked = false;
    await port.remove("k1");
    expect(heard).toHaveBeenCalledTimes(1);
    port.notify();
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
    port.notify();
    expect(heard).toHaveBeenCalledTimes(2);
  });
});

describe("the shared card over the panel's port", () => {
  it("draws each of the six states from the snapshot, never left on checking", async () => {
    await withFakeDocument(async () => {
      const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
      for (const [modelAccess, kind] of [[SNAPSHOTS.ready, "ready"], [SNAPSHOTS.noKey, "no-key"], [SNAPSHOTS.cantOpen, "cant-open"], [SNAPSHOTS.notAccepted, "not-accepted"], [SNAPSHOTS.unreachable, "unreachable"], [undefined, "update-fluxiq"]] as const) {
        const port = createPanelModelKeysPort(reading(modelAccess).secretKeys);
        const card = createModelKeyCard({ port, variant: "full", providers: defaultModelKeyProviders, onAction: () => undefined });
        await settle();
        const root = fake(card.element);
        expect(card.element.getAttribute("data-state")).toBe(kind);
        expect(root.byClass("model-key-line")[0]!.textContent).not.toBe("Checking your AI key...");
        card.destroy();
      }
    });
  });
});

/** The page's change connection over a stream the test drives. */
function pushed() {
  const handlers: Array<{ type: PanelChangeEventType; call: (event: { data?: unknown }) => void }> = [];
  let opened = 0;
  const stream: PanelChangeEventStream = {
    readyState: 1,
    onopen: null,
    onerror: null,
    addEventListener: (type, call) => void handlers.push({ type, call }),
    close: () => undefined
  };
  const connection = new PanelChangeConnection({ openStream: () => stream, onWake: () => () => undefined });
  return {
    connection,
    open: () => {
      opened += 1;
      stream.onopen?.(new Event("open"));
    },
    send: (type: PanelChangeEventType, data: unknown) => handlers.filter((handler) => handler.type === type).forEach((handler) => handler.call({ data: JSON.stringify(data) })),
    opens: () => opened
  };
}

describe("the panel's key port, hearing the key's pushed state", () => {
  it("tells subscribers and onChange listeners to read again on a model-access event, and not on others", () => {
    const wire = pushed();
    const port = createPanelModelKeysPort(reading(undefined).secretKeys, () => wire.connection);
    const subscribed = vi.fn();
    const changed = vi.fn();
    const stopSubscribe = port.subscribe(subscribed);
    const stopChange = port.onChange(changed);
    wire.open();
    expect(subscribed).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    wire.send("gateway", { version: 1 });
    wire.send("model-access", { version: 2 });
    expect(subscribed.mock.calls).toEqual([[null]]);
    expect(changed).toHaveBeenCalledTimes(1);
    stopSubscribe();
    stopChange();
    wire.send("model-access", { version: 3 });
    expect(subscribed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("reads again after the stream re-opens, since a change may have been missed", () => {
    const wire = pushed();
    const port = createPanelModelKeysPort(reading(undefined).secretKeys, () => wire.connection);
    const subscribed = vi.fn();
    port.subscribe(subscribed);
    wire.open();
    wire.open();
    expect(subscribed.mock.calls).toEqual([[null]]);
  });
});
