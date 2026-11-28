// The key card: each state's words and action, the form, save -> checking -> new state in place, a client that
// cannot write yet, Add another key, Cancel, no password anywhere, Remove, and that a pasted key is never left in the DOM.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fake, withFakeDocument, type FakeElement } from "../../../testing/index.ts";
import {
  createModelKeyCard,
  defaultModelKeyProviders,
  modelAccessWords,
  type ModelAccessState,
  type ModelKeyHostAction,
  type ModelKeysPort,
  type ModelKeysResult
} from "../../index.ts";

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const one = (root: FakeElement, className: string): FakeElement => root.byClass(className)[0]!;
const field = (root: FakeElement, name: string): FakeElement => root.descendants().find((element) => element.getAttribute("name") === name)!;

type Calls = { saved: unknown[]; replaced: unknown[]; removed: unknown[]; checked: string[] };

/** A port over `state` that records its calls; a save moves it to `after` (default: ready). */
function port(initial: ModelAccessState, extra: Partial<ModelKeysPort> & { after?: ModelAccessState; keyId?: string; hold?: Promise<void> } = {}) {
  let state = initial;
  const calls: Calls = { saved: [], replaced: [], removed: [], checked: [] };
  const { after, keyId, hold, ...overrides } = extra;
  const next: ModelAccessState = after ?? { kind: "ready", provider: "Anthropic", keyName: "Anthropic key" };
  const value: ModelKeysPort = {
    canWrite: true,
    readState: async () => ({ ok: true, state, ...(keyId === undefined ? {} : { keyId }) }),
    save: async (request) => {
      calls.saved.push(request);
      await hold;
      state = next;
      return { ok: true, keyId: "k1" };
    },
    replace: async (id, key) => {
      calls.replaced.push([id, key]);
      await hold;
      state = next;
      return { ok: true };
    },
    remove: async (id) => {
      calls.removed.push([id]);
      state = { kind: "no-key" };
      return { ok: true };
    },
    check: async (id) => {
      calls.checked.push(id);
      return { ok: true };
    },
    ...overrides
  };
  return { value, calls };
}

function mount(fakePort: ModelKeysPort, variant: "full" | "compact" = "compact") {
  const actions: ModelKeyHostAction[] = [];
  const card = createModelKeyCard({ port: fakePort, variant, providers: defaultModelKeyProviders, onAction: (action) => actions.push(action) });
  return { card, root: fake(card.element), actions };
}

const STATES: ReadonlyArray<ModelAccessState> = [
  { kind: "ready", provider: "Anthropic", keyName: "Work key" },
  { kind: "no-key" },
  { kind: "cant-open", keyName: "Work key" },
  { kind: "not-accepted", provider: "DeepSeek", keyName: "Home key" },
  { kind: "unreachable", provider: "Anthropic" },
  { kind: "no-credit", provider: "Anthropic", keyName: "Work key" },
  { kind: "update-fluxiq" }
];

test("while the state is read the card says it is checking; each state then shows its badge, sentence and one action", async () => {
  await withFakeDocument(async () => {
    const first = mount(port(STATES[0]!).value);
    assert.equal(one(first.root, "model-key-line").textContent, "Checking your AI key...");
    assert.equal(one(first.root, "model-key-badge").hidden, true);
    for (const state of STATES) {
      const { root } = mount(port(state).value);
      await settle();
      const words = modelAccessWords(state);
      assert.equal(one(root, "model-key-badge").textContent, words.badge);
      assert.equal(one(root, "model-key-line").textContent, words.sentence);
      assert.equal(one(root, "model-key-action").textContent, words.action.label);
      assert.equal(one(root, "model-key-action").hidden, false);
    }
  });
});

test("Try now reads the key again in place; nothing goes to the host", async () => {
  await withFakeDocument(async () => {
    let reads = 0;
    const { value } = port(STATES[4]!);
    const counted: ModelKeysPort = {
      ...value,
      readState: async () => {
        reads += 1;
        return value.readState();
      }
    };
    const { root, actions } = mount(counted);
    await settle();
    const before = reads;
    one(root, "model-key-action").dispatch("click");
    await settle();
    assert.deepEqual(actions, []);
    assert.equal(reads, before + 1);
  });
});

test("Change model and How to update go to the host; the other three open the form", async () => {
  await withFakeDocument(async () => {
    const pairs: Array<[ModelAccessState, ModelKeyHostAction]> = [
      [STATES[0]!, "change-model"],
      [STATES.find((state) => state.kind === "update-fluxiq")!, "how-to-update"]
    ];
    for (const [state, expected] of pairs) {
      const { root, actions } = mount(port(state).value);
      await settle();
      one(root, "model-key-action").dispatch("click");
      assert.deepEqual(actions, [expected]);
      assert.equal(root.byClass("model-key-form").length, 0);
    }
    for (const state of [STATES[1]!, STATES[2]!, STATES[3]!]) {
      const { root, actions } = mount(port(state, { keyId: "k1" }).value);
      await settle();
      one(root, "model-key-action").dispatch("click");
      assert.deepEqual(actions, []);
      assert.equal(root.byClass("model-key-form").length, 1, state.kind);
    }
  });
});

test("the add form: Anthropic first and default, DeepSeek, a masked key with its link, an optional name, no password", async () => {
  await withFakeDocument(async () => {
    const { root } = mount(port({ kind: "no-key" }).value);
    await settle();
    one(root, "model-key-action").dispatch("click");
    const provider = field(root, "provider");
    assert.deepEqual(provider.children.map((option) => option.textContent), ["Anthropic (Claude)", "DeepSeek"]);
    assert.equal(provider.value, "anthropic");
    assert.equal(field(root, "key").getAttribute("type"), "password", "the key is masked");
    assert.equal(one(root, "model-key-link").textContent, "Where do I get one?");
    assert.equal(one(root, "model-key-link").getAttribute("href"), "https://console.anthropic.com/settings/keys");
    provider.value = "deepseek";
    provider.dispatch("change");
    assert.equal(one(root, "model-key-link").getAttribute("href"), "https://platform.deepseek.com/api_keys");
    assert.equal(field(root, "name").getAttribute("placeholder"), "DeepSeek key");
    assert.equal(field(root, "password"), undefined, "no password field");
    assert.equal(one(root, "model-key-save").textContent, "Save and check");
  });
});

test("Save and check moves to checking, then to the new state in place, sending the key once and asking the host to check it", async () => {
  await withFakeDocument(async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    const { value, calls } = port({ kind: "no-key" }, { hold });
    const { root } = mount(value);
    await settle();
    one(root, "model-key-action").dispatch("click");
    field(root, "key").value = "sk-ant-SECRET-1234";
    one(root, "model-key-save").dispatch("click");
    await settle();
    assert.equal(one(root, "model-key-line").textContent, "Checking with Anthropic...");
    assert.equal(one(root, "model-key-save").disabled, true);
    assert.equal(field(root, "key").disabled, true);
    release();
    await settle();
    await settle();
    assert.deepEqual(calls.saved, [{ provider: "anthropic", name: "Anthropic key", value: "sk-ant-SECRET-1234" }]);
    assert.deepEqual(calls.checked, ["k1"]);
    assert.equal(one(root, "model-key-badge").textContent, "Ready");
    assert.equal(one(root, "model-key-line").textContent, "Anthropic is ready, using Anthropic key.");
    assert.equal(root.byClass("model-key-form").length, 0, "the form is gone");
  });
});

test("a name the person gave is sent; an empty key is refused before anything is sent", async () => {
  await withFakeDocument(async () => {
    const { value, calls } = port({ kind: "no-key" });
    const { root } = mount(value);
    await settle();
    one(root, "model-key-action").dispatch("click");
    one(root, "model-key-save").dispatch("click");
    await settle();
    assert.equal(one(root, "model-key-problem").textContent, "Paste your key first.");
    assert.deepEqual(calls.saved, []);
    field(root, "key").value = " abc ";
    field(root, "name").value = "Work key";
    one(root, "model-key-save").dispatch("click");
    await settle();
    assert.deepEqual(calls.saved, [{ provider: "anthropic", name: "Work key", value: "abc" }]);
  });
});

test("a refused save says the host's sentence and keeps the form", async () => {
  await withFakeDocument(async () => {
    const failing: Partial<ModelKeysPort> = { save: async (): Promise<ModelKeysResult<{ keyId?: string }>> => ({ ok: false, message: "That did not work." }) };
    const { root } = mount(port({ kind: "no-key" }, failing).value);
    await settle();
    one(root, "model-key-action").dispatch("click");
    field(root, "key").value = "abc";
    one(root, "model-key-save").dispatch("click");
    await settle();
    assert.equal(one(root, "model-key-problem").textContent, "That did not work.");
    assert.equal(one(root, "model-key-problem").hidden, false);
    assert.equal(one(root, "model-key-save").disabled, false);
    assert.equal(root.byClass("model-key-form").length, 1);
  });
});

test("Paste it again replaces the saved key by its id, with the key field alone", async () => {
  await withFakeDocument(async () => {
    const { value, calls } = port({ kind: "cant-open", keyName: "Work key" }, { keyId: "k9", after: { kind: "ready", provider: "Anthropic", keyName: "Work key" } });
    const { root } = mount(value);
    await settle();
    one(root, "model-key-action").dispatch("click");
    assert.equal(field(root, "provider"), undefined);
    assert.equal(field(root, "name"), undefined);
    field(root, "key").value = "fresh";
    one(root, "model-key-save").dispatch("click");
    await settle();
    await settle();
    assert.deepEqual(calls.replaced, [["k9", "fresh"]]);
    assert.equal(one(root, "model-key-line").textContent, "Anthropic is ready, using Work key.");
  });
});

test("where the client cannot write there is no form: the state, a line to the FluxIQ panel, and one Open in FluxIQ panel action", async () => {
  await withFakeDocument(async () => {
    const { value, calls } = port({ kind: "no-key" }, { canWrite: false, keyId: "k9" });
    const { root, actions } = mount(value, "full");
    await settle();
    assert.equal(one(root, "model-key-badge").textContent, "No key");
    assert.equal(one(root, "model-key-panel-note").hidden, false);
    assert.equal(one(root, "model-key-panel-note").textContent, "Add or change your AI key in the FluxIQ panel.");
    const action = one(root, "model-key-action");
    assert.equal(action.textContent, "Open in FluxIQ panel");
    action.dispatch("click");
    assert.deepEqual(actions, ["open-fluxiq"]);
    assert.equal(root.byClass("model-key-form").length, 0, "no form");
    assert.equal(one(root, "model-key-add-another").hidden, true);
    assert.equal(one(root, "model-key-remove-link").hidden, true);
    assert.deepEqual(calls.saved, []);
  });
});

test("a key that is not accepted offers Open in FluxIQ panel, not Replace key, when the client cannot write", async () => {
  await withFakeDocument(async () => {
    const { value } = port({ kind: "not-accepted", provider: "Anthropic", keyName: "Work key" }, { canWrite: false, keyId: "k9" });
    const { root, actions } = mount(value);
    await settle();
    assert.equal(one(root, "model-key-action").textContent, "Open in FluxIQ panel");
    one(root, "model-key-action").dispatch("click");
    assert.deepEqual(actions, ["open-fluxiq"]);
    assert.equal(root.byClass("model-key-form").length, 0);
  });
});

test("a key needs no password: the form has no password field and Save sends only the key", async () => {
  await withFakeDocument(async () => {
    const { value, calls } = port({ kind: "no-key" });
    const { root } = mount(value);
    await settle();
    one(root, "model-key-action").dispatch("click");
    assert.equal(field(root, "password"), undefined);
    field(root, "key").value = "abc";
    one(root, "model-key-save").dispatch("click");
    await settle();
    assert.deepEqual(calls.saved, [{ provider: "anthropic", name: "Anthropic key", value: "abc" }]);
  });
});

test("the full card adds another key through its own form while a key is saved; Cancel closes the form", async () => {
  await withFakeDocument(async () => {
    const ready: ModelAccessState = { kind: "ready", provider: "Anthropic", keyName: "Work key" };
    const compact = mount(port(ready, { keyId: "k1" }).value, "compact");
    await settle();
    assert.equal(one(compact.root, "model-key-add-another").hidden, true, "the compact card offers no second key");
    const none = mount(port({ kind: "no-key" }).value, "full");
    await settle();
    assert.equal(one(none.root, "model-key-add-another").hidden, true, "with no key the one action already adds");
    const { value, calls } = port(ready, { keyId: "k1" });
    const { root } = mount(value, "full");
    await settle();
    const another = one(root, "model-key-add-another");
    assert.equal(another.hidden, false);
    assert.equal(another.textContent, "Add another key");
    another.dispatch("click");
    assert.equal(root.byClass("model-key-form").length, 1);
    assert.equal(one(root, "model-key-add-another").hidden, true, "hidden while the form is open");
    one(root, "model-key-keep").dispatch("click");
    assert.equal(root.byClass("model-key-form").length, 0, "Cancel closes the form");
    assert.deepEqual(calls.saved, []);
    one(root, "model-key-add-another").dispatch("click");
    field(root, "name").value = "Home key";
    field(root, "key").value = "sk-two";
    one(root, "model-key-save").dispatch("click");
    await settle();
    await settle();
    assert.deepEqual(calls.saved, [{ provider: "anthropic", name: "Home key", value: "sk-two" }]);
    assert.equal(root.byClass("model-key-form").length, 0);
  });
});

test("after a save the pasted key is nowhere in the DOM", async () => {
  await withFakeDocument(async () => {
    const SECRET = "sk-ant-NEVER-SHOWN-9876";
    for (const outcome of ["ok", "refused"] as const) {
      const failing: Partial<ModelKeysPort> = outcome === "ok" ? {} : { save: async () => ({ ok: false, message: "Not saved." }) };
      const { root } = mount(port({ kind: "no-key" }, failing).value);
      await settle();
      one(root, "model-key-action").dispatch("click");
      field(root, "key").value = SECRET;
      one(root, "model-key-save").dispatch("click");
      await settle();
      await settle();
      if (outcome === "refused") field(root, "key").value = "";
      for (const element of [root, ...root.descendants()]) {
        assert.ok(!element.value.includes(SECRET), `${outcome}: value`);
        assert.ok(![...element.attributes.values()].some((text) => text.includes(SECRET)), `${outcome}: attribute`);
        assert.ok(!element.textContent.includes(SECRET), `${outcome}: text`);
      }
    }
  });
});

test("the full card removes a key after one inline confirm; the compact card offers no Remove", async () => {
  await withFakeDocument(async () => {
    const ready: ModelAccessState = { kind: "ready", provider: "Anthropic", keyName: "Work key" };
    const compact = mount(port(ready, { keyId: "k1" }).value, "compact");
    await settle();
    assert.equal(one(compact.root, "model-key-remove-link").hidden, true);
    const { value, calls } = port(ready, { keyId: "k1" });
    const { root } = mount(value, "full");
    await settle();
    one(root, "model-key-remove-link").dispatch("click");
    assert.equal(one(root, "model-key-remove-line").textContent, "Remove Work key? FluxIQ will need a new AI key to build.");
    one(root, "model-key-keep").dispatch("click");
    assert.equal(root.byClass("model-key-remove").length, 0);
    assert.deepEqual(calls.removed, [], "Keep it removes nothing");
    one(root, "model-key-remove-link").dispatch("click");
    one(root, "model-key-remove-confirm").dispatch("click");
    await settle();
    await settle();
    assert.deepEqual(calls.removed, [["k1"]], "one press removes it, with no password");
    assert.equal(one(root, "model-key-badge").textContent, "No key");
  });
});

test("a failed read of the state says so plainly, and destroy stops the card drawing", async () => {
  await withFakeDocument(async () => {
    const { root, card } = mount(port({ kind: "no-key" }, { readState: async () => ({ ok: false, message: "x" }) }).value);
    await settle();
    assert.equal(one(root, "model-key-line").textContent, "Couldn't check your AI key just now.");
    card.destroy();
    await card.refresh();
  });
});

test("a pushed state is drawn at once with no read; null reads again; destroy unsubscribes", async () => {
  await withFakeDocument(async () => {
    let reads = 0;
    let push: ((state: ModelAccessState | null) => void) | undefined;
    let unsubscribed = 0;
    const { value } = port({ kind: "no-key" });
    const heard: Array<ModelAccessState | null> = [];
    const watched: ModelKeysPort = {
      ...value,
      readState: async () => {
        reads += 1;
        return value.readState();
      },
      subscribe: (listener) => {
        push = listener;
        return () => {
          unsubscribed += 1;
        };
      }
    };
    const card = createModelKeyCard({ port: watched, variant: "compact", providers: defaultModelKeyProviders, onAction: () => undefined, onState: (state) => heard.push(state) });
    const root = fake(card.element);
    await settle();
    assert.equal(reads, 1);
    assert.equal(one(root, "model-key-badge").textContent, "No key");
    push!({ kind: "no-credit", provider: "Anthropic", keyName: "Work key" });
    assert.equal(reads, 1, "a pushed state needs no read");
    assert.equal(one(root, "model-key-badge").textContent, "No credit");
    assert.equal(one(root, "model-key-action").textContent, "Replace key");
    assert.deepEqual(heard.at(-1), { kind: "no-credit", provider: "Anthropic", keyName: "Work key" });
    push!({ kind: "ready", provider: "Anthropic", keyName: "Work key" });
    assert.equal(one(root, "model-key-badge").textContent, "Ready");
    push!(null);
    await settle();
    assert.equal(reads, 2, "null reads again");
    assert.equal(one(root, "model-key-badge").textContent, "No key", "the read answer is drawn");
    card.destroy();
    assert.equal(unsubscribed, 1);
    push!({ kind: "ready", provider: "Anthropic", keyName: "Work key" });
    assert.equal(heard.at(-1)?.kind, "no-key", "a destroyed card hears nothing");
  });
});

test("Change model is the same panel action when the client cannot write, and Try now stays", async () => {
  await withFakeDocument(async () => {
    const { value } = port({ kind: "ready", provider: "Anthropic", keyName: "Work key" }, { canWrite: false });
    const { root, actions } = mount(value);
    await settle();
    assert.equal(one(root, "model-key-action").textContent, "Open in FluxIQ panel");
    one(root, "model-key-action").dispatch("click");
    assert.deepEqual(actions, ["open-fluxiq"]);
  });
  await withFakeDocument(async () => {
    const { value } = port({ kind: "unreachable", provider: "Anthropic" }, { canWrite: false });
    const { root } = mount(value);
    await settle();
    assert.equal(one(root, "model-key-action").textContent, "Try now");
  });
});
