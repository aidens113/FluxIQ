// Writes the conversation threads the chat widget spec reads, into the isolated fixture root
// (`apps/web/.e2e-host`, made by `fixture:e2e`). It runs while no server has the root open, and it
// calls no model: every turn goes in through Core's public conversations collaborator
// (`fluxiq.programs.automationStudio.conversations`), the same writer Core's own runs speak through.
//
// Seeded in the "small" project (UI Fixture - Small):
//   - a build thread holding a pending permission ask (send_or_publish, create_new)
//   - a run thread holding a pending choice ask whose options are destructive (consequence: delete), below 14 filler turns
//   - a project thread with an open ask, a flow-graph-diff attachment, an adaptation reference and the
//     panel's own `panel-capability-result` record after a person's turn.
// The "empty" project is left without threads.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FluxIQ } from "fluxiq";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.resolve(process.env.FLUXIQ_E2E_FIXTURE_ROOT ?? path.join(webRoot, ".e2e-host"));
if (!(await readFile(path.join(fixtureRoot, ".fluxiq-e2e-fixture-root"), "utf8").then(() => true, () => false))) {
  throw new Error("Refusing to seed: the root is not a marked e2e fixture root.");
}
const manifest = JSON.parse(await readFile(path.join(fixtureRoot, "fixture-manifest.json"), "utf8"));
const projectId = manifest.projects.small.id;

const fluxiq = FluxIQ.create({ rootDir: fixtureRoot, loadEnv: false });
await fluxiq.setup();
const conversations = fluxiq.programs.automationStudio.conversations;

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

const build = conversations.writerFor({ projectId, subject: { kind: "build", id: "build.e2e.weekly-post" }, title: "Weekly post build" });
await build.say("I looked at the page and found the Schedule post button.");
await build.askPermission(permission);

const run = conversations.writerFor({ projectId, subject: { kind: "run", id: "run.e2e.cleanup" }, title: "Cleanup run" });
await run.say("The run reached the old drafts list.");
// Enough earlier turns that the question sits below the fold of the window, so Show me has somewhere to scroll.
for (let step = 1; step <= 14; step += 1) await run.say(`Checked draft ${step} of 14 against the list.`);
await run.ask({
  text: "Two drafts match. Which should I clear?",
  ask: {
    askId: "ask.e2e.which-draft", kind: "choice", parks: true,
    options: [{ id: "oldest", label: "Clear the oldest", route: null }, { id: "all", label: "Clear both", route: null }],
    consequences: ["delete"]
  }
});

const project = conversations.writerFor({ projectId, subject: { kind: "project", id: projectId }, title: "Planning notes" });
const conversationId = await project.conversationId();
await conversations.appendTurn({ projectId, conversationId, text: "Please show me what the proposed change does.", actorId: "admin" });
await project.say("Here is the change I would make to the Flow.", { kind: "flow-graph-diff", ref: "diff.e2e.1" });
await project.say("A better selector exists for the title.", { kind: "adaptation", ref: "adaptation:adaptation.e2e.1" });
await conversations.appendTurn({ projectId, conversationId, text: "Opened the Runs view.", actorId: "admin", attachment: { kind: "panel-capability-result", ref: "result.e2e.1" } });
await project.ask({
  text: "What should the weekly post be called?",
  ask: { askId: "ask.e2e.name", kind: "open", parks: true }
});

const seeded = { projectId, emptyProjectId: manifest.projects.empty.id, threads: {
  permission: await build.conversationId(), choice: await run.conversationId(), project: conversationId
} };
await writeFile(path.join(fixtureRoot, "chat-threads-manifest.json"), `${JSON.stringify(seeded, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(seeded, null, 2)}\n`);
await fluxiq.close?.();
