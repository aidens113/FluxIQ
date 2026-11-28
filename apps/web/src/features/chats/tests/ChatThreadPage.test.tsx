import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const shared = vi.hoisted(() => ({
  replaced: [] as string[],
  dispatched: [] as unknown[],
  widget: undefined as undefined | { projectId?: string | null; requestedConversationId?: string; panel?: unknown; onSelectedConversationChange?(id: string): void; onProjectFound?(id: string): void }
}));

vi.mock("next/link", () => ({ default: (props: { href: string; children?: React.ReactNode }) => React.createElement("a", { href: props.href }, props.children) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: (href: string) => { shared.replaced.push(href); }, push: () => undefined }) }));
vi.mock("../../chat-widget", () => ({
  ProgramChatWidget: (props: NonNullable<typeof shared.widget>) => {
    shared.widget = props;
    return null;
  }
}));
vi.mock("../../panel-shell", () => ({
  PublishPanelPage: () => null,
  onScreenFromContext: () => ({ page: "chats" }),
  usePanelContext: () => ({ context: { page: "chats" }, dispatch: (action: unknown) => { shared.dispatched.push(action); }, read: () => ({}) })
}));

import { ChatThreadPage } from "../ChatThreadPage";

async function mount(props: { conversationId: string; projectId?: string }) {
  shared.replaced.length = 0;
  shared.dispatched.length = 0;
  shared.widget = undefined;
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<ChatThreadPage {...props} />); });
  return renderer;
}

describe("a chat as a full page", () => {
  it("moves the address to the new chat when New chat is used, so a reload does not reopen the old one", async () => {
    await mount({ conversationId: "old", projectId: "p1" });
    expect(shared.widget?.requestedConversationId).toBe("old");
    // The chat reports the thread it shows when it opens; that is the page's own, so the address stays.
    act(() => shared.widget?.onSelectedConversationChange?.("old"));
    expect(shared.replaced).toEqual([]);
    act(() => shared.widget?.onSelectedConversationChange?.("fresh chat"));
    expect(shared.replaced).toEqual(["/chats/fresh%20chat?project=p1"]);
    act(() => shared.widget?.onSelectedConversationChange?.("fresh chat"));
    expect(shared.replaced).toHaveLength(1);
  });

  it("makes its own project the panel's project, so the assistant beside it is not a second, disabled box", async () => {
    await mount({ conversationId: "c", projectId: "p1" });
    expect(shared.dispatched).toEqual([{ type: "project", projectId: "p1" }]);
  });

  it("opens /chats/<conversationId>?project=<projectId> on that conversation, in that project (the address a client opens)", async () => {
    await mount({ conversationId: "conversation.9", projectId: "project.7" });
    expect(shared.widget).toMatchObject({ projectId: "project.7", requestedConversationId: "conversation.9" });
    expect(shared.widget?.panel).toBeUndefined();
    expect(shared.dispatched).toEqual([{ type: "project", projectId: "project.7" }]);
  });

  it("opens an earlier chat with no project where it lives, never on a made-up project", async () => {
    const renderer = await mount({ conversationId: "c" });
    expect(shared.dispatched).toEqual([]);
    expect(shared.widget).toMatchObject({ projectId: null, requestedConversationId: "c" });
    expect(shared.widget?.panel).toBeDefined();
    expect(JSON.stringify(renderer.toJSON())).toContain("before every chat belonged to a project");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("panel");
    act(() => shared.widget?.onProjectFound?.("project.mine"));
    expect(shared.dispatched).toEqual([{ type: "project", projectId: "project.mine" }]);
  });
});
