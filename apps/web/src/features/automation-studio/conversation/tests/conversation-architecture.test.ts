import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { automationStudioViewIds, createAutomationStudioViewInstances } from "../../views";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("the conversation is an overlay, not one view among twelve", () => {
  it("is not a registered Studio view at all", () => {
    // It was, in the right-hand region, and the person it was built for could
    // only find it "after manually digging around for it". The conversation is
    // the product's general channel, not an inspector: anything that makes it
    // reachable only by navigating somewhere is the wrong shape.
    expect([...automationStudioViewIds]).not.toContain("conversation-thread");
    expect(source("../../views/canonical-view-definitions.tsx")).not.toContain("Conversation");
  });

  it("drops the pane from a workspace that was saved while it was a view", () => {
    // Anyone who added the Conversation view before this has `conversation-thread`
    // in their saved layout. An id with no definition must fall out of the
    // workspace rather than open an empty pane or throw on restore.
    const instances = createAutomationStudioViewInstances({}, ["conversation-thread", "conversation-thread:flow.1"]);
    expect(instances.map((instance) => instance.id)).not.toContain("conversation-thread");
    expect(instances.length).toBeGreaterThan(0);
  });

  it("is the chat package's window, with a launcher that is always on screen", () => {
    // The window is the chat package's: fixed to the viewport, its launcher
    // always drawn (the package tests the launcher, the badge and Escape).
    expect(source("../../../chat-widget/ChatDock.tsx")).toContain("windowed={WINDOW}");
    expect(source("../../../chat-widget/ChatWidget.tsx")).toContain("createChatWindow(widget");
  });
});

describe("a turn reaches the person without a push channel", () => {
  it("reads on the hidden beat instead of standing still", () => {
    // The one thing in the feature that has to be right. The hidden branch
    // used to re-queue without calling `run`, so a backgrounded tab made no
    // request at all; measured in a browser, twelve seconds of a hidden tab
    // produced zero reads and a question raised by a run reached nobody.
    const poller = source("../thread/poller.ts");
    expect(poller).not.toMatch(/if \(options\.hidden\(\)\) \{\s*queue\(/u);
    expect(poller).toContain("const hidden = options.hidden();");
    expect(poller).toContain("delayMs = hidden ? CONVERSATION_POLL_HIDDEN_MS");
  });

  it("mounts pairing approval globally, and no second prompt for a waiting question", () => {
    // The assistant dock is on every panel page and shows a waiting question
    // itself, so the modal that stood in for it outside the Studio is gone.
    const layout = source("../../../../app/layout.tsx");
    expect(layout).toContain("<GlobalClientGatewayPairing asksTotp={auth?.user.totpEnabled === true} />");
    expect(layout).not.toContain("GlobalConversationPrompt");
  });

  it("carries a closed mutation kind so another mounted surface refreshes without waiting for a beat", () => {
    const store = source("../../stores/mutation-transaction-store.ts");
    expect(store).toContain('kind: "conversation.changed"');
    expect(source("../turn-commands.ts")).toContain("commitAutomationStudioMutation");
    // The chat hears both kinds through its change feed.
    expect(source("../../../chat-widget/transport/changes-port.ts")).toContain('kinds: ["conversation.changed", "runtime-run.changed"]');
  });
});

describe("the conversation talks to Core in the shape Core answers", () => {
  it("carries the project on every project-scoped call", () => {
    // Core's handlers read `projectId` straight off the request and answer
    // "Unknown Automation Studio project: " without it. The transport adds
    // nothing, so each call carries its own.
    const queries = source("../turn-queries.ts");
    const commands = source("../turn-commands.ts");
    expect(queries).toContain("projectId: string;");
    expect(commands).toContain("projectId: payload.projectId");
    expect(queries).toContain('"conversation" in envelope');
  });

  it("sends an answer flat, the way the handler reads it", () => {
    const answers = source("../thread/answers.ts");
    expect(answers).toContain("export function conversationAnswerRequest");
    expect(answers).toContain('{ askId: answer.askId, kind: "choice", value: answer.optionId }');
  });
});

describe("the conversation follows the panel's own conventions", () => {
  it("re-authorizes through the shared dialog rather than a second PIN field", () => {
    const dialog = source("../../../chat-widget/ReauthorizeDialog.tsx");
    expect(dialog).toContain("<AuthorizationDialog");
    expect(dialog).toContain("requirements={{ pin: true }}");
    expect(dialog).not.toContain('<Field label="PIN">');
  });

  it("keeps browser persistence out of every part of the surface", () => {
    for (const path of [
      "../../../chat-widget/ChatDock.tsx",
      "../../../chat-widget/ChatWidget.tsx",
      "../../../chat-widget/ProgramChatWidget.tsx",
      "../../../chat-widget/ReauthorizeDialog.tsx",
      "../../../chat-widget/asks/present-ask.ts",
      "../../../chat-widget/attachments/panel-attachment-port.ts",
      "../../../chat-widget/options/panel-chat-options.ts",
      "../../../chat-widget/transport/conversation-port.ts",
      "../../../chat-widget/transport/answer-ask.ts"
    ]) {
      expect(source(path), path).not.toMatch(/localStorage|sessionStorage|indexedDB/u);
    }
    // The draft is kept in memory only, never in the browser.
    expect(source("../../../chat-widget/options/panel-chat-options.ts")).toContain("keepDraft: false");
  });

  it("never leaves a control the person cannot use without saying why", () => {
    expect(source("../../../chat-widget/options/panel-chat-options.ts")).toContain("unavailableReason:");
  });
});

describe("a turn can carry something the panel draws itself", () => {
  it("draws the structural change itself rather than mounting the graph editor", () => {
    const diff = source("../../../chat-widget/attachments/flow-graph-diff/draw.ts");
    const imports = [...diff.matchAll(/^import[\s\S]*?from\s+"([^"]+)";$/gmu)].map((match) => match[1]);
    expect(imports.filter((specifier) => /flow-editor|xyflow/u.test(specifier ?? ""))).toEqual([]);
    expect(diff).toContain('"aria-label": "Structural changes"');
  });
});
