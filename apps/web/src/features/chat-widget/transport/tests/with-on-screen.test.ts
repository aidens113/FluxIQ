// The panel's chat in a project keeps the page and selection each message was written on with that message,
// so the panel assistant it may be handed to judges it by what was selected then (t1095).

import { describe, expect, it } from "vitest";
import { createPanelAttachmentPort } from "../../attachments";
import { fakeProgramApi } from "../../tests/fake-program-api";
import { createProgramChatTransport } from "../program-chat-transport";
import { PANEL_ON_SCREEN_ATTACHMENT, withOnScreen } from "../with-on-screen";

const decode = (ref: unknown) => JSON.parse(Buffer.from(String(ref), "base64url").toString("utf8")) as unknown;

describe("a message's page and selection", () => {
  it("rides on the message the dock sends into a project, and on nothing else", async () => {
    const api = fakeProgramApi({ "open-conversation": { ok: true, payload: { conversation: { conversationId: "c1" } } }, "append-turn": { ok: true, payload: {} } });
    const onScreen = { page: "flows", selection: { flowId: "flow.a", stepNumbers: [2] } };
    const transport = createProgramChatTransport(api, { projectId: () => "p1", panel: { onScreen: () => onScreen, openProject: () => ({ projectId: "p1" }) } });
    await transport.conversation.send({ text: "rename step 2", conversationId: undefined, projectId: "p1" });
    const sent = api.sentTo("append-turn")[0]!;
    expect(sent.attachmentKind).toBe(PANEL_ON_SCREEN_ATTACHMENT);
    expect(decode(sent.attachmentRef)).toEqual(onScreen);
    expect(api.sentTo("open-conversation")[0]).not.toHaveProperty("attachmentKind");
  });

  it("keeps a page and its named ids when the whole selection is too long to keep", async () => {
    const api = fakeProgramApi({ "append-turn": { ok: true, payload: {} } });
    const nodeIds = Array.from({ length: 200 }, (_, index) => `node.${index}`);
    await withOnScreen(api, () => ({ page: "flows", selection: { flowId: "flow.a", nodeIds } })).post("append-turn", { text: "x" });
    expect(decode(api.sentTo("append-turn")[0]!.attachmentRef)).toEqual({ page: "flows", selection: { flowId: "flow.a" } });
  });

  it("is never drawn in the panel's chat", () => {
    const port = createPanelAttachmentPort({ read: async () => ({ ok: true, value: {} }) });
    expect(port.isHidden?.({ kind: PANEL_ON_SCREEN_ATTACHMENT, ref: "e30" })).toBe(true);
    expect(port.isHidden?.({ kind: "flow-graph-diff", ref: "x" })).toBe(false);
  });
});
