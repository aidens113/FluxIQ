import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { automationStudioViewIds } from "../../views";
import { createAutomationStudioViewInstances } from "../../views/view-instances";
import { conversationAttachmentKinds, conversationAttachmentLabel, conversationAttachmentRenderer, conversationLauncherLabel } from "../components";

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
    expect(session).toContain("<ConversationDock");
    // Outside the workspace composition, so it is over every region rather
    // than inside one of them.
    expect(session.indexOf("<ConversationDock")).toBeGreaterThan(session.indexOf("<AutomationStudioWorkspaceComposition"));

    const dock = source("../components/ConversationDock.tsx");
    expect(dock).toContain('className="automation-conversation-dock-launcher"');
    expect(dock).toContain('role="dialog"');
    expect(source("../../styles/conversation/02-dock.css")).toContain("position: fixed");
  });

  it("collapses without unmounting, so the badge can still be lit by a question", () => {
    const dock = source("../components/ConversationDock.tsx");
    // `hidden` rather than a conditional render: the thread keeps its poller,
    // its turns and its scroll position, and a question that arrives while the
    // window is shut still reaches the launcher.
    expect(dock).toContain("hidden={!open}");
    expect(dock).not.toMatch(/\{open \? <ConversationView/u);
    expect(dock).toContain('event.key !== "Escape"');
  });

  it("says on the launcher itself that something needs the person", () => {
    expect(conversationLauncherLabel(false, 0)).toBe("Open the FluxIQ conversation");
    expect(conversationLauncherLabel(false, 1)).toBe("Open the FluxIQ conversation - 1 thread is waiting on your answer");
    expect(conversationLauncherLabel(true, 3)).toBe("Collapse the FluxIQ conversation - 3 threads are waiting on your answer");
  });

  it("splits into a view that binds commands and a content component that takes them", () => {
    const view = source("../components/ConversationView.tsx");
    const content = source("../components/ConversationViewContent.tsx");
    expect(view).toContain("useConversationCommands()");
    expect(view).toContain("<ConversationViewContent {...props} commands={commands} />");
    expect(view).not.toMatch(/useProgramApi\s*\(|\bapi\.(?:get|post)\s*\(/u);
    expect(content).toContain("commands: ConversationCommands");
    expect(content).not.toContain("useConversationCommands");
  });
});

describe("a turn reaches the person without a push channel", () => {
  it("polls with the adaptive backoff rather than a fixed interval", () => {
    const controller = source("../useConversationThread.ts");
    const prompt = source("../../../../app/GlobalConversationPrompt.tsx");
    for (const module of [controller, prompt]) {
      expect(module).toContain("createBackoffPoller");
      expect(module).not.toContain("setInterval");
      expect(module).toContain('document.addEventListener("visibilitychange"');
    }
    expect(controller).toContain('kinds: ["conversation.changed"]');
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

  it("keeps reading a project that has no thread yet, because that is where the next one opens", () => {
    const controller = source("../useConversationThread.ts");
    expect(controller).toContain("active: () => true");
    expect(controller).not.toContain("active: () => Boolean(selectedRef.current)");
  });

  it("mounts the prompt globally, and stands down where the overlay already is", () => {
    const layout = source("../../../../app/layout.tsx");
    expect(layout).toContain("<GlobalClientGatewayPairing />");
    expect(layout).toContain("<GlobalConversationPrompt />");
    const prompt = source("../../../../app/GlobalConversationPrompt.tsx");
    expect(prompt).toContain('const STUDIO_ROUTE = "/programs/automation-studio";');
    expect(prompt).toContain("if (inStudio || !turn || !ask) return null;");
  });

  it("carries a closed mutation kind so another mounted surface refreshes without waiting for a beat", () => {
    const store = source("../../stores/mutation-transaction-store.ts");
    expect(store).toContain('kind: "conversation.changed"');
    expect(source("../turn-commands.ts")).toContain("commitAutomationStudioMutation");
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
    const form = source("../components/ConversationAskForm.tsx");
    expect(form).toContain("requirements={{ pin: true }}");
    expect(form).not.toContain('<Field label="PIN">');
  });

  it("keeps browser persistence out of every part of the surface", () => {
    for (const path of [
      "../components/ConversationDock.tsx",
      "../components/ConversationView.tsx",
      "../components/ConversationViewContent.tsx",
      "../components/ConversationThread.tsx",
      "../components/ConversationTurn.tsx",
      "../useConversationThread.ts"
    ]) {
      expect(source(path)).not.toMatch(/localStorage|sessionStorage|indexedDB/u);
    }
  });

  it("owns its stylesheets, each imported once by the Studio route manifest", () => {
    const manifest = source("../../../../app/programs/automation-studio/automation-studio.css");
    const imports = manifest.split(/\r?\n/u).filter((line) => line.includes("styles/conversation/"));
    expect(imports).toHaveLength(2);
    expect(new Set(imports).size).toBe(2);
    expect(source("../../styles/conversation/01-thread.css")).toContain(".automation-conversation-");
    expect(source("../../styles/conversation/02-dock.css")).toContain(".automation-conversation-dock");
  });

  it("never leaves a control the person cannot use without saying why", () => {
    const composer = source("../components/ConversationComposer.tsx");
    expect(composer).toContain("unavailableReason");
    expect(source("../components/ConversationViewContent.tsx")).toContain("unavailableReason:");
  });
});

describe("a turn can carry something the panel draws itself", () => {
  it("routes a known kind to its renderer and names an unknown one", () => {
    expect(conversationAttachmentKinds()).toContain("flow-graph-diff");
    expect(conversationAttachmentRenderer("flow-graph-diff")).toBeTruthy();
    expect(conversationAttachmentRenderer("hologram")).toBeNull();
    expect(conversationAttachmentLabel("flow-graph-diff")).toBe("Proposed Flow change");
    expect(conversationAttachmentLabel("hologram")).toBe("Attachment");
  });

  it("draws the structural change itself rather than mounting the graph editor", () => {
    const diff = source("../components/FlowGraphDiffAttachment.tsx");
    const imports = [...diff.matchAll(/^import[\s\S]*?from\s+"([^"]+)";$/gmu)].map((match) => match[1]);
    expect(imports.filter((specifier) => /flow-editor|xyflow/u.test(specifier ?? ""))).toEqual([]);
    expect(diff).toContain('aria-label="Structural changes"');
  });
});
