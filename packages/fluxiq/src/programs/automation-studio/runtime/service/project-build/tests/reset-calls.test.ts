import { describe, expect, it } from "vitest";
import { AutomationStudioSiteResetProjectLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import { automationStudioProjectBuildResetCalls } from "../reset-calls.ts";

const read = (subjects: string[]) => ({ state: {}, differs: [], scope: "p:destination", location: "destination", subjects, collections: [{ scope: "p:destination", group: "g:page", subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) }] });
const add = { callId: "add", toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate" as const, consequences: ["create_new" as const], control: { name: "Add", kind: "button", subject: "s:document" }, verb: "press" } };
const deletion = { effect: "mutate" as const, consequences: ["delete" as const], control: { subject: "s:document", scope: "p:destination" } };

describe("project reset observation routing", () => {
  it("keeps the builder's pre-effect destination witness and routes reset observations back to its owner", async () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const builder = project.forBrief("builder");
    const building = automationStudioProjectBuildResetCalls(project, builder);
    building.observed(read([]));
    building.explored(add);
    const reset = automationStudioProjectBuildResetCalls(project, project.forBrief("reset"));
    reset.observed(read(["s:document"]));
    expect(reset.target("act-1", deletion)).toEqual({ kind: "admit", on: "subject", allowed: ["delete"] });
    reset.explored({ ...add, callId: "undo", undoes: "act-1", on: "subject", declared: { ...add.declared, consequences: ["delete"], control: { name: "Remove", kind: "button", ...deletion.control } } });
    reset.observed(read([]));
    expect(await builder.beforeTrial(async () => ({ moved: false }))).toEqual({ kind: "admit" });
  });

  it("never seeds another builder's baseline from observations of an independent resource", () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const other = project.forBrief("other");
    other.explored({ ...add, declared: { ...add.declared, consequences: [] } });
    const first = automationStudioProjectBuildResetCalls(project, project.forBrief("first"));
    first.observed(read([]));
    other.explored(add);
    const second = automationStudioProjectBuildResetCalls(project, other);
    second.observed(read(["s:document"]));
    const act = other.actOf("add")!;
    expect(second.target(act, deletion)).toMatchObject({ kind: "refused" });
  });
});
