import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const shared = vi.hoisted(() => ({
  projectId: undefined as string | undefined,
  answers: [] as Array<{ ok: boolean; error?: string; payload?: unknown }>,
  calls: [] as Array<Record<string, unknown>>
}));

vi.mock("next/link", () => ({ default: (props: { href: string; children?: React.ReactNode }) => React.createElement("a", { href: props.href }, props.children) }));
vi.mock("../../automation-studio/data/use-program-transport", () => ({
  useProgramTransport: () => ({
    post: async (_endpoint: string, payload: Record<string, unknown>) => {
      shared.calls.push(payload);
      return shared.answers.shift() ?? { ok: true, payload: { conversations: [] } };
    }
  })
}));
vi.mock("../../automation-studio/project", () => ({ useProjectList: () => ({ state: "ready", projects: [{ id: "p1", name: "Shop" }], reload: () => undefined, add: () => undefined }) }));
vi.mock("../../panel-shell", () => ({
  PublishPanelPage: () => null,
  usePanelContext: () => ({ context: { page: "chats", projectId: shared.projectId }, dispatch: () => undefined, read: () => ({}) })
}));

import { ChatsPage } from "../ChatsPage";

const record = (id: string) => ({ conversationId: id, projectId: "p1", subject: { kind: "project", id: "p1" }, status: "open", title: `Chat ${id}`, revision: 1, turnCount: 3, pendingAskCount: 0, createdAt: 1, updatedAt: 5 });
const text = (renderer: ReturnType<typeof create>) => JSON.stringify(renderer.toJSON());
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const button = (renderer: ReturnType<typeof create>, label: string) =>
  renderer.root.findAllByType("button").find((item) => JSON.stringify(item.children) === JSON.stringify([label]))!;

async function mount(projectId?: string) {
  shared.projectId = projectId;
  shared.calls.length = 0;
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<ChatsPage />); });
  await settle();
  return renderer;
}

describe("the Chats page", () => {
  it("lists the chats of the current project with a link to each", async () => {
    shared.answers = [{ ok: true, payload: { conversations: [record("c1")] } }];
    const renderer = await mount("p1");
    expect(shared.calls[0]).toMatchObject({ projectId: "p1" });
    expect(shared.calls[0]).not.toHaveProperty("status");
    expect(text(renderer)).toContain("Chat c1");
    expect(text(renderer)).toContain("/chats/c1?project=p1");
  });
  it("reads every project when none is chosen", async () => {
    shared.answers = [{ ok: true, payload: { conversations: [] } }];
    const renderer = await mount();
    expect(shared.calls[0]).toMatchObject({ projectId: null });
    expect(text(renderer)).toContain("There are no chats here yet");
  });
  it("shows a failure with a way to try again", async () => {
    shared.answers = [{ ok: false, error: "Core said no" }, { ok: true, payload: { conversations: [record("c2")] } }];
    const renderer = await mount();
    expect(text(renderer)).toContain("Core said no");
    await act(async () => { button(renderer, "Try again").props.onClick(); });
    await settle();
    expect(text(renderer)).toContain("Chat c2");
  });
  it("offers older chats when a full page came back, and asks for more", async () => {
    shared.answers = [{ ok: true, payload: { conversations: Array.from({ length: 25 }, (_, index) => record(`c${index}`)) } }, { ok: true, payload: { conversations: [] } }];
    const renderer = await mount();
    await act(async () => { button(renderer, "Show older chats").props.onClick(); });
    await settle();
    expect(shared.calls[1]).toMatchObject({ limit: 50 });
  });
});
