// Making a Flow and saying what it is for: the first thing anybody asks the
// panel for, and the thing the chat window most obviously ought to be able to
// do.
//
// Building it is two capabilities rather than one because the choice is real:
// `flow.build` authors from the instruction alone, and `flow.explore` opens the
// site and builds from what actually worked there. A person who says "build it"
// gets the first; one who says "try it on the website" gets the second.

import { generateFlowBootstrapAdaptation, generateFlowFromWebsiteExplorationAdaptation, saveFlowGenerationInstruction } from "../../../authoring";
import { saveFlowInstruction } from "../../../instructions";
import { automationStudioViewId } from "../../../views";
import { definePanelCapability, panelCapabilityResult, type PanelCapability } from "../contract";
import { PROJECT, FLOW, PIN } from "./argument";
import { str } from "./value";

export const FLOW_CAPABILITIES: readonly PanelCapability[] = [
  definePanelCapability({
    id: "flow.create",
    title: "Create a Flow",
    summary: "Makes a new, empty Flow in this project, ready to be described.",
    group: "Flows",
    phrases: ["new flow", "create a flow", "add a flow", "start a flow"],
    control: { view: automationStudioViewId.flowEditor, label: "New Flow" },
    endpoints: ["create-flow"],
    arguments: [PROJECT, { name: "name", kind: "text", describe: "What to call it.", required: true }],
    consequences: ["create_new"],
    invoke: async (context, args) => panelCapabilityResult(
      await context.transport.post("create-flow", { projectId: str(args, "projectId"), name: str(args, "name") }),
      "Created the Flow.",
      "The Flow could not be created."
    )
  }),
  definePanelCapability({
    id: "flow.describe",
    title: "Say what a Flow should do",
    summary: "Writes the instruction a Flow is built from, in your own words.",
    group: "Flows",
    phrases: ["describe the flow", "tell it what to do", "set the instruction", "write the instruction", "what should this flow do"],
    control: { view: automationStudioViewId.instructions, label: "Instruction" },
    endpoints: ["save-flow-generation-instruction"],
    arguments: [PROJECT, FLOW, { name: "instruction", kind: "text", describe: "What the Flow should achieve, in plain words.", required: true }],
    consequences: ["modify_existing"],
    invoke: async (context, args) => panelCapabilityResult(
      await saveFlowGenerationInstruction(context.transport, { projectId: str(args, "projectId"), flowId: str(args, "flowId"), instruction: str(args, "instruction") }),
      "Saved what this Flow should do.",
      "The instruction could not be saved."
    )
  }),
  definePanelCapability({
    id: "flow.build",
    title: "Build the Flow from its instruction",
    summary: "Has the model author the Flow's steps from the instruction already saved on it.",
    group: "Flows",
    phrases: ["build the flow", "generate the flow", "create the steps", "make it", "author the flow"],
    control: { view: automationStudioViewId.flowEditor, label: "Build from instruction" },
    endpoints: ["generate-flow-bootstrap-adaptation"],
    arguments: [PROJECT, FLOW, { name: "llmExecutionGrantId", kind: "id", describe: "The model-run grant to spend; `permission.allowModelRun` issues one.", required: true }],
    consequences: ["modify_existing"],
    invoke: async (context, args) => panelCapabilityResult(
      await generateFlowBootstrapAdaptation(context.transport, { projectId: str(args, "projectId"), flowId: str(args, "flowId"), llmExecutionGrantId: str(args, "llmExecutionGrantId") }),
      "Building the Flow from its instruction.",
      "The Flow could not be built."
    )
  }),
  definePanelCapability({
    id: "flow.explore",
    title: "Build the Flow by exploring the site",
    summary: "Opens the real website, works out what the instruction needs, and builds the Flow from what actually worked.",
    group: "Flows",
    phrases: ["explore the site", "try it on the website", "work it out live", "build it by exploring"],
    control: { view: automationStudioViewId.flowEditor, label: "Explore and build" },
    endpoints: ["generate-flow-bootstrap-adaptation"],
    arguments: [PROJECT, FLOW, { name: "llmExecutionGrantId", kind: "id", describe: "The model-run grant to spend.", required: true }],
    consequences: ["modify_existing"],
    invoke: async (context, args) => panelCapabilityResult(
      await generateFlowFromWebsiteExplorationAdaptation(context.transport, { projectId: str(args, "projectId"), flowId: str(args, "flowId"), llmExecutionGrantId: str(args, "llmExecutionGrantId") }),
      "Exploring the site and building the Flow from what worked.",
      "The exploration could not be started."
    )
  }),
  definePanelCapability({
    id: "flow.instruct",
    title: "Add a standing instruction to a Flow",
    summary: "Records an instruction the Flow follows every time it runs.",
    group: "Flows",
    phrases: ["add an instruction", "always do this", "remember this rule", "add a rule"],
    control: { view: automationStudioViewId.instructions, label: "Add instruction" },
    endpoints: ["save-flow-instruction"],
    arguments: [
      PROJECT,
      FLOW,
      { name: "text", kind: "text", describe: "The instruction itself.", required: true },
      { name: "title", kind: "text", describe: "A short name for it. Left out, it is the instruction's opening words.", required: false }
    ],
    consequences: ["modify_existing"],
    // Core stores an instruction as a title and a body, and refuses one
    // without both ("Instruction title and body are required."). It never read
    // `text`, which is what this sent until 2026-09-28.
    invoke: async (context, args) => panelCapabilityResult(
      await saveFlowInstruction(context.transport, {
        projectId: str(args, "projectId"),
        flowId: str(args, "flowId"),
        title: str(args, "title").trim() || instructionTitle(str(args, "text")),
        body: str(args, "text")
      }),
      "Added the instruction.",
      "The instruction could not be added."
    )
  }),
  definePanelCapability({
    id: "flow.delete",
    title: "Delete a Flow",
    summary: "Removes the Flow and everything it holds. Asks you to re-enter your PIN first.",
    group: "Flows",
    phrases: ["delete the flow", "remove the flow", "get rid of this flow", "throw the flow away"],
    control: { view: automationStudioViewId.flowEditor, label: "Delete Flow" },
    endpoints: ["delete-flow"],
    arguments: [PROJECT, FLOW, PIN],
    consequences: ["delete"],
    invoke: async (context, args) => panelCapabilityResult(
      await context.transport.post("delete-flow", { projectId: str(args, "projectId"), flowId: str(args, "flowId"), authorizationPin: str(args, "authorizationPin") }),
      "Deleted the Flow.",
      "The Flow could not be deleted."
    )
  })
];

/** The opening words of an instruction, as the title a person would have given it. */
function instructionTitle(text: string): string {
  const firstLine = text.trim().split(/\r?\n/u)[0] ?? "";
  const sentence = firstLine.split(/(?<=[.!?])\s/u)[0] ?? firstLine;
  return sentence.length > 80 ? `${sentence.slice(0, 77).trimEnd()}...` : sentence;
}
