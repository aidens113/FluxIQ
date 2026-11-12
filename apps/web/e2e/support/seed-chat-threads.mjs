// Writes the conversation threads the chat widget spec reads, into the isolated fixture root
// (`apps/web/.e2e-host`, made by `fixture:e2e`). It runs while no server has the root open, and it
// calls no model.
//
// The docked Assistant shows the signed-in person's panel threads, which belong to no project and live in the
// person's own database beside the projects' root (`<automation data>/panel-assistant`). Core has no public writer
// for them, so this seed opens that store the way the panel's own endpoints do, through Core's built module, and
// writes turns the way the assistant's loop writes them. It refuses anything but the marked fixture root.
//
// Seeded for the fixture person (`admin`):
//   - "Weekly post build": an Allow card (send_or_publish, create_new) the person has not answered
//   - "Cleanup run": 14 filler turns, then an Allow card whose consequence is delete, so the question sits below the
//     fold and Show me has somewhere to scroll
//   - "Planning notes": a person's turn, a reference to a real proposal Core holds on a Flow of its own, an adaptation
//     reference, the panel's own `panel-capability-result` record after a person's turn, and no question
// and, in the small project (listed in the dock beside them once the person opens it, answered through the project's
// own conversation, never the panel's):
//   - "Cleanup choice": a choice ask whose options are destructive (consequence delete)
//   - "Project questions": an open ask that takes the person's own words
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FluxIQ } from "fluxiq";
import { automationStudioFlowGraphDiffAttachment } from "fluxiq/automation";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.resolve(process.env.FLUXIQ_E2E_FIXTURE_ROOT ?? path.join(webRoot, ".e2e-host"));
if (!(await readFile(path.join(fixtureRoot, ".fluxiq-e2e-fixture-root"), "utf8").then(() => true, () => false))) {
  throw new Error("Refusing to seed: the root is not a marked e2e fixture root.");
}
const manifest = JSON.parse(await readFile(path.join(fixtureRoot, "fixture-manifest.json"), "utf8"));
const projectId = manifest.projects.small.id;
const PERSON = manifest.credentials.username;

// Core's built panel-thread store: the module is not a public export, so it is loaded from the package's own dist.
const coreEntry = fileURLToPath(import.meta.resolve("fluxiq/automation"));
const coreDist = coreEntry.slice(0, coreEntry.lastIndexOf(`${path.sep}dist${path.sep}`) + 6);
const { PanelAssistantThreads } = await import(pathToFileURL(path.join(coreDist, "runtime/conversations/assistant/store/panel-threads.js")).href);

const fluxiq = FluxIQ.create({ rootDir: fixtureRoot, loadEnv: false });
await fluxiq.setup();
const studio = fluxiq.programs.automationStudio;

// A proposed change Core really holds, on a Flow of its own: nothing is built and no model is called.
const flow = await studio.createFlow({ projectId, name: "Weekly post" });
const now = Date.now();
const instructionId = "instruction.e2e.weekly-post";
await studio.saveFlowInstruction(projectId, {
  schemaVersion: "0.1", instructionId, title: "Weekly post", body: "Open the post editor, then finish.",
  scope: { kind: "flow", projectId, flowId: flow.flowId }, priority: 100, status: "active", requirement: "required", createdAt: now, updatedAt: now
});
const proposal = await studio.createFlowBootstrapAdaptation({
  projectId,
  flowId: flow.flowId,
  baseDependencyDigest: await studio.getLlmExecutionDependencyDigest(projectId, flow.flowId),
  sourceInstructionIds: [instructionId],
  summary: "Open the post editor, then finish.",
  buildPlan: { plan: {
    schemaVersion: "0.1",
    router: { name: "Instruction router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary",
      nodes: [
        { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0", label: "Start the post" },
        { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0", label: "Finish the post" }
      ],
      edges: [{ key: "start_end", source: { nodeKey: "start", portId: "success" }, target: { nodeKey: "end", portId: "in" } }]
    }]
  } }
});

// Beside the projects' root, as the panel's endpoints place it (`register.ts`: `path.dirname(projectsRoot)/panel-assistant`).
const automationData = path.join(fixtureRoot, ".fluxiq", "artifacts", "automation-studio");
if (!existsSync(path.join(automationData, "projects"))) {
  throw new Error("The fixture root keeps no projects where the panel looks for them, so its panel threads would go unread.");
}
const threads = new PanelAssistantThreads({ rootDir: path.join(automationData, "panel-assistant") });
const say = (conversationId, text, attachment) => threads.append(PERSON, { conversationId, author: "automation", text, attachment: attachment ?? null });
const permissionCard = (conversationId, request) => threads.append(PERSON, {
  conversationId,
  author: "automation",
  text: request.sentence,
  ask: {
    askId: request.requestId, kind: "permission", parks: true, timeoutMs: null, onTimeout: null, options: null, routes: null,
    consequences: request.consequences, missing: request.missing,
    control: { name: request.control.name, kind: request.control.kind }, permissionRequest: request
  }
});

const permission = {
  schemaVersion: "automation-studio.action-permission-request.v1",
  requestId: "request.e2e.schedule-post",
  requestedAtMs: Date.UTC(2026, 0, 15, 12, 0, 0),
  action: { kind: "flow_step", id: "node.press", ref: "step.3", verb: "press" },
  control: { name: "Schedule post", kind: "button" },
  consequences: ["send_or_publish", "create_new"],
  missing: ["send_or_publish", "create_new"],
  reason: { stage: "authoring", instructionIds: ["instruction.post"] },
  authority: { granted: [], instructed: [] },
  sentence: 'The Flow would press "Schedule post" (button) each time it runs, which would send or publish something. Neither its instruction nor a grant allows that, so the build stopped to ask.'
};
const destructive = {
  ...permission,
  requestId: "request.e2e.clear-drafts",
  action: { kind: "flow_step", id: "node.press", ref: "step.5", verb: "press" },
  control: { name: "Clear drafts", kind: "button" },
  consequences: ["delete"],
  missing: ["delete"],
  sentence: 'The run would press "Clear drafts" (button), which would delete something. Neither its instruction nor a grant allows that, so it stopped to ask.'
};

const build = (await threads.open(PERSON, { title: "Weekly post build" })).conversationId;
await say(build, "I looked at the page and found the Schedule post button.");
await permissionCard(build, permission);

const run = (await threads.open(PERSON, { title: "Cleanup run" })).conversationId;
await say(run, "The run reached the old drafts list.");
// Enough earlier turns that the question sits below the fold of the dock, so Show me has somewhere to scroll.
for (let step = 1; step <= 14; step += 1) await say(run, `Checked draft ${step} of 14 against the list.`);
await permissionCard(run, destructive);

const planning = (await threads.open(PERSON, { title: "Planning notes" })).conversationId;
await threads.append(PERSON, { conversationId: planning, author: "person", text: "Please show me what the proposed change does.", actorId: PERSON });
await say(planning, "Here is the change I would make to the Flow.", automationStudioFlowGraphDiffAttachment(flow.flowId, proposal.adaptationId));
await say(planning, "A better selector exists for the title.", { kind: "adaptation", ref: "adaptation:adaptation.e2e.1" });
await threads.append(PERSON, { conversationId: planning, author: "person", text: "Opened the Runs view.", actorId: PERSON, attachment: { kind: "panel-capability-result", ref: "result.e2e.1" } });
await say(planning, "Anything else you want changed?");

await threads.close();

// The small project's own threads, written through Core's conversations collaborator, the writer Core's own runs speak through.
const conversations = studio.conversations;
const choice = conversations.writerFor({ projectId, subject: { kind: "run", id: "run.e2e.cleanup-choice" }, title: "Cleanup choice" });
await choice.say("The run reached the old drafts list.");
await choice.ask({
  text: "Two drafts match. Which should I clear?",
  ask: {
    askId: "ask.e2e.which-draft", kind: "choice", parks: true,
    options: [{ id: "oldest", label: "Clear the oldest", route: null }, { id: "all", label: "Clear both", route: null }],
    consequences: ["delete"]
  }
});
const questions = conversations.writerFor({ projectId, subject: { kind: "project", id: projectId }, title: "Project questions" });
await questions.ask({ text: "What should the weekly post be called?", ask: { askId: "ask.e2e.name", kind: "open", parks: true } });
const projectThreads = { choice: await choice.conversationId(), open: await questions.conversationId() };

const seeded = { projectId, emptyProjectId: manifest.projects.empty.id, threads: { permission: build, destructive: run, planning }, projectThreads };
await writeFile(path.join(fixtureRoot, "chat-threads-manifest.json"), `${JSON.stringify(seeded, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(seeded, null, 2)}\n`);
await fluxiq.close?.();
