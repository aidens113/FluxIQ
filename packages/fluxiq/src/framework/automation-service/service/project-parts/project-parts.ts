// The project's parts library as a capability the service holds: search it, read a
// part, keep one, run one. Each method is its own file beside this one. It reads the
// service only through the ports it is given.
import type {
  GetProjectPartRequest,
  GetProjectPartResponse,
  ListProjectPartsResponse,
  RunProjectPartRequest,
  RunProjectPartResponse,
  SaveProjectPartRequest,
  SaveProjectPartResponse
} from "../../../../api-contracts/automation.ts";
import { AutomationStudioProjectPartControlKeys, automationStudioProjectPartControlKeys } from "./control-keys.ts";
import type { AutomationStudioKnownParts } from "../../../../runtime/project-parts/index.ts";
import { getProjectPart } from "./get.ts";
import { automationStudioPinnedPartGraphs } from "./graphs.ts";
import { automationStudioKeepPartCallsOf, type AutomationStudioSavedFlowGraph } from "./graph-calls.ts";
import type { AutomationStudioPinnedPartGraphs } from "../runtime-session/index.ts";
import type { AutomationStudioProjectPartsDependencies, AutomationStudioProjectPartsRefusal } from "./library-types.ts";
import { listProjectParts, type AutomationStudioListProjectPartsInput } from "./list.ts";
import { keepProjectPart } from "./keep.ts";
import { saveProjectPartsOfDraft, type AutomationStudioSaveProjectPartsOfDraftInput } from "./draft-parts.ts";
import { shortlistProjectParts, type AutomationStudioProjectPartsShortlistInput } from "./shortlist.ts";
import { runProjectPart, type AutomationStudioProjectPartRunInput, type AutomationStudioProjectPartRunRefusal, type AutomationStudioProjectPartRunResult } from "./run/index.ts";

export class AutomationStudioProjectParts {
  constructor(private readonly dependencies: AutomationStudioProjectPartsDependencies) {
    const { pool, run } = dependencies;
    if (pool && run) AutomationStudioProjectPartControlKeys.adopt(pool, () => automationStudioProjectPartControlKeys(run));
  }

  /** Parts by the person's words and by exact filters; each answer is a card. */
  list(input: AutomationStudioListProjectPartsInput): Promise<ListProjectPartsResponse | AutomationStudioProjectPartsRefusal> {
    return listProjectParts(this.dependencies.pool, input);
  }

  /** One part, with no page text in any of it. */
  get(input: GetProjectPartRequest): Promise<GetProjectPartResponse | AutomationStudioProjectPartsRefusal> {
    return getProjectPart(this.dependencies.pool, input);
  }

  /** A person's "save this": saved, or why not in plain words with its code. */
  save(input: SaveProjectPartRequest): Promise<SaveProjectPartResponse | AutomationStudioProjectPartsRefusal> {
    return keepProjectPart(this.dependencies, input);
  }

  /** The parts that may fit a request, up to five, or none: what the opening look of a build or an attempt offers (`./shortlist.ts`). Never throws. */
  shortlist(input: AutomationStudioProjectPartsShortlistInput): Promise<AutomationStudioKnownParts | undefined> {
    return shortlistProjectParts(this.dependencies.pool, input);
  }

  /** The parts of an answer-first attempt's saved draft, kept in the library; a failure is reported on the result and never thrown (`./draft-parts.ts`). */
  saveDraft(input: AutomationStudioSaveProjectPartsOfDraftInput): ReturnType<typeof saveProjectPartsOfDraft> {
    return saveProjectPartsOfDraft(this.dependencies.pool, input);
  }

  /** The library as one run of a Flow reads it, for the steps that pin a saved part (`./graphs.ts`). */
  graphs(projectId: string, parentFlowId: string): AutomationStudioPinnedPartGraphs {
    return automationStudioPinnedPartGraphs({ pool: this.dependencies.pool, projectId, parentFlowId });
  }

  /** A graph is about to be saved, and has been: its pinned calls are refused, then known, here (`./graph-calls.ts`). */
  flowGraphCalls(): AutomationStudioSavedFlowGraph {
    return automationStudioKeepPartCallsOf(this.dependencies.pool);
  }

  /** A person's run of one part, with no model, or why it was not run. */
  async run(input: RunProjectPartRequest): Promise<RunProjectPartResponse | AutomationStudioProjectPartRunRefusal> {
    const ran = await this.runAs({ ...input, caller: "person" });
    return "ok" in ran ? ran : ran.response;
  }

  /** The one runner, for whoever is asking: a build reads the acts its steps landed for its own ledger. */
  runAs(input: AutomationStudioProjectPartRunInput): Promise<AutomationStudioProjectPartRunResult | AutomationStudioProjectPartRunRefusal> {
    return runProjectPart(this.dependencies, input);
  }
}
