// The chat window operating the panel, end to end inside the surface: what is
// on screen travels with a message, and a delete Core asked about runs only
// once the person confirms it with their PIN -- and then runs exactly what the
// confirmation carried.

import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../programs/components/overlays/Modal", () => ({
  Modal: (props: { children: React.ReactNode; description?: string; title: string }) => (
    <section aria-label={props.title}>
      <p>{props.description}</p>
      {props.children}
    </section>
  )
}));

import { ConversationViewContent } from "../components";
import type { ConversationCommands } from "../conversation-host";
import { conversationThreadPage } from "../turn-queries";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const conversation = {
  conversationId: "conversation.1",
  projectId: "project.one",
  subject: { kind: "project", id: "project.one" },
  status: "open",
  title: "Kitchen",
  revision: 2,
  turnCount: 2,
  pendingAskCount: 1,
  createdAt: 1,
  updatedAt: 2
};

const confirmation = {
  turnId: "turn.2",
  conversationId: "conversation.1",
  ordinal: 2,
  author: "automation",
  createdAt: 1_790_000_000_000,
  text: 'You asked me to "Delete a Flow" for the Flow "Toaster stock watch". That would delete or remove something, and it cannot be undone, so confirm it here with your PIN, or cancel.',
  // Exactly as Core writes it: base64url JSON, the project left for the thread to supply.
  attachment: { kind: "panel-capability", ref: Buffer.from(JSON.stringify({ capabilityId: "flow.delete", arguments: { flowId: "flow.toaster-2" } }), "utf8").toString("base64url") },
  ask: {
    askId: "panel-command.1",
    conversationId: "conversation.1",
    turnId: "turn.2",
    kind: "confirm",
    status: "pending",
    parks: false,
    consequences: ["delete"],
    control: { name: "Delete a Flow", kind: "panel action" }
  }
};

function commands() {
  const ran: Array<Record<string, unknown>> = [];
  const sent: Array<Record<string, unknown>> = [];
  const api = {
    ran,
    sent,
    listConversations: vi.fn(async () => ({ ok: true, payload: { conversations: [conversation] } })),
    loadConversation: vi.fn(async () => ({ ok: true, page: conversationThreadPage({ conversation, turns: [confirmation], hasMore: false }) })),
    startConversation: vi.fn(async () => ({ ok: true, payload: { conversation } })),
    appendTurn: vi.fn(async () => ({ ok: true, payload: {} })),
    sendInstruction: vi.fn(async (payload: Record<string, unknown>) => {
      sent.push(payload);
      return { ok: true, problem: null, decision: { kind: "reply" }, dispatch: null };
    }),
    answerAsk: vi.fn(async () => ({ ok: true, payload: {} })),
    runCapability: vi.fn(async (payload: Record<string, unknown>) => {
      ran.push(payload);
      return { capability: null, confidence: 1, arguments: {}, outcome: { status: "done", summary: "Deleted the Flow." } };
    }),
    describeCapabilities: vi.fn(() => ({ prose: "", vocabulary: [] }))
  };
  return api as unknown as ConversationCommands & { ran: typeof ran; sent: typeof sent };
}

async function mount(api: ConversationCommands, props: Record<string, unknown> = {}) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ConversationViewContent commands={api} projectId="project.one" {...props} />);
  });
  await act(async () => { await Promise.resolve(); });
  return renderer;
}

function buttonIn(root: ReactTestInstance, label: string) {
  const found = root.findAllByType("button").find((candidate) =>
    candidate.findAll((node: any) => node.children.some((child: unknown) => child === label), { deep: true }).length > 0
  );
  if (!found) throw new Error(`no button labelled ${label}`);
  return found;
}

describe("the chat window operating the panel", () => {
  it("sends what is on screen with every message", async () => {
    const api = commands();
    const renderer = await mount(api, { onScreen: { flowId: "flow.kettle-1" } });
    await act(async () => renderer.root.findByProps({ "aria-label": "Message" }).props.onChange({ target: { value: "run it" } }));
    await act(async () => {
      await renderer.root.findByProps({ "aria-label": "Write to FluxIQ" }).props.onSubmit({ preventDefault: () => undefined });
    });
    expect(api.sent).toEqual([{ projectId: "project.one", conversationId: "conversation.1", text: "run it", onScreen: { flowId: "flow.kettle-1" } }]);
  });

  it("runs a confirmed delete with the PIN, and exactly the invocation the confirmation carried", async () => {
    const api = commands();
    const renderer = await mount(api);
    // The panel's record is not drawn as an attachment box of JSON.
    expect(renderer.root.findAll((node) => node.props?.attachment !== undefined && node.props?.turnId === "turn.2")).toHaveLength(0);

    await act(async () => buttonIn(renderer.root, "Confirm").props.onClick());
    expect(api.runCapability).not.toHaveBeenCalled();
    const dialog = renderer.root.findByProps({ "aria-label": "Confirm this answer" });
    const pin = dialog.findAllByType("input").find((input) => input.props.inputMode === "numeric")!;
    await act(async () => pin.props.onChange({ target: { value: "1234" } }));
    await act(async () => { await buttonIn(dialog, "Confirm").props.onClick(); });
    await act(async () => { await Promise.resolve(); });

    expect(api.answerAsk).toHaveBeenCalledTimes(1);
    expect(api.ran).toEqual([{
      conversationId: "conversation.1",
      request: { capabilityId: "flow.delete", arguments: { flowId: "flow.toaster-2" } },
      context: { projectId: "project.one", authorizationPin: "1234" }
    }]);
  });

  it("runs nothing when the person cancels", async () => {
    const api = commands();
    const renderer = await mount(api);
    await act(async () => { await buttonIn(renderer.root, "Cancel").props.onClick(); });
    await act(async () => { await Promise.resolve(); });
    expect(api.answerAsk).toHaveBeenCalledTimes(1);
    expect(api.runCapability).not.toHaveBeenCalled();
  });
});
