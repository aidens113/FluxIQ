// What a turn carries beside its words, in this panel: which kinds are the
// panel's own records, which are drawn, how an unknown one is named, and how it
// is read from Core.

import { describe, expect, it, vi } from "vitest";
import { fakeProgramApi } from "../../tests/fake-program-api";
import { attachmentLabel } from "../labels";
import { createPanelAttachmentPort } from "../panel-attachment-port";
import { readAttachment } from "../read-attachment";

const read = vi.fn(async () => ({ ok: true as const, value: {} }));

describe("the panel's attachment port", () => {
  it("tells the panel's own records from what a person sent, and hides a confirmation's encoded invocation", () => {
    const port = createPanelAttachmentPort({ read });
    expect(port.isRecord?.({ kind: "panel-capability-result", ref: "flow.delete" })).toBe(true);
    expect(port.isRecord?.({ kind: "panel-capability", ref: "abc" })).toBe(false);
    expect(port.isHidden?.({ kind: "panel-capability", ref: "abc" })).toBe(true);
    expect(port.isHidden?.({ kind: "panel-capability-result", ref: "flow.delete" })).toBe(false);
    expect(port.isHidden?.({ kind: "flow-graph-diff", ref: "adaptation:a.1" })).toBe(false);
  });

  it("routes a known kind to its drawer and names an unknown one", () => {
    const port = createPanelAttachmentPort({ read });
    expect(port.drawer("flow-graph-diff")).toBeTruthy();
    expect(port.drawer("hologram")).toBeNull();
    expect(port.label("flow-graph-diff")).toBe("Proposed Flow change");
    expect(port.label("hologram")).toBe("Attachment");
    expect(attachmentLabel("dataset-preview")).toBe("Collected data");
    expect(attachmentLabel("screenshot")).toBe("Screenshot");
  });

  it("offers Open only when the host can go to what a reference names", () => {
    const open = vi.fn();
    expect(createPanelAttachmentPort({ read })).not.toHaveProperty("open");
    const port = createPanelAttachmentPort({ read, open });
    port.open?.({ kind: "screenshot", ref: "capture:c.1" });
    expect(open).toHaveBeenCalledWith({ kind: "screenshot", ref: "capture:c.1" });
  });

  it("reads a turn's attachment from Core for the thread's own project", async () => {
    const api = fakeProgramApi({ "get-conversation-attachment": { ok: true, payload: { attachment: { attachment: { kind: "flow-graph-diff", ref: "adaptation:a.1" }, payload: { added: [] } } } } });
    const result = await readAttachment(api)({ attachment: { kind: "flow-graph-diff", ref: "adaptation:a.1" }, projectId: "project.two", conversationId: "conversation.1", turnId: "turn.1" });
    expect(api.sentTo("get-conversation-attachment")).toEqual([{ projectId: "project.two", conversationId: "conversation.1", turnId: "turn.1" }]);
    expect(result).toEqual({ ok: true, value: { attachment: { attachment: { kind: "flow-graph-diff", ref: "adaptation:a.1" }, payload: { added: [] } } } });
  });

  it("answers a failed read as a failure the chat can say, never a throw", async () => {
    const api = fakeProgramApi({ "get-conversation-attachment": { ok: false, status: 404, error: "No such attachment." } });
    const result = await readAttachment(api)({ attachment: { kind: "screenshot", ref: "capture:c.1" }, projectId: "p", conversationId: "c", turnId: "t" });
    expect(result).toMatchObject({ ok: false, sentence: "No such attachment." });
  });

  describe("in a panel thread", () => {
    const turn = { attachment: { kind: "flow-graph-diff", ref: "flow.1:adaptation.1" }, conversationId: "panel-1", turnId: "turn.1" };
    const answer = { ok: true as const, status: 200, payload: { attachment: { attachment: turn.attachment, payload: { added: [] } } } };

    it("reads through get-panel-thread-attachment with the open project, never the literal panel", async () => {
      const api = fakeProgramApi({ "get-panel-thread-attachment": answer });
      const result = await readAttachment(api, { panel: { openProjectId: () => "project.small" } })({ ...turn, projectId: "panel" });
      expect(api.sentTo("get-panel-thread-attachment")).toEqual([{ conversationId: "panel-1", turnId: "turn.1", projectId: "project.small" }]);
      expect(api.sentTo("get-conversation-attachment")).toEqual([]);
      expect(result).toMatchObject({ ok: true });
    });

    it("keeps get-conversation-attachment, in its own project, for a project thread listed beside the panel's", async () => {
      const api = fakeProgramApi({ "get-conversation-attachment": answer });
      await readAttachment(api, { panel: { openProjectId: () => "project.small" } })({ ...turn, conversationId: "conv.p", projectId: "project.named" });
      expect(api.sentTo("get-conversation-attachment")).toEqual([{ projectId: "project.named", conversationId: "conv.p", turnId: "turn.1" }]);
      expect(api.sentTo("get-panel-thread-attachment")).toEqual([]);
    });

    it("names no project when none is open, so Core serves a navigation and refuses a proposal in its own words", async () => {
      const api = fakeProgramApi({ "get-panel-thread-attachment": { ok: false, status: 400, error: "name the project." } });
      const result = await readAttachment(api, { panel: { openProjectId: () => undefined } })({ ...turn, projectId: "panel" });
      expect(api.sentTo("get-panel-thread-attachment")).toEqual([{ conversationId: "panel-1", turnId: "turn.1" }]);
      expect(result).toMatchObject({ ok: false, sentence: "name the project." });
    });
  });
});
