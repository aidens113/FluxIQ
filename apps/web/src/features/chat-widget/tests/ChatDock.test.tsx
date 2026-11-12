// The Studio's conversation window, mounted as the panel mounts it: the
// package's window and chat over the panel's own ports, under a fake DOM.
// What the old React dock proved is proved here against the real mount:
// the launcher on the landing screen and over a project, the badge while
// collapsed, collapse without unmounting, Escape under a dialog, the thread
// the person left, what is on screen with each message, the PIN dialog (a
// refused PIN keeps it open, a cancel sends nothing), a drawn attachment, and
// the same chat on the chat-alone route. The package tests the rest (the
// window's chrome, unknown references, the draft kept out of the browser).

import { FakeElement, fake, withFakeDocument } from "@fluxiq/ui-components/testing";
import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { ApiResponse } from "../../programs/program-api";
import { fakeProgramApi, type FakeProgramApi } from "./fake-program-api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const shared = vi.hoisted(() => ({
  studio: null as unknown,
  secrets: null as unknown,
  pushed: [] as string[],
  ran: [] as Array<Record<string, unknown>>
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (href: string) => shared.pushed.push(href) }) }));
vi.mock("../../automation-studio/data/use-program-transport", () => ({
  useProgramTransport: (programId: string) => (programId === "secret-keys" ? shared.secrets : shared.studio)
}));
vi.mock("../../programs/components/overlays/Modal", () => ({
  Modal: (props: { children: React.ReactNode; description?: string; title: string }) => (
    <section aria-label={props.title}>
      <p>{props.description}</p>
      {props.children}
    </section>
  )
}));
vi.mock("../../automation-studio/conversation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../automation-studio/conversation")>()),
  runConversationCapability: async (_api: unknown, payload: Record<string, unknown>) => {
    shared.ran.push(payload);
    return { capability: null, confidence: 1, arguments: {}, outcome: { status: "done", summary: "Done." } };
  }
}));

const { ChatDock } = await import("../ChatDock");
const { ChatWidgetPage } = await import("../ChatWidgetPage");
const { commitAutomationStudioMutation } = await import("../../automation-studio/stores");

const THREAD = {
  conversationId: "conversation.1",
  projectId: "project.one",
  subject: { kind: "project", id: "project.one" },
  status: "open",
  title: "Kitchen",
  revision: 2,
  turnCount: 1,
  pendingAskCount: 0,
  createdAt: 1,
  updatedAt: 2
};

const turn = (overrides: Record<string, unknown> = {}) => ({
  turnId: "turn.1",
  conversationId: "conversation.1",
  ordinal: 1,
  author: "automation",
  createdAt: 1_790_000_000_000,
  text: "Reading the page.",
  attachment: null,
  ask: null,
  ...overrides
});

const CONFIRM_ASK = { askId: "panel-command.1", conversationId: "conversation.1", turnId: "turn.2", kind: "confirm", status: "pending", parks: false, consequences: ["delete"], control: { name: "Delete a Flow", kind: "panel action" } };
const INVOCATION = Buffer.from(JSON.stringify({ capabilityId: "flow.delete", arguments: { flowId: "flow.toaster-2" } }), "utf8").toString("base64url");
const CONFIRMATION = turn({
  turnId: "turn.2",
  ordinal: 2,
  text: "You asked me to delete a Flow. Confirm it here with your PIN, or cancel.",
  attachment: { kind: "panel-capability", ref: INVOCATION },
  ask: CONFIRM_ASK
});

type World = { threads: unknown[]; turns: unknown[]; answer: (payload: Record<string, unknown> | undefined) => ApiResponse<unknown> };

function world(overrides: Partial<World> = {}): { api: FakeProgramApi; state: World } {
  const state: World = { threads: [THREAD], turns: [turn()], answer: () => ({ ok: true, payload: {} }), ...overrides };
  const api = fakeProgramApi({
    "list-conversations": () => ({ ok: true, payload: { conversations: state.threads } }),
    "get-conversation": () => ({ ok: true, payload: { conversation: { conversation: state.threads[0], turns: state.turns, hasMore: false } } }),
    "get-activity": { ok: true, payload: { current: null, recent: [] } },
    "append-turn": { ok: true, payload: {} },
    "open-conversation": { ok: true, payload: { conversation: THREAD } },
    "answer-ask": (payload) => state.answer(payload)
  });
  return { api, state };
}

const settle = async () => {
  for (let round = 0; round < 8; round += 1) await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
};

type Mounted = { renderer: ReactTestRenderer; host: FakeElement; keydown(key: string): void };

async function mount(element: React.ReactElement, api: FakeProgramApi, body: (mounted: Mounted) => Promise<void>): Promise<void> {
  shared.studio = api;
  shared.secrets = fakeProgramApi({ snapshot: { ok: true, payload: { keys: [{ kind: "llm", provider: "anthropic", enabled: true }] } } });
  shared.pushed.length = 0;
  shared.ran.length = 0;
  await withFakeDocument(async () => {
    const listeners = new Set<(event: { key: string }) => void>();
    const document = globalThis.document as unknown as Record<string, unknown>;
    document.addEventListener = (type: string, listener: (event: { key: string }) => void) => {
      if (type === "keydown") listeners.add(listener);
    };
    document.removeEventListener = (type: string, listener: (event: { key: string }) => void) => {
      listeners.delete(listener);
    };
    document.querySelector = () => (modalOpen ? {} : null);
    modalOpen = false;
    const host = new FakeElement("div");
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(element, { createNodeMock: () => host }); });
    await settle();
    try {
      await body({ renderer, host, keydown: (key) => [...listeners].forEach((listener) => listener({ key })) });
    } finally {
      await act(async () => renderer.unmount());
    }
  });
}

let modalOpen = false;

const launcher = (host: FakeElement) => host.byClass("chat-window-launcher")[0]!;
const windowPanel = (host: FakeElement) => host.byClass("chat-window-panel")[0]!;
// The conversation list's own Delete confirmation also has a Cancel, so a card's button is found outside the list.
const buttonNamed = (root: FakeElement, label: string) => root.descendants().find((node) => node.tagName === "BUTTON" && node.textContent === label && !String(node.className ?? "").includes("chat-thread-"));

function reactButton(root: ReactTestInstance, label: string): ReactTestInstance {
  const found = root.findAllByType("button").find((candidate) =>
    candidate.findAll((node: ReactTestInstance) => node.children.some((child) => child === label), { deep: true }).length > 0);
  if (!found) throw new Error(`no button labelled ${label}`);
  return found;
}

const textOf = (renderer: ReactTestRenderer): string => renderer.root.findAll((node) => typeof node.type === "string").flatMap((node) => node.children.filter((child) => typeof child === "string")).join(" ");

async function send(host: FakeElement, text: string): Promise<void> {
  const box = host.descendants().find((node) => node.id === "conversationInput")!;
  box.value = text;
  box.dispatch("input");
  await act(async () => box.dispatch("keydown", { key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, preventDefault: () => undefined }));
  await settle();
}

describe("the window over the Studio", () => {
  it("is on the landing screen with no project, listing every project's threads without a status filter", async () => {
    const { api } = world();
    await mount(<ChatDock projectId={null} />, api, async ({ host }) => {
      expect(launcher(host)).toBeTruthy();
      expect(launcher(host).getAttribute("aria-label")).toBe("Open the FluxIQ conversation");
      expect(api.sentTo("list-conversations")[0]).toEqual({ projectId: null, limit: 25 });
      // Collapsed, only the thread list is read; the thread itself is read once the window opens.
      expect(api.sentTo("get-conversation")).toEqual([]);
      await act(async () => launcher(host).dispatch("click"));
      await settle();
      // With no project open the chat reads the thread it opened on, in that thread's own project.
      expect(api.sentTo("get-conversation")[0]).toMatchObject({ projectId: "project.one", conversationId: "conversation.1" });
      expect(api.sentTo("get-activity")[0]).toEqual({ projectId: "project.one" });
    });
  });

  it("asks for no activity and shows no failure while there is no project and no thread", async () => {
    const { api } = world({ threads: [] });
    await mount(<ChatDock projectId={null} />, api, async ({ host }) => {
      expect(api.sentTo("get-activity")).toEqual([]);
      expect(api.sentTo("get-conversation")).toEqual([]);
      expect(host.textContent).not.toContain("Couldn't");
      expect(host.textContent).toContain("Open a project to start a conversation.");
    });
  });

  it("lights the badge while collapsed, because the chat keeps reading the thread list", async () => {
    const { api, state } = world({ threads: [{ ...THREAD, pendingAskCount: 1 }] });
    state.turns = [CONFIRMATION];
    await mount(<ChatDock projectId="project.one" projectName="Company website" />, api, async ({ host }) => {
      expect(windowPanel(host).hidden).toBe(true);
      expect(launcher(host).getAttribute("data-waiting")).toBe("true");
      expect(launcher(host).getAttribute("aria-label")).toBe("Open the FluxIQ conversation - 1 thread is waiting on your answer");
      expect(launcher(host).textContent).toContain("Needs you");
      expect(host.byClass("chat-window-badge")[0]!.textContent).toBe("1");
    });
  });

  it("collapses without unmounting, so the thread and the badge stay", async () => {
    const { api } = world();
    await mount(<ChatDock projectId="project.one" />, api, async ({ host }) => {
      const window = host.children[0]!;
      await act(async () => launcher(host).dispatch("click"));
      expect(windowPanel(host).hidden).toBe(false);
      expect(launcher(host).getAttribute("aria-label")).toBe("Collapse the FluxIQ conversation");
      await act(async () => host.byClass("chat-window-icon")[1]!.dispatch("click"));
      expect(windowPanel(host).hidden).toBe(true);
      expect(host.children[0]).toBe(window);
      expect(window.descendants().some((node) => node.className.includes("chat-panel"))).toBe(true);
    });
  });

  it("closes on Escape and gives the key to a dialog over it", async () => {
    const { api } = world();
    await mount(<ChatDock projectId="project.one" />, api, async ({ host, keydown }) => {
      await act(async () => launcher(host).dispatch("click"));
      modalOpen = true;
      keydown("Escape");
      expect(windowPanel(host).hidden).toBe(false);
      modalOpen = false;
      keydown("Escape");
      expect(windowPanel(host).hidden).toBe(true);
    });
  });

  it("names the window by the thread, never an id, and reports the thread it opened on", async () => {
    const { api } = world();
    const selected: string[] = [];
    await mount(<ChatDock projectId="project.one" projectName="Company website" onSelectedConversationChange={(id) => selected.push(id)} />, api, async ({ host }) => {
      const heading = host.byClass("chat-window-heading")[0]!;
      expect(heading.textContent).toBe("FluxIQKitchen");
      expect(heading.textContent).not.toContain("conversation.1");
      expect(selected).toEqual(["conversation.1"]);
    });
  });

  it("reopens on the thread it was asked to, when that thread is listed", async () => {
    const second = { ...THREAD, conversationId: "conversation.2", title: "Nightly run", updatedAt: 1 };
    const { api } = world({ threads: [THREAD, second] });
    await mount(<ChatDock projectId="project.one" requestedConversationId="conversation.2" />, api, async ({ host }) => {
      await act(async () => launcher(host).dispatch("click"));
      await settle();
      expect(api.sentTo("get-conversation")[0]).toMatchObject({ conversationId: "conversation.2" });
      expect(host.byClass("chat-window-heading")[0]!.textContent).toBe("FluxIQNightly run");
    });
  });

  it("sends what the panel has open with every message", async () => {
    const { api } = world();
    await mount(<ChatDock projectId="project.one" onScreen={{ flowId: "flow.kettle-1" }} />, api, async ({ host }) => {
      await act(async () => launcher(host).dispatch("click"));
      await send(host, "run it");
      expect(api.sentTo("append-turn")[0]).toMatchObject({ projectId: "project.one", conversationId: "conversation.1", text: "run it", onScreen: { flowId: "flow.kettle-1" } });
    });
  });

  it("starts a thread on a project that has said nothing yet, from its first message", async () => {
    const { api, state } = world({ threads: [] });
    await mount(<ChatDock projectId="project.one" />, api, async ({ host }) => {
      state.threads = [];
      await act(async () => launcher(host).dispatch("click"));
      await send(host, "Find lamps");
      expect(api.sentTo("open-conversation")).toEqual([{ projectId: "project.one", subjectKind: "project", subjectId: "project.one" }]);
      expect(api.sentTo("append-turn")[0]).toMatchObject({ conversationId: "conversation.1", text: "Find lamps" });
    });
  });

  it("reads a thread another surface wrote to as soon as the panel hears of it, and finds a thread that appears", async () => {
    const { api, state } = world({ threads: [] });
    await mount(<ChatDock projectId="project.one" projectName="Company website" />, api, async ({ host }) => {
      const listed = api.sentTo("list-conversations").length;
      expect(host.byClass("chat-window-heading")[0]!.textContent).toBe("FluxIQCompany website");
      state.threads = [THREAD];
      await act(async () => {
        commitAutomationStudioMutation({ kind: "conversation.changed", projectId: "project.one", conversationId: "conversation.1" });
      });
      await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 450)); });
      await settle();
      // Heard at once, not on the next beat: the list was read again and the thread found while the window was shut.
      expect(api.sentTo("list-conversations").length).toBeGreaterThan(listed);
      expect(host.byClass("chat-window-heading")[0]!.textContent).toBe("FluxIQKitchen");
    });
  });
});

describe("a question asked in the window", () => {
  async function open(host: FakeElement): Promise<void> {
    await act(async () => launcher(host).dispatch("click"));
  }

  async function giveThePin(renderer: ReactTestRenderer, pin: string): Promise<ReactTestInstance> {
    const dialog = renderer.root.findByProps({ "aria-label": "Confirm this answer" });
    const field = dialog.findAllByType("input").find((input) => input.props.inputMode === "numeric")!;
    await act(async () => field.props.onChange({ target: { value: pin } }));
    return dialog;
  }

  it("runs a confirmed delete with the PIN, and exactly the invocation the confirmation carried", async () => {
    const confirming = world({ threads: [{ ...THREAD, pendingAskCount: 1 }], turns: [CONFIRMATION] });
    await mount(<ChatDock projectId="project.one" onScreen={{ flowId: "flow.kettle-1" }} />, confirming.api, async ({ host, renderer }) => {
      await open(host);
      // The panel's own record is not drawn as an attachment box of JSON, and the question is in Core's words.
      expect(host.textContent).not.toContain(INVOCATION);
      expect(host.textContent).toContain("FluxIQ is asking you to confirm.");
      await act(async () => buttonNamed(host, "Confirm")!.dispatch("click"));
      expect(confirming.api.sentTo("answer-ask")).toEqual([]);
      const dialog = await giveThePin(renderer, "1234");
      await act(async () => { reactButton(dialog, "Confirm").props.onClick(); });
      await settle();
      expect(confirming.api.sentTo("answer-ask")).toEqual([{ projectId: "project.one", askId: "panel-command.1", kind: "grant", authorizationPin: "1234" }]);
      expect(shared.ran).toEqual([{
        conversationId: "conversation.1",
        request: { capabilityId: "flow.delete", arguments: { flowId: "flow.toaster-2" } },
        context: { projectId: "project.one", flowId: "flow.kettle-1", authorizationPin: "1234" }
      }]);
      expect(renderer.root.findAllByProps({ "aria-label": "Confirm this answer" })).toHaveLength(0);
    });
  });

  it("keeps the dialog open with Core's reason when the PIN is refused, and closes it once an answer goes", async () => {
    let attempts = 0;
    const { api } = world({
      threads: [{ ...THREAD, pendingAskCount: 1 }],
      turns: [CONFIRMATION],
      answer: () => (++attempts === 1 ? { ok: false, status: 403, requiresRecheck: true, code: "pin_incorrect", error: "That PIN is not right." } : { ok: true, payload: {} })
    });
    await mount(<ChatDock projectId="project.one" />, api, async ({ host, renderer }) => {
      await open(host);
      await act(async () => buttonNamed(host, "Confirm")!.dispatch("click"));
      let dialog = await giveThePin(renderer, "0000");
      await act(async () => { reactButton(dialog, "Confirm").props.onClick(); });
      await settle();
      expect(shared.ran).toEqual([]);
      expect(renderer.root.findAllByProps({ "aria-label": "Confirm this answer" })).toHaveLength(1);
      expect(textOf(renderer)).toContain("That PIN is not right.");
      dialog = await giveThePin(renderer, "1234");
      await act(async () => { reactButton(dialog, "Confirm").props.onClick(); });
      await settle();
      expect(api.sentTo("answer-ask").map((payload) => payload?.authorizationPin)).toEqual(["0000", "1234"]);
      expect(renderer.root.findAllByProps({ "aria-label": "Confirm this answer" })).toHaveLength(0);
    });
  });

  it("sends nothing and runs nothing when the person cancels the PIN dialog, and nothing is asked for a refusal", async () => {
    const { api } = world({ threads: [{ ...THREAD, pendingAskCount: 1 }], turns: [CONFIRMATION] });
    await mount(<ChatDock projectId="project.one" />, api, async ({ host, renderer }) => {
      await open(host);
      await act(async () => buttonNamed(host, "Confirm")!.dispatch("click"));
      const dialog = renderer.root.findByProps({ "aria-label": "Confirm this answer" });
      await act(async () => { reactButton(dialog, "Cancel").props.onClick(); });
      expect(renderer.root.findAllByProps({ "aria-label": "Confirm this answer" })).toHaveLength(0);
      expect(api.sentTo("answer-ask")).toEqual([]);
      await act(async () => buttonNamed(host, "Cancel")!.dispatch("click"));
      await settle();
      expect(api.sentTo("answer-ask")).toEqual([{ projectId: "project.one", askId: "panel-command.1", kind: "deny" }]);
      expect(shared.ran).toEqual([]);
      expect(renderer.root.findAllByProps({ "aria-label": "Confirm this answer" })).toHaveLength(0);
    });
  });
});

describe("what a turn carries, in the window", () => {
  it("draws a proposed Flow change in place, read for the thread's own project", async () => {
    const { api } = world({ turns: [turn({ attachment: { kind: "flow-graph-diff", ref: "adaptation:a.1" } })] });
    api.answer("get-conversation-attachment", {
      ok: true,
      payload: { attachment: { attachment: { kind: "flow-graph-diff", ref: "adaptation:a.1" }, payload: { flowId: "flow.checkout", added: [{ id: "node.filter", label: "Filter by price" }], removed: [], changed: [] } } }
    });
    await mount(<ChatDock projectId={null} onOpenAttachment={() => undefined} />, api, async ({ host }) => {
      await act(async () => launcher(host).dispatch("click"));
      await settle();
      expect(api.sentTo("get-conversation-attachment")).toEqual([{ projectId: "project.one", conversationId: "conversation.1", turnId: "turn.1" }]);
      expect(host.byClass("panel-diff-card")).toHaveLength(1);
      expect(host.textContent).toContain("Filter by price");
    });
  });
});

describe("moving from the landing screen into a project", () => {
  it("keeps the window open, and offers Open once the screen behind it can go somewhere", async () => {
    const { api } = world({ turns: [turn({ attachment: { kind: "dataset-preview", ref: "dataset:d.1" } })] });
    await mount(<ChatDock projectId={null} />, api, async ({ host, renderer }) => {
      await act(async () => launcher(host).dispatch("click"));
      await settle();
      expect(buttonNamed(host, "Open")).toBeUndefined();
      await act(async () => renderer.update(<ChatDock projectId="project.one" projectName="Company website" onOpenAttachment={() => undefined} />));
      await settle();
      expect(launcher(host).getAttribute("aria-expanded")).toBe("true");
      expect(buttonNamed(host, "Open")).toBeDefined();
    });
  });
});

describe("the chat-alone route", () => {
  it("is the same chat with the same options, and draws its own heading and no window", async () => {
    const { api } = world({ threads: [] });
    await mount(<ChatWidgetPage projectId="project.one" />, api, async ({ host }) => {
      expect(host.byClass("chat-window")).toHaveLength(0);
      expect(fake(host.children[0]!).className).toContain("chat-panel");
      expect(host.textContent).toContain("This is where FluxIQ talks to you");
      expect(host.textContent).toContain("Permission before anything lasting");
      expect(api.sentTo("list-conversations")).toContainEqual({ projectId: "project.one", limit: 25 });
      const box = host.descendants().find((node) => node.id === "conversationInput")!;
      expect(box.getAttribute("maxlength")).toBe("8000");
    });
  });

  it("has the same PIN dialog and navigation as the window", async () => {
    const { api } = world({ threads: [{ ...THREAD, pendingAskCount: 1 }], turns: [CONFIRMATION] });
    await mount(<ChatWidgetPage projectId="project.one" />, api, async ({ host, renderer }) => {
      await act(async () => buttonNamed(host, "Confirm")!.dispatch("click"));
      expect(renderer.root.findAllByProps({ "aria-label": "Confirm this answer" })).toHaveLength(1);
    });
  });
});
