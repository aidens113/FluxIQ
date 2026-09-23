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

import { ConversationTurn } from "../components";
import { parseConversationTurn } from "../thread";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function wireTurn(overrides: Record<string, unknown> = {}) {
  return {
    turnId: "turn.1",
    conversationId: "conversation.1",
    author: "automation",
    createdAt: 1_790_000_000_000,
    text: "To finish the job I would press Add to queue.",
    ...overrides
  };
}

function record(overrides: Record<string, unknown> = {}) {
  const turn = parseConversationTurn(wireTurn(overrides));
  if (!turn) throw new Error("fixture was refused by the contract parser");
  return turn;
}

async function mountTurn(turn: ReturnType<typeof record>, extra: Record<string, unknown> = {}) {
  const onAnswer = vi.fn(async () => true);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ConversationTurn busy={false} onAnswer={onAnswer} projectId="project.one" turn={turn} {...extra} />);
  });
  await act(async () => { await Promise.resolve(); });
  return { onAnswer, renderer };
}

function buttonIn(root: ReactTestInstance, label: string) {
  const found = root.findAllByType("button").find((candidate) =>
    candidate.findAll((node: any) => node.children.some((child: unknown) => child === label), { deep: true }).length > 0
  );
  if (!found) throw new Error(`no button labelled ${label}`);
  return found;
}

function button(renderer: ReactTestRenderer, label: string) {
  return buttonIn(renderer.root, label);
}

function textOf(renderer: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: any) => {
    if (node === null || node === undefined || node === false) return;
    if (typeof node === "string" || typeof node === "number") return void parts.push(String(node));
    if (Array.isArray(node)) return void node.forEach(walk);
    walk(node.children);
  };
  walk(renderer.toJSON());
  return parts.join(" ");
}

const permissionAsk = {
  askId: "ask.1",
  kind: "permission",
  status: "pending",
  parks: true,
  missing: ["send_or_publish", "create_new"],
  control: { name: "Add to queue", kind: "button" }
};

describe("answering an ask inside its turn", () => {
  it("grants exactly the classes the ask listed, and only after the PIN", async () => {
    const { onAnswer, renderer } = await mountTurn(record({ ask: permissionAsk }));
    expect(textOf(renderer)).toContain("send or publish something that others will receive or see");
    expect(textOf(renderer)).toContain("create something new that stays");
    expect(textOf(renderer)).toContain('The control is "Add to queue" (button).');

    await act(async () => button(renderer, "Allow").props.onClick());
    expect(onAnswer).not.toHaveBeenCalled();

    const dialog = renderer.root.findByProps({ "aria-label": "Allow this action" });
    expect(textOf(renderer)).toContain("This answer has a lasting effect.");
    const pin = dialog.findAllByType("input").find((input) => input.props.inputMode === "numeric")!;
    await act(async () => pin.props.onChange({ target: { value: "12ab34" } }));
    await act(async () => buttonIn(dialog, "Allow").props.onClick());

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer.mock.calls[0]).toEqual([
      { askId: "ask.1", kind: "grant", consequences: ["send_or_publish", "create_new"] },
      "1234"
    ]);
  });

  it("refuses without a PIN, and grants nothing", async () => {
    const { onAnswer, renderer } = await mountTurn(record({ ask: permissionAsk }));
    await act(async () => button(renderer, "Don't allow").props.onClick());
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer.mock.calls[0]).toEqual([{ askId: "ask.1", kind: "deny" }]);
    expect(renderer.root.findAllByProps({ "aria-label": "Allow this action" })).toHaveLength(0);
  });

  it("picks one option, and re-authorizes only a destructive one", async () => {
    const ask = {
      askId: "ask.2",
      kind: "choice",
      status: "pending",
      parks: true,
      options: [
        { optionId: "opt.keep", label: "Keep the draft" },
        { optionId: "opt.delete", label: "Delete the draft", destructive: true }
      ]
    };
    const { onAnswer, renderer } = await mountTurn(record({ ask }));
    await act(async () => button(renderer, "Keep the draft").props.onClick());
    expect(onAnswer.mock.calls[0]).toEqual([{ askId: "ask.2", kind: "choice", optionId: "opt.keep" }]);

    await act(async () => button(renderer, "Delete the draft").props.onClick());
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByProps({ "aria-label": "Confirm this answer" }).length).toBeGreaterThan(0);
  });

  it("confirms without inventing a consequence the ask did not carry", async () => {
    const { onAnswer, renderer } = await mountTurn(record({
      ask: { askId: "ask.3", kind: "confirm", status: "pending", parks: false }
    }));
    await act(async () => button(renderer, "Confirm").props.onClick());
    expect(onAnswer.mock.calls[0]).toEqual([{ askId: "ask.3", kind: "grant", consequences: [] }]);
  });

  it("takes words for an open ask", async () => {
    const { onAnswer, renderer } = await mountTurn(record({
      ask: { askId: "ask.4", kind: "open", status: "pending", parks: true }
    }));
    const area = renderer.root.findAllByType("textarea")[0]!;
    await act(async () => area.props.onChange({ target: { value: "  Use the cheapest one.  " } }));
    await act(async () => button(renderer, "Send answer").props.onClick());
    expect(onAnswer.mock.calls[0]).toEqual([{ askId: "ask.4", kind: "text", text: "Use the cheapest one." }]);
  });

  it("shows the outcome rather than a second set of buttons once it is answered", async () => {
    const { renderer } = await mountTurn(record({ ask: { ...permissionAsk, status: "answered" } }));
    expect(textOf(renderer)).toContain("Answered.");
    expect(renderer.root.findAllByProps({ "aria-label": "Answer this question" })).toHaveLength(0);
  });
});

describe("what a turn carries", () => {
  const attachment = { kind: "flow-graph-diff", ref: "adaptation:a.1" };

  it("draws a structural Flow change where the panel owns a renderer for it", async () => {
    // Core answers `{ attachment: { attachment, payload } }`: the reference it
    // resolved, and what it resolved to. The renderer wants the second.
    const loadAttachment = vi.fn(async () => ({
      ok: true,
      payload: {
        attachment: {
          attachment: { kind: "flow-graph-diff", ref: "adaptation:a.1" },
          payload: {
            flowId: "flow.checkout",
            added: [{ id: "node.filter", label: "Filter by price", detail: "after node.search" }],
            removed: [{ id: "edge.2" }],
            changed: [{ id: "node.search", detail: "waits for the result list" }]
          }
        }
      }
    }));
    const { renderer } = await mountTurn(record({ attachment }), { loadAttachment });
    expect(loadAttachment).toHaveBeenCalledWith(
      { projectId: "project.one", conversationId: "conversation.1", turnId: "turn.1" },
      expect.anything()
    );
    const table = renderer.root.findByProps({ "aria-label": "Structural changes" });
    expect(table.findAllByProps({ role: "row" })).toHaveLength(4);
    const text = textOf(renderer);
    expect(text).toContain("Filter by price");
    expect(text).toContain("after node.search");
    expect(text).toContain("edge.2");
  });

  it("refuses a change it cannot read rather than drawing half a Flow", async () => {
    const loadAttachment = vi.fn(async () => ({
      ok: true,
      payload: { attachment: { attachment: { kind: "flow-graph-diff", ref: "adaptation:a.1" }, payload: { added: [{ id: "<script>" }] } } }
    }));
    const { renderer } = await mountTurn(record({ attachment }), { loadAttachment });
    expect(textOf(renderer)).toContain("could not be read");
    expect(renderer.root.findAllByProps({ "aria-label": "Structural changes" })).toHaveLength(0);
  });

  it("names the reference and offers to open it when nothing can resolve it", async () => {
    const onOpenAttachment = vi.fn();
    const { renderer } = await mountTurn(
      record({ attachment: { kind: "screenshot", ref: "capture:c.1" } }),
      { onOpenAttachment }
    );
    expect(textOf(renderer)).toContain("Screenshot, kept outside this conversation.");
    expect(textOf(renderer)).toContain("capture:c.1");
    await act(async () => button(renderer, "Open").props.onClick());
    expect(onOpenAttachment).toHaveBeenCalledWith({ kind: "screenshot", ref: "capture:c.1" });
  });
});
