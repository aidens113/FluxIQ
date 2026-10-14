import { automationStudioActionDeclarationCrossCheck, type AutomationStudioActionPermissionRequest, type AutomationStudioInstructedConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioFlowBootstrapActionPermissions } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioProjectBuildPorts } from "./types.ts";

// Every permission gate of one project build, read as one at promotion (t551).
//
// A candidate build has one gate, and its promotion reads what that gate says
// (`../flow-bootstrap-commands/permission-outcome.ts`): what each action
// declared, the instruction's read, Core's cross-check of the two, and the
// request a refusal raised. A project build has one gate per brief beside the
// build's own (`./brief-ports.ts`), so reading the build's gate alone hid every
// builder's answer: a person's no to a builder's step never reached the
// proposal. This is the build's gate with every brief gate's answers in it, so
// a declined act anywhere in the build is seen at promotion as a candidate
// build's own is.
//
// - `declarations`: every brief gate's, in the order the briefs' gates were
//   made, then the build's own (the assembled Flow's steps come last).
// - `request`: the latest standing request of any gate, by when it was raised.
//   Each gate keeps carrying a declined request while a step of its own Flow
//   still needs it (`action-permissions/gate.ts`, `request`), so a no that still
//   bars the Flow stands, and one the build went on without does not.
// - `instructed`: the instruction's one read, which every gate shares
//   (`service/instruction-authority.ts` reads it once).
// - `crossCheck`: the build's gate says its own finding in the thread, as a
//   candidate build's does; the finding returned is Core's reading of every
//   gate's declarations together against that read.

const BUILDS = new WeakMap<AutomationStudioProjectBuildPorts, AutomationStudioProjectBuildPermissions>();

export class AutomationStudioProjectBuildPermissions {
  private readonly briefs: AutomationStudioFlowBootstrapActionPermissions[] = [];

  private constructor(private readonly project: AutomationStudioProjectBuildPorts) {}

  /** The build's one record of brief gates, made on first ask. */
  static of(project: AutomationStudioProjectBuildPorts): AutomationStudioProjectBuildPermissions {
    const known = BUILDS.get(project);
    if (known) return known;
    const made = new AutomationStudioProjectBuildPermissions(project);
    BUILDS.set(project, made);
    return made;
  }

  /** A brief's gate, as it is made. */
  add(gate: AutomationStudioFlowBootstrapActionPermissions): void {
    this.briefs.push(gate);
  }

  /** The build's gate `build`, answering for every gate of the build. */
  view(build: AutomationStudioFlowBootstrapActionPermissions): AutomationStudioFlowBootstrapActionPermissions {
    const gates = () => [...this.briefs, build];
    const declarations = () => gates().flatMap((gate) => gate.declarations());
    const instructed = () => gates().map((gate) => gate.instructed()).find((entries) => entries !== undefined);
    return {
      ...build,
      request: () => latest(gates().map((gate) => gate.request())),
      declarations,
      instructed,
      crossCheck: async () => {
        await build.crossCheck();
        const all = declarations();
        // Undo records are the build putting the site back: a build that did nothing else has nothing to compare.
        if (!all.some((record) => record.undoes === undefined)) return undefined;
        return automationStudioActionDeclarationCrossCheck({ declarations: all, instructed: instructed() ?? (await this.read()) });
      }
    };
  }

  /**
   * The instruction's read when no gate has read it yet: the build's one read
   * (`service/instruction-authority.ts`), asked now. A read that fails is
   * thrown, not read as nothing asked for: a finding Core could not make is
   * not a clean one. A build with no reader has nothing to derive.
   */
  private async read(): Promise<readonly AutomationStudioInstructedConsequence[]> {
    const derive = this.project.permissions.deriveInstructed;
    return derive ? await derive() : [];
  }
}

function latest(requests: ReadonlyArray<AutomationStudioActionPermissionRequest | undefined>): AutomationStudioActionPermissionRequest | undefined {
  let found: AutomationStudioActionPermissionRequest | undefined;
  for (const request of requests) if (request && (!found || request.requestedAtMs >= found.requestedAtMs)) found = request;
  return found;
}
