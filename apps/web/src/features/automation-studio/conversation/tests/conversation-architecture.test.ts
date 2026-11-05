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
    expect(source("../../live/view-host/connected-view-entries.tsx")).not.toContain("Conversation");
  });

  it("drops the pane from a workspace that was saved while it was a view", () => {
    // Anyone who added the Conversation view before this has `conversation-thread`
    // in their saved layout. An id with no definition must fall out of the
    // workspace rather than open an empty pane or throw on restore.
    const instances = createAutomationStudioViewInstances({}, ["conversation-thread", "conversation-thread:flow.1"]);
    expect(instances.map((instance) => instance.id)).not.toContain("conversation-thread");
    expect(instances.length).toBeGreaterThan(0);
  });

  it("mounts over the whole workspace, with a launcher that is always on screen", () => {
    const session = source("../../live/components/AutomationStudioSession.tsx");
    expect(session).toContain("<ChatDock");
    // Outside the workspace composition, so it is over every region rather
    // than inside one of them. `lastIndexOf`, because the gate mounts one too
    // and the gate is returned earlier in the file -- see the next case.
    expect(session.lastIndexOf("<ChatDock")).toBeGreaterThan(session.indexOf("<AutomationStudioWorkspaceComposition"));
    // The window is the chat package's: fixed to the viewport, its launcher
    // always drawn (the package tests the launcher, the badge and Escape).
    expect(source("../../../chat-widget/ChatDock.tsx")).toContain("windowed={WINDOW}");
    expect(source("../../../chat-widget/ChatWidget.tsx")).toContain("createChatWindow(widget");
  });

  it("is on the landing screen too, which is where a person has nothing to work with yet", () => {
    // The gate is returned before the workspace, so for the whole of a person's
    // first visit -- and every visit before they pick a project -- there was no
    // conversation at all. That is exactly the screen on which someone has
    // nothing built and the most to ask about. It carries no project, so the
    // thread list spans every project they can see and a question raised by a
    // run they started earlier still reaches them here.
    const session = source("../../live/components/AutomationStudioSession.tsx");
    const gate = session.indexOf("<AutomationStudioProjectGate");
    const workspace = session.indexOf("<AutomationStudioWorkspaceComposition");
    const onTheGate = session.indexOf("<ChatDock projectId={null} />");
    expect(gate).toBeGreaterThan(-1);
    expect(onTheGate).toBeGreaterThan(gate);
    expect(onTheGate).toBeLessThan(workspace);
  });

  it("has one conversation surface: nothing of the old React view or its styles is left", () => {
    const manifest = source("../../../../app/programs/automation-studio/automation-studio.css");
    expect(manifest).not.toContain("styles/conversation/");
    expect(source("../../styles/workspace/04-layout.css")).toContain("--chat-window-bottom:");
    expect(source("../../styles/workspace/04-layout.css")).not.toMatch(/automation-conversation/u);
  });
});

describe("a turn reaches the person without a push channel", () => {
  it("polls the global prompt with the adaptive backoff rather than a fixed interval", () => {
    const prompt = source("../../../../app/GlobalConversationPrompt.tsx");
    expect(prompt).toContain("createBackoffPoller");
    expect(prompt).not.toContain("setInterval");
    expect(prompt).toContain('document.addEventListener("visibilitychange"');
  });

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

  it("mounts the prompt globally, and stands down where the overlay already is", () => {
    const layout = source("../../../../app/layout.tsx");
    expect(layout).toContain("<GlobalClientGatewayPairing asksTotp={auth?.user.totpEnabled === true} />");
    expect(layout).toContain("<GlobalConversationPrompt />");
    const prompt = source("../../../../app/GlobalConversationPrompt.tsx");
    expect(prompt).toContain('const STUDIO_ROUTE = "/programs/automation-studio";');
    expect(prompt).toContain("if (inStudio || !turn || !ask) return null;");
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
