import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { automationStudioViewDefinition, automationStudioViewId } from "../../views";
import { conversationAttachmentKinds, conversationAttachmentLabel, conversationAttachmentRenderer } from "../components";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("the conversation view is declared the way the workspace expects", () => {
  it("lives in the right pane, stays awake in the background, and is addable", () => {
    const definition = automationStudioViewDefinition(automationStudioViewId.conversation, { hasFlow: true });
    expect(definition?.region).toBe("right");
    expect(definition?.allowedRegions).toContain("main");
    expect(definition?.group).toBe("Workspace");
    expect(definition?.addable).toBe(true);
    expect(definition?.requires).toBe("hasProject");
    // A sleeping view never receives an answer, so it must not sleep until activated.
    expect(definition?.lifecycle.sleepUntilActivated).toBe(false);
    expect(definition?.functionality.dataIntensity).not.toBe("light");
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

  it("mounts the prompt globally, beside the one component that already reaches an unattended person", () => {
    const layout = source("../../../../app/layout.tsx");
    expect(layout).toContain("<GlobalClientGatewayPairing />");
    expect(layout).toContain("<GlobalConversationPrompt />");
  });

  it("carries a closed mutation kind so another mounted thread refreshes without waiting for a beat", () => {
    const store = source("../../stores/mutation-transaction-store.ts");
    expect(store).toContain('kind: "conversation.changed"');
    expect(source("../turn-commands.ts")).toContain("commitAutomationStudioMutation");
  });
});

describe("the conversation follows the panel's own conventions", () => {
  it("re-authorizes through the shared dialog rather than a second PIN field", () => {
    const form = source("../components/ConversationAskForm.tsx");
    expect(form).toContain("requirements={{ pin: true }}");
    expect(form).not.toContain('<Field label="PIN">');
  });

  it("keeps browser persistence out of the view", () => {
    for (const path of [
      "../components/ConversationView.tsx",
      "../components/ConversationViewContent.tsx",
      "../components/ConversationThread.tsx",
      "../components/ConversationTurn.tsx",
      "../useConversationThread.ts"
    ]) {
      expect(source(path)).not.toMatch(/localStorage|sessionStorage|indexedDB/u);
    }
  });

  it("owns one stylesheet, imported once by the Studio route manifest", () => {
    const manifest = source("../../../../app/programs/automation-studio/automation-studio.css");
    const imports = manifest.split(/\r?\n/u).filter((line) => line.includes("styles/conversation/"));
    expect(imports).toHaveLength(1);
    expect(source("../../styles/conversation/01-thread.css")).toContain(".automation-conversation-");
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
