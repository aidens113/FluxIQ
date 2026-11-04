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
import { getProjectPart } from "./get.ts";
import type { AutomationStudioProjectPartsDependencies, AutomationStudioProjectPartsRefusal } from "./library-types.ts";
import { listProjectParts, type AutomationStudioListProjectPartsInput } from "./list.ts";
import { keepProjectPart } from "./keep.ts";
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
